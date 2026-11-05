//! dev-path 链路：path 依赖 aelux-core，Rust 直调（源码联调，IDE 跳转/断点可用）。
//!
//! 内核方法返回 core 侧类型，这里统一走 `serde_json` 转成壳层 DTO，
//! 与 ffi / mock 链路的数据形状保持一致。

use aelux_core::CoreApi;
use serde_json::Value;
use tauri::Emitter;

use crate::dto::{GameInstance, LauncherConfig, OsInfo, VersionManifest};

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
