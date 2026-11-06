//! release-ffi 链路：libloading 加载 aelux-core cdylib，JSON 进出。
//!
//! 库文件查找顺序：
//!   1. `AELUX_CORE_LIB` 环境变量（build.rs 在打包时注入）
//!   2. Tauri 资源目录 `lib/<platform>/`（安装包自带）
//!   3. exe 同级 `lib/<platform>/`（便携 ZIP 手动放置）
//!   4. 仓库内 `src-tauri/lib/<platform>/`（本地打包测试）

use std::ffi::{c_char, CStr, CString};
use std::sync::OnceLock;

use serde_json::Value;
use tauri::Manager;

use crate::dto::{
    Account, AccountSession, AuthServer, DeviceCodeSession, GameInstance, LauncherConfig, OsInfo, StoredAccount, VersionManifest,
};

use super::CoreError;

/// FFI 符号签名（与 aelux-core/src/ffi.rs 的导出一一对应）。
type InvokeFn = unsafe extern "C" fn(method: *const c_char, payload_json: *const c_char) -> *mut c_char;
type VersionFn = unsafe extern "C" fn() -> *mut c_char;
type FreeFn = unsafe extern "C" fn(ptr: *mut c_char);

struct CoreLib {
    invoke: InvokeFn,
    version: VersionFn,
    free: FreeFn,
}

static LIB: OnceLock<CoreLib> = OnceLock::new();

/// 平台子目录名，与 build.rs / manifest.json 的键一致。
fn platform_key() -> &'static str {
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        "windows-x64"
    }
    #[cfg(all(target_os = "windows", target_arch = "aarch64"))]
    {
        "windows-arm64"
    }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        "macos-arm64"
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        "macos-x64"
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        "linux-x64"
    }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        "linux-arm64"
    }
}

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

/// 解析库文件路径（不做加载）。
fn resolve_lib_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    let name = lib_file_name();
    if let Ok(env_path) = std::env::var("AELUX_CORE_LIB") {
        let p = std::path::PathBuf::from(env_path);
        if p.exists() {
            return Some(p);
        }
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        let p = resource_dir.join("lib").join(platform_key()).join(name);
        if p.exists() {
            return Some(p);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let p = parent.join("lib").join(platform_key()).join(name);
            if p.exists() {
                return Some(p);
            }
            // 便携布局：exe 同级直接放 dll
            let p = parent.join(name);
            if p.exists() {
                return Some(p);
            }
        }
    }
    // 本地打包测试：源码树内
    let dev = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("lib")
        .join(platform_key())
        .join(name);
    dev.exists().then_some(dev)
}

/// 初始化：解析并加载动态库。失败即 panic（发布链路缺内核等于残废）。
pub fn init(app: &tauri::AppHandle) {
    let path = resolve_lib_path(app).unwrap_or_else(|| {
        panic!(
            "未找到 aelux-core 动态库（{}），release-ffi 链路无法启动",
            lib_file_name()
        )
    });
    unsafe {
        let lib = libloading::Library::new(&path)
            .unwrap_or_else(|e| panic!("加载 {path:?} 失败: {e}"));
        // 泄漏：动态库必须活到进程结束
        let lib: &'static libloading::Library = Box::leak(Box::new(lib));
        let invoke: InvokeFn = *lib.get(b"aelux_invoke").expect("缺少符号 aelux_invoke");
        let version: VersionFn = *lib.get(b"aelux_core_version").expect("缺少符号 aelux_core_version");
        let free: FreeFn = *lib.get(b"aelux_string_free").expect("缺少符号 aelux_string_free");
        let _ = LIB.set(CoreLib { invoke, version, free });
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
                Some(false) => Err(core_error_message(parsed.get("error").unwrap_or(&Value::Null))),
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
            Some(false) => Err(core_error_message(parsed.get("error").unwrap_or(&Value::Null))),
            None => Err("内核返回缺少 ok 字段".into()),
        }
    }
}

/// 内核 `CoreError` 在 FFI 里是外部标签枚举（`{"Json":"..."}` / `{"HashMismatch":{...}}`），
/// 这里转成与内核 `Display` 一致的文本，避免发布链路只显示一句笼统的「内核错误」。
fn core_error_message(error: &Value) -> String {
    if let Some(text) = error.as_str() {
        return text.to_string();
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
                let value = v.as_str().map(str::to_string).unwrap_or_else(|| v.to_string());
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
    value.as_str().map(str::to_string).ok_or_else(|| "内核返回类型错误".into())
}

pub async fn download_file(url: String, dest: String, sha1: Option<String>) -> Result<String, CoreError> {
    let value = invoke(
        "download.file",
        &serde_json::json!({ "url": url, "dest": dest, "sha1": sha1 }),
    )
    .await?;
    value.as_str().map(str::to_string).ok_or_else(|| "内核返回类型错误".into())
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
    let value = invoke("auth.ms.poll", &serde_json::to_value(session).map_err(|e| e.to_string())?).await?;
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

pub fn create_instance(name: String, version: String, loader: Option<String>) -> Result<GameInstance, CoreError> {
    let value = invoke_sync(
        "instances.create",
        &serde_json::json!({ "name": name, "version": version, "loader": loader }),
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
    invoke_sync("accounts.session.set", &serde_json::json!({ "session": session }))?;
    Ok(())
}

pub fn account_login_offline(username: String) -> Result<StoredAccount, CoreError> {
    let value = invoke_sync("accounts.login_offline", &serde_json::json!({ "username": username }))?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn auth_servers_list() -> Result<Vec<AuthServer>, CoreError> {
    let value = invoke_sync("authservers.list", &Value::Null)?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn auth_server_add(name: Option<String>, url: String) -> Result<AuthServer, CoreError> {
    let value = invoke_sync("authservers.add", &serde_json::json!({ "name": name, "url": url }))?;
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
