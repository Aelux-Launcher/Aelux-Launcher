//! dev-path 链路：path 依赖 aelux-core，Rust 直调（源码联调，IDE 跳转/断点可用）。
//!
//! 内核方法返回 core 侧类型，这里统一走 `serde_json` 转成壳层 DTO，
//! 与 ffi / mock 链路的数据形状保持一致。

use aelux_core::CoreApi;
use serde_json::Value;
use tauri::Emitter;

use crate::dto::{
    Account, AccountSession, AuthServer, DeviceCodeSession, GameInstance, JavaRuntime, LauncherConfig,
    LocalContentItem, OsInfo, StoredAccount, VersionManifest,
};

use super::CoreError;

static CORE: std::sync::OnceLock<CoreApi> = std::sync::OnceLock::new();

/// 取全局内核实例（首个调用方触发初始化：建目录 + 开日志）。
fn core() -> &'static CoreApi {
    CORE.get_or_init(CoreApi::new)
}

/// 初始化：把内核事件流转发为 Tauri 事件（下载进度 / 日志 / 消息）。
pub fn init(app: &tauri::AppHandle) {
    let handle = app.clone();
    let rx = core().events().subscribe();
    tauri::async_runtime::spawn(async move {
        let mut rx = rx;
        loop {
            match rx.recv().await {
                Ok(event) => {
                    if let Ok(value) = serde_json::to_value(&event) {
                        let _ = handle.emit("core-event", value);
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                    tracing::warn!("内核事件订阅落后，丢弃 {n} 条");
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
    });
}

pub fn get_data_dir() -> String {
    core().get_data_dir().to_string_lossy().into_owned()
}

pub fn get_os_info() -> Result<OsInfo, CoreError> {
    let value = serde_json::to_value(core().get_os_info()).map_err(|e| e.to_string())?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn get_core_version() -> String {
    aelux_core::CORE_VERSION.into()
}

pub async fn fetch_json(url: String) -> Result<String, CoreError> {
    core().fetch_json(&url).await.map_err(|e| e.to_string())
}

pub async fn download_file(url: String, dest: String, sha1: Option<String>) -> Result<String, CoreError> {
    let req = aelux_core::api::DownloadRequest { url, dest, sha1 };
    core()
        .download_file(&req)
        .await
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

pub async fn fetch_minecraft_manifest() -> Result<VersionManifest, CoreError> {
    let value = serde_json::to_value(core().fetch_minecraft_manifest().await.map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub async fn loader_versions(loader: String, mc_version: String) -> Result<Vec<String>, CoreError> {
    core()
        .loader_versions(&loader, &mc_version)
        .await
        .map_err(|e| e.to_string())
}

pub async fn mod_api_versions(api: String, mc_version: String) -> Result<Vec<String>, CoreError> {
    core()
        .mod_api_versions(&api, &mc_version)
        .await
        .map_err(|e| e.to_string())
}

pub async fn auth_start_device_flow() -> Result<DeviceCodeSession, CoreError> {
    let value = serde_json::to_value(core().start_microsoft_login().await.map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub async fn auth_poll_device_flow(session: DeviceCodeSession) -> Result<Account, CoreError> {
    let session: aelux_core::auth::DeviceCodeSession =
        serde_json::from_value(serde_json::to_value(session).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    let value = serde_json::to_value(core().poll_microsoft_login(&session).await.map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn auth_logout(msa_id: String) -> Result<(), CoreError> {
    core().logout_microsoft(&msa_id).map_err(|e| e.to_string())
}

pub fn list_instances() -> Result<Vec<GameInstance>, CoreError> {
    let value = Value::Array(
        core()
            .list_instances()
            .map_err(|e| e.to_string())?
            .into_iter()
            .map(|i| serde_json::to_value(i).map_err(|e| e.to_string()))
            .collect::<Result<Vec<_>, _>>()?,
    );
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn create_instance(name: String, version: String, loader: Option<String>) -> Result<GameInstance, CoreError> {
    let inst = core()
        .create_instance(&name, &version, loader.as_deref())
        .map_err(|e| e.to_string())?;
    serde_json::from_value(serde_json::to_value(inst).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

pub fn delete_instance(id: String) -> Result<(), CoreError> {
    core().delete_instance(&id).map_err(|e| e.to_string())
}

/* ----------------------- 账户 / 会话 / 认证服务器 ----------------------- */

pub fn accounts_list() -> Result<Vec<StoredAccount>, CoreError> {
    let value = Value::Array(
        core()
            .list_accounts()
            .map_err(|e| e.to_string())?
            .into_iter()
            .map(|a| serde_json::to_value(a).map_err(|e| e.to_string()))
            .collect::<Result<Vec<_>, _>>()?,
    );
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn accounts_upsert(account: StoredAccount) -> Result<(), CoreError> {
    let core_account: aelux_core::accounts::StoredAccount =
        serde_json::from_value(serde_json::to_value(account).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    core().upsert_account(&core_account).map_err(|e| e.to_string())
}

pub fn accounts_remove(id: String) -> Result<(), CoreError> {
    core().remove_account(&id).map_err(|e| e.to_string())
}

pub fn account_session_get() -> Result<Option<AccountSession>, CoreError> {
    let value = serde_json::to_value(core().get_account_session()).map_err(|e| e.to_string())?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn account_session_set(session: Option<AccountSession>) -> Result<(), CoreError> {
    let core_session: Option<aelux_core::accounts::AccountSession> =
        serde_json::from_value(serde_json::to_value(session).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    core().set_account_session(core_session).map_err(|e| e.to_string())
}

pub fn account_login_offline(username: String) -> Result<StoredAccount, CoreError> {
    let value = serde_json::to_value(core().login_offline(&username).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn auth_servers_list() -> Result<Vec<AuthServer>, CoreError> {
    let value = Value::Array(
        core()
            .list_auth_servers()
            .map_err(|e| e.to_string())?
            .into_iter()
            .map(|s| serde_json::to_value(s).map_err(|e| e.to_string()))
            .collect::<Result<Vec<_>, _>>()?,
    );
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn auth_server_add(name: Option<String>, url: String) -> Result<AuthServer, CoreError> {
    let value = serde_json::to_value(core().add_auth_server(name, &url).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn auth_server_remove(id: String) -> Result<(), CoreError> {
    core().remove_auth_server(&id).map_err(|e| e.to_string())
}

pub fn kv_get(key: String) -> Option<String> {
    core().kv_get(&key)
}

pub fn kv_set(key: String, value: String) -> Result<(), CoreError> {
    core().kv_set(&key, &value).map_err(|e| e.to_string())
}

pub fn kv_remove(key: String) -> Result<(), CoreError> {
    core().kv_remove(&key).map_err(|e| e.to_string())
}

pub fn get_config() -> Result<LauncherConfig, CoreError> {
    let value = serde_json::to_value(core().get_config()).map_err(|e| e.to_string())?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn save_config(config: LauncherConfig) -> Result<(), CoreError> {
    let core_cfg: aelux_core::config::LauncherConfig =
        serde_json::from_value(serde_json::to_value(config).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    core().save_config(&core_cfg).map_err(|e| e.to_string())
}

/* --------------------------- Java / 本地内容 --------------------------- */

pub fn scan_java() -> Result<Vec<JavaRuntime>, CoreError> {
    let value = serde_json::to_value(core().scan_java()).map_err(|e| e.to_string())?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn required_java(mc_version: String) -> u32 {
    core().required_java(&mc_version)
}

pub fn get_instance_dir(id: String) -> Result<String, CoreError> {
    core()
        .get_instance_dir(&id)
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

pub fn list_content(instance_id: String, kind: String) -> Result<Vec<LocalContentItem>, CoreError> {
    let value = serde_json::to_value(
        core()
            .list_content(&instance_id, &kind)
            .map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn set_content_enabled(
    instance_id: String,
    kind: String,
    file_name: String,
    enabled: bool,
) -> Result<(), CoreError> {
    core()
        .set_content_enabled(&instance_id, &kind, &file_name, enabled)
        .map_err(|e| e.to_string())
}

pub fn delete_content(instance_id: String, kind: String, file_name: String) -> Result<(), CoreError> {
    core()
        .delete_content(&instance_id, &kind, &file_name)
        .map_err(|e| e.to_string())
}

pub fn import_content(instance_id: String, kind: String, source: String) -> Result<LocalContentItem, CoreError> {
    let value = serde_json::to_value(
        core()
            .import_content(&instance_id, &kind, &source)
            .map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn read_text(path: String) -> Result<Option<String>, CoreError> {
    core().read_text(&path).map_err(|e| e.to_string())
}

pub fn write_text(path: String, content: String) -> Result<(), CoreError> {
    core().write_text(&path, &content).map_err(|e| e.to_string())
}

pub fn delete_path(path: String) -> Result<(), CoreError> {
    core().delete_path(&path).map_err(|e| e.to_string())
}

pub fn rename_path(from: String, to: String) -> Result<(), CoreError> {
    core().rename_path(&from, &to).map_err(|e| e.to_string())
}
