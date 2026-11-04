//! Tauri 命令层：前端唯一入口。
//!
//! 命令本身不含业务：内核命令一律转发 `core_api`（三条链路之一），
//! 窗口 / 文件命令直接用 Tauri 能力。所有命令经 tauri-specta
//! 生成类型化 TS 绑定（`src/lib/bindings.ts`，纳入 git）。

use crate::core_api;
use crate::dto::{GameInstance, LauncherConfig, OsInfo, VersionManifest};

/* ------------------------------ 内核命令 ------------------------------ */

#[tauri::command]
#[specta::specta]
pub fn get_data_dir() -> String {
    core_api::get_data_dir()
}

#[tauri::command]
#[specta::specta]
pub fn get_os_info() -> Result<OsInfo, String> {
    core_api::get_os_info()
}

#[tauri::command]
#[specta::specta]
pub fn get_core_version() -> String {
    core_api::get_core_version()
}

#[tauri::command]
#[specta::specta]
pub async fn fetch_json(url: String) -> Result<String, String> {
    core_api::fetch_json(url).await
}

#[tauri::command]
#[specta::specta]
pub async fn download_file(url: String, dest: String, sha1: Option<String>) -> Result<String, String> {
    core_api::download_file(url, dest, sha1).await
}

#[tauri::command]
#[specta::specta]
pub async fn fetch_minecraft_manifest() -> Result<VersionManifest, String> {
    core_api::fetch_minecraft_manifest().await
}

#[tauri::command]
#[specta::specta]
pub fn get_instances() -> Result<Vec<GameInstance>, String> {
    core_api::list_instances()
}

#[tauri::command]
#[specta::specta]
pub fn create_instance(name: String, version: String, loader: Option<String>) -> Result<GameInstance, String> {
    core_api::create_instance(name, version, loader)
}

#[tauri::command]
#[specta::specta]
pub fn delete_instance(id: String) -> Result<(), String> {
    core_api::delete_instance(id)
}

#[tauri::command]
#[specta::specta]
pub fn kv_get(key: String) -> Option<String> {
    core_api::kv_get(key)
}

#[tauri::command]
#[specta::specta]
pub fn kv_set(key: String, value: String) -> Result<(), String> {
    core_api::kv_set(key, value)
}

#[tauri::command]
#[specta::specta]
pub fn kv_remove(key: String) -> Result<(), String> {
    core_api::kv_remove(key)
}

#[tauri::command]
#[specta::specta]
pub fn get_config() -> Result<LauncherConfig, String> {
    core_api::get_config()
}

#[tauri::command]
#[specta::specta]
pub fn save_config(config: LauncherConfig) -> Result<(), String> {
    core_api::save_config(config)
}

/* ------------------------------ 窗口命令 ------------------------------ */

#[tauri::command]
#[specta::specta]
pub fn minimize_window(window: tauri::WebviewWindow) {
    let _ = window.minimize();
}

#[tauri::command]
#[specta::specta]
pub fn close_window(window: tauri::WebviewWindow) {
    let _ = window.close();
}

/* ---------------------------- 文件 / 外链 ----------------------------- */

#[tauri::command]
#[specta::specta]
pub fn open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn open_folder_in_explorer(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn write_text(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, content).map_err(|e| e.to_string())
}

/// 读取随包公告（src-tauri/resources/announcements.json）。
#[tauri::command]
#[specta::specta]
pub fn read_bundled_announcements(app: tauri::AppHandle) -> String {
    use tauri::Manager;
    app.path()
        .resolve("resources/announcements.json", tauri::path::BaseDirectory::Resource)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .unwrap_or_else(|| "[]".into())
}

/// 读取本地更新信息（data/update.json，存在才有内容）。
#[tauri::command]
#[specta::specta]
pub fn read_local_update() -> String {
    let path = std::path::PathBuf::from(core_api::get_data_dir()).join("update.json");
    std::fs::read_to_string(path).unwrap_or_default()
}
