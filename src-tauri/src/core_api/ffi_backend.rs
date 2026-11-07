//! release-ffi 链路：内核 cdylib 在编译期嵌入 exe，运行时释放后用 libloading 加载，
//! JSON 进出。发布包因此只有一个 exe，不再随包分发 dll。
//!
//! 库文件来源顺序：
//!   1. `AELUX_CORE_LIB` 环境变量（运行时调试：临时指定外部库）
//!   2. 编译期嵌入的字节流（build.rs 注入路径，发布包唯一来源）
//!      运行时释放到应用缓存目录 `runtime/<版本>/`，不污染安装目录。

use std::ffi::{c_char, CStr, CString};
use std::path::PathBuf;
use std::sync::OnceLock;

use serde_json::Value;
use tauri::Manager;

use crate::dto::{
    Account, AccountSession, AuthServer, DeviceCodeSession, GameInstance, InstallResult,
    JavaInstallResult, JavaRuntime, LaunchOutcome, LauncherConfig, LocalContentItem, ModUpdate,
    ModpackImportResult, OsInfo, RunningGame, StoredAccount, VersionManifest,
};

use super::CoreError;

/// FFI 符号签名（与 aelux-core/src/ffi.rs 的导出一一对应）。
type InvokeFn =
    unsafe extern "C" fn(method: *const c_char, payload_json: *const c_char) -> *mut c_char;
type VersionFn = unsafe extern "C" fn() -> *mut c_char;
type FreeFn = unsafe extern "C" fn(ptr: *mut c_char);

struct CoreLib {
    invoke: InvokeFn,
    version: VersionFn,
    free: FreeFn,
}

static LIB: OnceLock<CoreLib> = OnceLock::new();

/// 编译期嵌入的内核动态库（build.rs 注入绝对路径）。
static EMBEDDED_CORE: &[u8] = include_bytes!(env!("AELUX_CORE_LIB"));

fn lib_file_name() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "aelux_core.dll"
    }
    #[cfg(target_os = "macos")]
    {
        "libaelux_core.dylib"
    }
    #[cfg(target_os = "linux")]
    {
        "libaelux_core.so"
    }
}

/// 解析库文件路径：显式环境变量优先，否则释放嵌入的库。
fn resolve_lib_path(app: &tauri::AppHandle) -> PathBuf {
    if let Ok(env_path) = std::env::var("AELUX_CORE_LIB") {
        let p = PathBuf::from(env_path);
        if p.exists() {
            return p;
        }
    }
    materialize_embedded(app)
}

/// 把嵌入的库释放到应用缓存目录 `runtime/<启动器版本>/<库文件名>`，返回可加载路径。
/// 按版本分目录：换身更新时新旧进程并存，不会因文件被占用而释放失败。
fn materialize_embedded(app: &tauri::AppHandle) -> PathBuf {
    let root = runtime_root(app);
    let dir = root.join(env!("CARGO_PKG_VERSION"));
    let path = dir.join(lib_file_name());
    if !path.is_file() {
        std::fs::create_dir_all(&dir).expect("创建内核运行目录失败");
        // 先写临时文件再改名：避免崩溃留下半截库文件被下次启动加载
        let tmp = dir.join(format!("{}.tmp", lib_file_name()));
        std::fs::write(&tmp, EMBEDDED_CORE).expect("释放内核动态库失败");
        if let Err(e) = std::fs::rename(&tmp, &path) {
            let _ = std::fs::remove_file(&tmp);
            // 另一实例已先一步就位（Windows 上覆盖运行中的库会失败）
            if !path.is_file() {
                panic!("内核动态库就位失败: {e}");
            }
        }
    }
    // 旧版本目录不再需要（旧进程占用时删除失败，下次启动再清）
    if let Ok(entries) = std::fs::read_dir(&root) {
        for entry in entries.flatten() {
            if entry.path() != dir {
                let _ = std::fs::remove_dir_all(entry.path());
            }
        }
    }
    path
}

/// 释放目录根：应用缓存目录（始终可写，安装到 Program Files 也不受影响）。
fn runtime_root(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_cache_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("aelux-launcher"))
        .join("runtime")
}

/// 初始化：解析并加载动态库。失败即 panic（发布链路缺内核等于残废）。
pub fn init(app: &tauri::AppHandle) {
    let path = resolve_lib_path(app);
    unsafe {
        let lib =
            libloading::Library::new(&path).unwrap_or_else(|e| panic!("加载 {path:?} 失败: {e}"));
        // 泄漏：动态库必须活到进程结束
        let lib: &'static libloading::Library = Box::leak(Box::new(lib));
        let invoke: InvokeFn = *lib.get(b"aelux_invoke").expect("缺少符号 aelux_invoke");
        let version: VersionFn = *lib
            .get(b"aelux_core_version")
            .expect("缺少符号 aelux_core_version");
        let free: FreeFn = *lib
            .get(b"aelux_string_free")
            .expect("缺少符号 aelux_string_free");
        let _ = LIB.set(CoreLib {
            invoke,
            version,
            free,
        });
    }
    tracing::info!(path = %path.display(), "aelux-core 动态库已加载");
}

/// 调用内核方法（阻塞 → spawn_blocking，避免占死异步线程）。
async fn invoke(method: &str, payload: &Value) -> Result<Value, CoreError> {
    let method = method.to_string();
    let payload = payload.to_string();
    tauri::async_runtime::spawn_blocking(move || -> Result<Value, CoreError> {
        let lib = LIB.get().expect("内核动态库未初始化");
        let c_method = CString::new(method).map_err(|e| e.to_string())?;
        let c_payload = CString::new(payload).map_err(|e| e.to_string())?;
        unsafe {
            let raw = (lib.invoke)(c_method.as_ptr(), c_payload.as_ptr());
            if raw.is_null() {
                return Err("内核返回空指针".into());
            }
            let json = CStr::from_ptr(raw).to_string_lossy().into_owned();
            (lib.free)(raw);
            let parsed: Value =
                serde_json::from_str(&json).map_err(|e| format!("内核返回非法 JSON: {e}"))?;
            match parsed.get("ok").and_then(|v| v.as_bool()) {
                Some(true) => Ok(parsed.get("data").cloned().unwrap_or(Value::Null)),
                Some(false) => Err(core_error_message(
                    parsed.get("error").unwrap_or(&Value::Null),
                )),
                None => Err("内核返回缺少 ok 字段".into()),
            }
        }
    })
    .await
    .map_err(|e| format!("内核调用任务失败: {e}"))?
}

pub async fn loader_versions(loader: String, mc_version: String) -> Result<Vec<String>, CoreError> {
    let value = invoke(
        "loaders.versions",
        &serde_json::json!({ "loader": loader, "mc_version": mc_version }),
    )
    .await?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub async fn mod_api_versions(api: String, mc_version: String) -> Result<Vec<String>, CoreError> {
    let value = invoke(
        "modapis.versions",
        &serde_json::json!({ "api": api, "mc_version": mc_version }),
    )
    .await?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn get_data_dir() -> String {
    invoke_sync("data_dir.get", &Value::Null)
        .ok()
        .and_then(|v| v.as_str().map(str::to_string))
        .unwrap_or_default()
}

pub fn get_core_version() -> String {
    let lib = LIB.get().expect("内核动态库未初始化");
    unsafe {
        let raw = (lib.version)();
        let s = CStr::from_ptr(raw).to_string_lossy().into_owned();
        (lib.free)(raw);
        serde_json::from_str::<Value>(&s)
            .ok()
            .and_then(|v| v.get("data").and_then(|d| d.as_str()).map(str::to_string))
            .unwrap_or_default()
    }
}

/// 同步快捷调用（data_dir / os_info 这类轻量方法）。
fn invoke_sync(method: &str, payload: &Value) -> Result<Value, CoreError> {
    let lib = LIB.get().expect("内核动态库未初始化");
    let c_method = CString::new(method).map_err(|e| e.to_string())?;
    let c_payload = CString::new(payload.to_string()).map_err(|e| e.to_string())?;
    unsafe {
        let raw = (lib.invoke)(c_method.as_ptr(), c_payload.as_ptr());
        if raw.is_null() {
            return Err("内核返回空指针".into());
        }
        let json = CStr::from_ptr(raw).to_string_lossy().into_owned();
        (lib.free)(raw);
        let parsed: Value = serde_json::from_str(&json).map_err(|e| e.to_string())?;
        match parsed.get("ok").and_then(|v| v.as_bool()) {
            Some(true) => Ok(parsed.get("data").cloned().unwrap_or(Value::Null)),
            Some(false) => Err(core_error_message(
                parsed.get("error").unwrap_or(&Value::Null),
            )),
            None => Err("内核返回缺少 ok 字段".into()),
        }
    }
}

/// 内核 `CoreError` 在 FFI 里是外部标签枚举（`{"Json":"..."}` / `{"HashMismatch":{...}}`），
/// 这里转成与内核 `Display` 一致的文本，避免发布链路只显示一句笼统的「内核错误」。
fn core_error_message(error: &Value) -> String {
    if let Some(text) = error.as_str() {
        return if text == "Cancelled" {
            "下载已取消".into()
        } else {
            text.to_string()
        };
    }
    let Some((kind, detail)) = error.as_object().and_then(|o| o.iter().next()) else {
        return "内核错误".into();
    };
    let prefix = match kind.as_str() {
        "Io" => "IO 错误",
        "Network" => "网络错误",
        "Json" => "数据解析错误",
        "HashMismatch" => "校验失败",
        "Config" => "配置错误",
        "Instance" => "实例错误",
        "Auth" => "账户错误",
        "Keyring" => "凭证存储错误",
        "NotFound" => "未找到",
        "InvalidInput" => "参数错误",
        _ => return format!("{kind}: {detail}"),
    };
    let detail = match detail {
        Value::String(s) => s.clone(),
        Value::Object(map) => map
            .iter()
            .map(|(k, v)| {
                let value = v
                    .as_str()
                    .map(str::to_string)
                    .unwrap_or_else(|| v.to_string());
                format!("{k}={value}")
            })
            .collect::<Vec<_>>()
            .join(", "),
        other => other.to_string(),
    };
    if detail.is_empty() {
        prefix.to_string()
    } else {
        format!("{prefix}: {detail}")
    }
}

pub fn get_os_info() -> Result<OsInfo, CoreError> {
    let value = invoke_sync("os.info", &Value::Null)?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub async fn fetch_json(url: String) -> Result<String, CoreError> {
    let value = invoke("fetch.json", &serde_json::json!({ "url": url })).await?;
    value
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| "内核返回类型错误".into())
}

pub async fn curseforge_fetch(path: String) -> Result<String, CoreError> {
    let value = invoke("curseforge.fetch", &serde_json::json!({ "path": path })).await?;
    value
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| "内核返回类型错误".into())
}

pub async fn download_file(
    url: String,
    dest: String,
    sha1: Option<String>,
    task_id: Option<String>,
    name: Option<String>,
) -> Result<String, CoreError> {
    let value = invoke(
        "download.file",
        &serde_json::json!({
            "url": url,
            "dest": dest,
            "sha1": sha1,
            "taskId": task_id,
            "name": name,
        }),
    )
    .await?;
    value
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| "内核返回类型错误".into())
}

pub async fn fetch_minecraft_manifest() -> Result<VersionManifest, CoreError> {
    let value = invoke("minecraft.manifest", &Value::Null).await?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub async fn auth_start_device_flow() -> Result<DeviceCodeSession, CoreError> {
    let value = invoke("auth.ms.start", &Value::Null).await?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub async fn auth_poll_device_flow(session: DeviceCodeSession) -> Result<Account, CoreError> {
    let value = invoke(
        "auth.ms.poll",
        &serde_json::to_value(session).map_err(|e| e.to_string())?,
    )
    .await?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn auth_logout(msa_id: String) -> Result<(), CoreError> {
    invoke_sync("auth.ms.logout", &serde_json::json!({ "msa_id": msa_id }))?;
    Ok(())
}

pub fn list_instances() -> Result<Vec<GameInstance>, CoreError> {
    let value = invoke_sync("instances.list", &Value::Null)?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn create_instance(
    name: String,
    version: String,
    loader: Option<String>,
    loader_version: Option<String>,
) -> Result<GameInstance, CoreError> {
    let value = invoke_sync(
        "instances.create",
        &serde_json::json!({
            "name": name,
            "version": version,
            "loader": loader,
            "loader_version": loader_version,
        }),
    )?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn delete_instance(id: String) -> Result<(), CoreError> {
    invoke_sync("instances.delete", &serde_json::json!({ "id": id }))?;
    Ok(())
}

/* ----------------------- 账户 / 会话 / 认证服务器 ----------------------- */

pub fn accounts_list() -> Result<Vec<StoredAccount>, CoreError> {
    let value = invoke_sync("accounts.list", &Value::Null)?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn accounts_upsert(account: StoredAccount) -> Result<(), CoreError> {
    let value = serde_json::to_value(account).map_err(|e| e.to_string())?;
    invoke_sync("accounts.upsert", &value)?;
    Ok(())
}

pub fn accounts_remove(id: String) -> Result<(), CoreError> {
    invoke_sync("accounts.remove", &serde_json::json!({ "id": id }))?;
    Ok(())
}

pub fn account_session_get() -> Result<Option<AccountSession>, CoreError> {
    let value = invoke_sync("accounts.session.get", &Value::Null)?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn account_session_set(session: Option<AccountSession>) -> Result<(), CoreError> {
    invoke_sync(
        "accounts.session.set",
        &serde_json::json!({ "session": session }),
    )?;
    Ok(())
}

pub fn account_login_offline(username: String) -> Result<StoredAccount, CoreError> {
    let value = invoke_sync(
        "accounts.login_offline",
        &serde_json::json!({ "username": username }),
    )?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn auth_servers_list() -> Result<Vec<AuthServer>, CoreError> {
    let value = invoke_sync("authservers.list", &Value::Null)?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn auth_server_add(name: Option<String>, url: String) -> Result<AuthServer, CoreError> {
    let value = invoke_sync(
        "authservers.add",
        &serde_json::json!({ "name": name, "url": url }),
    )?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn auth_server_remove(id: String) -> Result<(), CoreError> {
    invoke_sync("authservers.remove", &serde_json::json!({ "id": id }))?;
    Ok(())
}

pub fn kv_get(key: String) -> Option<String> {
    invoke_sync("kv.get", &serde_json::json!({ "key": key }))
        .ok()
        .and_then(|v| v.as_str().map(str::to_string))
}

pub fn kv_set(key: String, value: String) -> Result<(), CoreError> {
    invoke_sync("kv.set", &serde_json::json!({ "key": key, "value": value }))?;
    Ok(())
}

pub fn kv_remove(key: String) -> Result<(), CoreError> {
    invoke_sync("kv.remove", &serde_json::json!({ "key": key }))?;
    Ok(())
}

pub fn get_config() -> Result<LauncherConfig, CoreError> {
    let value = invoke_sync("config.get", &Value::Null)?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn save_config(config: LauncherConfig) -> Result<(), CoreError> {
    let value = serde_json::to_value(config).map_err(|e| e.to_string())?;
    invoke_sync("config.save", &value)?;
    Ok(())
}

pub fn cache_dir() -> String {
    invoke_sync("cache.dir", &Value::Null)
        .ok()
        .and_then(|v| v.as_str().map(str::to_string))
        .unwrap_or_default()
}

pub fn clear_cache() -> Result<u32, CoreError> {
    let value = invoke_sync("cache.clear", &Value::Null)?;
    Ok(value.as_u64().unwrap_or(0) as u32)
}

/* --------------------------- Java / 本地内容 --------------------------- */

pub fn scan_java() -> Result<Vec<JavaRuntime>, CoreError> {
    let value = invoke_sync("java.scan", &Value::Null)?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn required_java(mc_version: String) -> u32 {
    invoke_sync(
        "java.required_major",
        &serde_json::json!({ "mc_version": mc_version }),
    )
    .ok()
    .and_then(|v| v.as_u64())
    .and_then(|v| u32::try_from(v).ok())
    .unwrap_or(17)
}

pub fn get_instance_dir(id: String) -> Result<String, CoreError> {
    let value = invoke_sync("instance.dir", &serde_json::json!({ "id": id }))?;
    value
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| "内核返回类型错误".into())
}

pub fn list_content(instance_id: String, kind: String) -> Result<Vec<LocalContentItem>, CoreError> {
    let value = invoke_sync(
        "content.list",
        &serde_json::json!({ "instance_id": instance_id, "kind": kind }),
    )?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn set_content_enabled(
    instance_id: String,
    kind: String,
    file_name: String,
    enabled: bool,
) -> Result<(), CoreError> {
    invoke_sync(
        "content.set_enabled",
        &serde_json::json!({
            "instance_id": instance_id,
            "kind": kind,
            "file_name": file_name,
            "enabled": enabled,
        }),
    )?;
    Ok(())
}

pub fn delete_content(
    instance_id: String,
    kind: String,
    file_name: String,
) -> Result<(), CoreError> {
    invoke_sync(
        "content.delete",
        &serde_json::json!({ "instance_id": instance_id, "kind": kind, "file_name": file_name }),
    )?;
    Ok(())
}

pub fn import_content(
    instance_id: String,
    kind: String,
    source: String,
) -> Result<LocalContentItem, CoreError> {
    let value = invoke_sync(
        "content.import",
        &serde_json::json!({ "instance_id": instance_id, "kind": kind, "source": source }),
    )?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn read_text(path: String) -> Result<Option<String>, CoreError> {
    let value = invoke_sync("files.read_text", &serde_json::json!({ "path": path }))?;
    if value.is_null() {
        Ok(None)
    } else {
        serde_json::from_value(value).map_err(|e| e.to_string())
    }
}

pub fn write_text(path: String, content: String) -> Result<(), CoreError> {
    invoke_sync(
        "files.write_text",
        &serde_json::json!({ "path": path, "content": content }),
    )?;
    Ok(())
}

pub fn delete_path(path: String) -> Result<(), CoreError> {
    invoke_sync("files.delete", &serde_json::json!({ "path": path }))?;
    Ok(())
}

pub fn rename_path(from: String, to: String) -> Result<(), CoreError> {
    invoke_sync(
        "files.rename",
        &serde_json::json!({ "from": from, "to": to }),
    )?;
    Ok(())
}

/* ---------------------------- 安装 / 启动 / 市场 ---------------------------- */

pub async fn install_version(
    mc_version: String,
    loader: String,
    loader_version: Option<String>,
) -> Result<InstallResult, CoreError> {
    let value = invoke(
        "installer.version",
        &serde_json::json!({
            "mc_version": mc_version,
            "loader": loader,
            "loader_version": loader_version,
        }),
    )
    .await?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub async fn install_instance(id: String) -> Result<InstallResult, CoreError> {
    let value = invoke("installer.instance", &serde_json::json!({ "id": id })).await?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub async fn set_instance_loader(
    id: String,
    loader: String,
    loader_version: Option<String>,
) -> Result<InstallResult, CoreError> {
    let value = invoke(
        "installer.set_loader",
        &serde_json::json!({ "id": id, "loader": loader, "loader_version": loader_version }),
    )
    .await?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn cancel_download() -> Result<(), CoreError> {
    invoke_sync("downloads.cancel", &Value::Null).map(|_| ())
}

pub async fn launch_instance(id: String) -> Result<LaunchOutcome, CoreError> {
    let value = invoke("launch.start", &serde_json::json!({ "id": id })).await?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn kill_instance(id: String) -> bool {
    invoke_sync("launch.kill", &serde_json::json!({ "id": id }))
        .ok()
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

pub fn cancel_launch(id: String) -> bool {
    invoke_sync("launch.cancel", &serde_json::json!({ "id": id }))
        .ok()
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

pub fn running_instances() -> Result<Vec<RunningGame>, CoreError> {
    let value = invoke_sync("launch.running", &Value::Null)?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub async fn export_launch_script(id: String) -> Result<String, CoreError> {
    let value = invoke("launch.export_script", &serde_json::json!({ "id": id })).await?;
    value
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| "内核返回类型错误".into())
}

pub fn backup_world(instance_id: String, file_name: String) -> Result<String, CoreError> {
    let value = invoke_sync(
        "content.backup_world",
        &serde_json::json!({ "instance_id": instance_id, "file_name": file_name }),
    )?;
    value
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| "内核返回类型错误".into())
}

pub async fn authlib_login(
    server_id: String,
    username: String,
    password: String,
) -> Result<StoredAccount, CoreError> {
    let value = invoke(
        "authlib.login",
        &serde_json::json!({ "server_id": server_id, "username": username, "password": password }),
    )
    .await?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub async fn authlib_refresh(account_id: String) -> Result<StoredAccount, CoreError> {
    let value = invoke(
        "authlib.refresh",
        &serde_json::json!({ "account_id": account_id }),
    )
    .await?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub async fn refresh_microsoft_account(account_id: String) -> Result<StoredAccount, CoreError> {
    let value = invoke(
        "auth.ms.refresh",
        &serde_json::json!({ "account_id": account_id }),
    )
    .await?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub async fn install_resource(
    instance_id: String,
    kind: String,
    url: String,
    file_name: String,
    sha1: Option<String>,
) -> Result<LocalContentItem, CoreError> {
    let value = invoke(
        "market.install_resource",
        &serde_json::json!({
            "instance_id": instance_id,
            "kind": kind,
            "url": url,
            "file_name": file_name,
            "sha1": sha1,
        }),
    )
    .await?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub async fn check_mod_updates(instance_id: String) -> Result<Vec<ModUpdate>, CoreError> {
    let value = invoke(
        "market.check_updates",
        &serde_json::json!({ "instance_id": instance_id }),
    )
    .await?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub async fn install_mod_api(
    instance_id: String,
    api: String,
    mc_version: String,
    version: Option<String>,
) -> Result<LocalContentItem, CoreError> {
    let value = invoke(
        "market.install_mod_api",
        &serde_json::json!({
            "instance_id": instance_id,
            "api": api,
            "mc_version": mc_version,
            "version": version,
        }),
    )
    .await?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn export_modpack(instance_id: String) -> Result<String, CoreError> {
    let value = invoke_sync(
        "modpack.export",
        &serde_json::json!({ "instance_id": instance_id }),
    )?;
    value
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| "内核返回类型错误".into())
}

pub async fn import_modpack(
    source: String,
    name: Option<String>,
) -> Result<ModpackImportResult, CoreError> {
    let value = invoke(
        "modpack.import",
        &serde_json::json!({ "source": source, "name": name }),
    )
    .await?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub async fn import_modpack_url(
    url: String,
    name: Option<String>,
) -> Result<ModpackImportResult, CoreError> {
    let value = invoke(
        "modpack.import_url",
        &serde_json::json!({ "url": url, "name": name }),
    )
    .await?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub async fn install_java(major: u32) -> Result<JavaInstallResult, CoreError> {
    let value = invoke("java.install", &serde_json::json!({ "major": major })).await?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn probe_java(path: String) -> Result<JavaRuntime, CoreError> {
    let value = invoke_sync("java.probe", &serde_json::json!({ "path": path }))?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}
