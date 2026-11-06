//! Tauri 命令层：前端唯一入口。
//!
//! 命令本身不含业务：内核命令一律转发 `core_api`（三条链路之一），
//! 窗口 / 文件命令直接用 Tauri 能力。所有命令经 tauri-specta
//! 生成类型化 TS 绑定（`src/lib/bindings.ts`，纳入 git）。

use crate::core_api;
use crate::dto::{
    Account, AccountSession, AuthServer, DeviceCodeSession, GameInstance, JavaRuntime, LauncherConfig,
    LocalContentItem, OsInfo, StoredAccount, VersionManifest,
};

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
pub async fn loader_versions(loader: String, mc_version: String) -> Result<Vec<String>, String> {
    core_api::loader_versions(loader, mc_version).await
}

#[tauri::command]
#[specta::specta]
pub async fn mod_api_versions(api: String, mc_version: String) -> Result<Vec<String>, String> {
    core_api::mod_api_versions(api, mc_version).await
}

/* ------------------------------ 认证命令 ------------------------------ */

#[tauri::command]
#[specta::specta]
pub async fn auth_start_device_flow() -> Result<DeviceCodeSession, String> {
    core_api::auth_start_device_flow().await
}

#[tauri::command]
#[specta::specta]
pub async fn auth_poll_device_flow(session: DeviceCodeSession) -> Result<Account, String> {
    core_api::auth_poll_device_flow(session).await
}

#[tauri::command]
#[specta::specta]
pub fn auth_logout(msa_id: String) -> Result<(), String> {
    core_api::auth_logout(msa_id)
}

/* ----------------------- 账户 / 会话 / 认证服务器 ----------------------- */

#[tauri::command]
#[specta::specta]
pub fn accounts_list() -> Result<Vec<StoredAccount>, String> {
    core_api::accounts_list()
}

#[tauri::command]
#[specta::specta]
pub fn accounts_upsert(account: StoredAccount) -> Result<(), String> {
    core_api::accounts_upsert(account)
}

#[tauri::command]
#[specta::specta]
pub fn accounts_remove(id: String) -> Result<(), String> {
    core_api::accounts_remove(id)
}

#[tauri::command]
#[specta::specta]
pub fn account_session_get() -> Result<Option<AccountSession>, String> {
    core_api::account_session_get()
}

#[tauri::command]
#[specta::specta]
pub fn account_session_set(session: Option<AccountSession>) -> Result<(), String> {
    core_api::account_session_set(session)
}

#[tauri::command]
#[specta::specta]
pub fn account_login_offline(username: String) -> Result<StoredAccount, String> {
    core_api::account_login_offline(username)
}

#[tauri::command]
#[specta::specta]
pub fn auth_servers_list() -> Result<Vec<AuthServer>, String> {
    core_api::auth_servers_list()
}

#[tauri::command]
#[specta::specta]
pub fn auth_server_add(name: Option<String>, url: String) -> Result<AuthServer, String> {
    core_api::auth_server_add(name, url)
}

#[tauri::command]
#[specta::specta]
pub fn auth_server_remove(id: String) -> Result<(), String> {
    core_api::auth_server_remove(id)
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

/* ------------------------- Java / 本地内容命令 ------------------------- */

#[tauri::command]
#[specta::specta]
pub fn scan_java() -> Result<Vec<JavaRuntime>, String> {
    crate::core_api::scan_java()
}

#[tauri::command]
#[specta::specta]
pub fn required_java(mc_version: String) -> u32 {
    crate::core_api::required_java(mc_version)
}

#[tauri::command]
#[specta::specta]
pub fn get_instance_dir(id: String) -> Result<String, String> {
    crate::core_api::get_instance_dir(id)
}

#[tauri::command]
#[specta::specta]
pub fn list_content(instance_id: String, kind: String) -> Result<Vec<LocalContentItem>, String> {
    crate::core_api::list_content(instance_id, kind)
}

#[tauri::command]
#[specta::specta]
pub fn set_content_enabled(
    instance_id: String,
    kind: String,
    file_name: String,
    enabled: bool,
) -> Result<(), String> {
    crate::core_api::set_content_enabled(instance_id, kind, file_name, enabled)
}

#[tauri::command]
#[specta::specta]
pub fn delete_content(instance_id: String, kind: String, file_name: String) -> Result<(), String> {
    crate::core_api::delete_content(instance_id, kind, file_name)
}

#[tauri::command]
#[specta::specta]
pub fn import_content(instance_id: String, kind: String, source: String) -> Result<LocalContentItem, String> {
    crate::core_api::import_content(instance_id, kind, source)
}

#[tauri::command]
#[specta::specta]
pub fn read_text(path: String) -> Result<Option<String>, String> {
    crate::core_api::read_text(path)
}

#[tauri::command]
#[specta::specta]
pub fn delete_path(path: String) -> Result<(), String> {
    crate::core_api::delete_path(path)
}

#[tauri::command]
#[specta::specta]
pub fn rename_path(from: String, to: String) -> Result<(), String> {
    crate::core_api::rename_path(from, to)
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
    crate::core_api::write_text(path, content)
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
