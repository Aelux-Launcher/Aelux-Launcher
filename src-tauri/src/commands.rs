//! Tauri 命令层：前端唯一入口。
//!
//! 命令本身不含业务：内核命令一律转发 `core_api`（三条链路之一），
//! 窗口 / 文件命令直接用 Tauri 能力。所有命令经 tauri-specta
//! 生成类型化 TS 绑定（`src/lib/bindings.ts`，纳入 git）。

use crate::core_api;
use crate::dto::{
    Account, AccountSession, AuthServer, CrashReport, DeviceCodeSession, GameInstance,
    InstallResult, JavaInstallResult, JavaRuntime, LaunchOutcome, LauncherConfig, LocalContentItem,
    LogFile, ModUpdate, ModpackImportResult, OsInfo, RunningGame, StoredAccount, VersionManifest,
};

/* ------------------------------ 内核命令 ------------------------------ */

#[tauri::command]
#[specta::specta]
pub fn get_data_dir() -> String {
    core_api::get_data_dir()
}

/// 检测官方启动器的 .minecraft 目录（Windows 下为 %APPDATA%\.minecraft）。
/// 未检测到返回 None，前端据此隐藏「官方文件夹」卡片。
#[tauri::command]
#[specta::specta]
pub fn detect_official_minecraft() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            let dir = std::path::Path::new(&appdata).join(".minecraft");
            if dir.is_dir() {
                return Some(dir.to_string_lossy().into_owned());
            }
        }
    }
    None
}

#[tauri::command]
#[specta::specta]
pub fn get_os_info() -> Result<OsInfo, String> {
    core_api::get_os_info()
}

/// 扫描所有实例的日志：启动器捕获的 `data/logs/<id>-latest.log`
/// 与实例 Minecraft 目录下的 `logs/*.log(.gz)`。
#[tauri::command]
#[specta::specta]
pub fn list_logs() -> Result<Vec<LogFile>, String> {
    let data = std::path::PathBuf::from(core_api::get_data_dir());
    let mut out = Vec::new();

    for inst in core_api::list_instances()? {
        // 启动器捕获的启动输出
        let launcher_log = data.join("logs").join(format!("{}-latest.log", inst.id));
        push_log(&mut out, &inst.id, "launcher", &launcher_log);
        // 游戏自身的 logs 目录（latest.log 与按日期滚动的 .log.gz）
        let game_logs = data
            .join("minecraft")
            .join("instances")
            .join(&inst.id)
            .join("logs");
        if let Ok(entries) = std::fs::read_dir(&game_logs) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }
                let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if name.ends_with(".log") || name.ends_with(".log.gz") {
                    push_log(&mut out, &inst.id, "game", &path);
                }
            }
        }
    }

    // 最近修改的排前面
    out.sort_by(|a, b| {
        b.modified_secs
            .partial_cmp(&a.modified_secs)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(out)
}

/// 把存在且为文件的 `path` 追加为一条日志记录。
fn push_log(out: &mut Vec<LogFile>, instance_id: &str, source: &str, path: &std::path::Path) {
    use std::time::UNIX_EPOCH;
    let Ok(meta) = std::fs::metadata(path) else {
        return;
    };
    if !meta.is_file() {
        return;
    }
    let modified_secs = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as f64)
        .unwrap_or(0.0);
    out.push(LogFile {
        instance_id: instance_id.to_string(),
        name: path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("log")
            .to_string(),
        path: path.to_string_lossy().into_owned(),
        source: source.to_string(),
        size_bytes: meta.len() as f64,
        modified_secs,
    });
}

/// 读取崩溃报告：优先最近 10 分钟内生成的 `crash-reports/*.txt`，
/// 否则回退到启动器捕获的 `<id>-latest.log`，只返回末尾片段供弹窗预览。
#[tauri::command]
#[specta::specta]
pub fn read_crash_report(instance_id: String) -> Result<CrashReport, String> {
    use std::time::{SystemTime, UNIX_EPOCH};

    let data = std::path::PathBuf::from(core_api::get_data_dir());
    let crash_dir = data
        .join("minecraft")
        .join("instances")
        .join(&instance_id)
        .join("crash-reports");

    // 只认本次启动后产生的崩溃报告，避免展示上一次的旧文件
    let cutoff = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs().saturating_sub(10 * 60))
        .unwrap_or(0);
    let mut newest: Option<(u64, std::path::PathBuf)> = None;
    if let Ok(entries) = std::fs::read_dir(&crash_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if !name.ends_with(".txt") {
                continue;
            }
            let secs = entry
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            if secs < cutoff {
                continue;
            }
            if newest.as_ref().map(|(t, _)| secs > *t).unwrap_or(true) {
                newest = Some((secs, path));
            }
        }
    }

    let launcher_log = data
        .join("logs")
        .join(format!("{}-latest.log", instance_id));
    let (path, from_game) = match newest {
        Some((_, p)) => (p, true),
        None if launcher_log.is_file() => (launcher_log, false),
        None => {
            return Ok(CrashReport {
                path: String::new(),
                content: "没有找到崩溃报告或日志文件，可能是启动器自身出现问题。".into(),
                from_game: false,
            })
        }
    };

    let raw = std::fs::read_to_string(&path).unwrap_or_else(|e| format!("读取日志失败：{e}"));
    // 只保留末尾 120 行，避免超长日志撑满弹窗
    let tail: Vec<&str> = raw.lines().rev().take(120).collect();
    let content = tail.into_iter().rev().collect::<Vec<_>>().join("\n");

    Ok(CrashReport {
        path: path.to_string_lossy().into_owned(),
        content,
        from_game,
    })
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

/// CurseForge API 代理（内核读取本机配置的 API Key 后转发）。
#[tauri::command]
#[specta::specta]
pub async fn curseforge_fetch(path: String) -> Result<String, String> {
    core_api::curseforge_fetch(path).await
}

#[tauri::command]
#[specta::specta]
pub async fn download_file(
    url: String,
    dest: String,
    sha1: Option<String>,
    task_id: Option<String>,
    name: Option<String>,
) -> Result<String, String> {
    core_api::download_file(url, dest, sha1, task_id, name).await
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
pub fn create_instance(
    name: String,
    version: String,
    loader: Option<String>,
    loader_version: Option<String>,
) -> Result<GameInstance, String> {
    core_api::create_instance(name, version, loader, loader_version)
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

#[tauri::command]
#[specta::specta]
pub fn cache_dir() -> String {
    core_api::cache_dir()
}

#[tauri::command]
#[specta::specta]
pub fn clear_cache() -> Result<u32, String> {
    core_api::clear_cache()
}

/* ------------------------- 窗口命令 ------------------------- */

static APP_HANDLE: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

/// 记录应用句柄（setup 时调用，供无注入参数的命令使用）。
pub fn set_app_handle(handle: tauri::AppHandle) {
    let _ = APP_HANDLE.set(handle);
}

/// 用本地 PNG 设置窗口图标（自定义启动器图标）。
#[tauri::command]
#[specta::specta]
pub fn set_window_icon(path: String) -> Result<(), String> {
    use tauri::Manager;
    let app = APP_HANDLE.get().ok_or("应用尚未初始化")?;
    let win = app.get_webview_window("main").ok_or("主窗口不存在")?;
    let image = tauri::image::Image::from_path(&path).map_err(|e| e.to_string())?;
    win.set_icon(image).map_err(|e| e.to_string())
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
pub fn import_content(
    instance_id: String,
    kind: String,
    source: String,
) -> Result<LocalContentItem, String> {
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

/* ---------------------------- 安装 / 启动 / 市场 ---------------------------- */

#[tauri::command]
#[specta::specta]
pub async fn install_version(
    mc_version: String,
    loader: String,
    loader_version: Option<String>,
) -> Result<InstallResult, String> {
    core_api::install_version(mc_version, loader, loader_version).await
}

#[tauri::command]
#[specta::specta]
pub async fn install_instance(id: String) -> Result<InstallResult, String> {
    core_api::install_instance(id).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_instance_loader(
    id: String,
    loader: String,
    loader_version: Option<String>,
) -> Result<InstallResult, String> {
    core_api::set_instance_loader(id, loader, loader_version).await
}

#[tauri::command]
#[specta::specta]
pub async fn launch_instance(id: String) -> Result<LaunchOutcome, String> {
    core_api::launch_instance(id).await
}

#[tauri::command]
#[specta::specta]
pub fn kill_instance(id: String) -> bool {
    core_api::kill_instance(id)
}

#[tauri::command]
#[specta::specta]
pub fn running_instances() -> Result<Vec<RunningGame>, String> {
    core_api::running_instances()
}

#[tauri::command]
#[specta::specta]
pub async fn export_launch_script(id: String) -> Result<String, String> {
    core_api::export_launch_script(id).await
}

#[tauri::command]
#[specta::specta]
pub fn backup_world(instance_id: String, file_name: String) -> Result<String, String> {
    core_api::backup_world(instance_id, file_name)
}

#[tauri::command]
#[specta::specta]
pub async fn authlib_login(
    server_id: String,
    username: String,
    password: String,
) -> Result<StoredAccount, String> {
    core_api::authlib_login(server_id, username, password).await
}

#[tauri::command]
#[specta::specta]
pub async fn authlib_refresh(account_id: String) -> Result<StoredAccount, String> {
    core_api::authlib_refresh(account_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn refresh_microsoft_account(account_id: String) -> Result<StoredAccount, String> {
    core_api::refresh_microsoft_account(account_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn install_resource(
    instance_id: String,
    kind: String,
    url: String,
    file_name: String,
    sha1: Option<String>,
) -> Result<LocalContentItem, String> {
    core_api::install_resource(instance_id, kind, url, file_name, sha1).await
}

#[tauri::command]
#[specta::specta]
pub async fn check_mod_updates(instance_id: String) -> Result<Vec<ModUpdate>, String> {
    core_api::check_mod_updates(instance_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn install_mod_api(
    instance_id: String,
    api: String,
    mc_version: String,
    version: Option<String>,
) -> Result<LocalContentItem, String> {
    core_api::install_mod_api(instance_id, api, mc_version, version).await
}

#[tauri::command]
#[specta::specta]
pub fn export_modpack(instance_id: String) -> Result<String, String> {
    core_api::export_modpack(instance_id)
}

#[tauri::command]
#[specta::specta]
pub async fn import_modpack(
    source: String,
    name: Option<String>,
) -> Result<ModpackImportResult, String> {
    core_api::import_modpack(source, name).await
}

#[tauri::command]
#[specta::specta]
pub async fn import_modpack_url(
    url: String,
    name: Option<String>,
) -> Result<ModpackImportResult, String> {
    core_api::import_modpack_url(url, name).await
}

#[tauri::command]
#[specta::specta]
pub async fn install_java(major: u32) -> Result<JavaInstallResult, String> {
    core_api::install_java(major).await
}

#[tauri::command]
#[specta::specta]
pub fn probe_java(path: String) -> Result<JavaRuntime, String> {
    core_api::probe_java(path)
}

/* ------------------------------ 窗口命令 ------------------------------ */

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};

use tauri::{PhysicalSize, WebviewWindow};

/// 上一次窗口是否处于最大化（用于识别「贴顶最大化 → 还原」）。
static WAS_MAXIMIZED: AtomicBool = AtomicBool::new(false);
/// 最近一次「非最大化 / 非全屏」的窗口尺寸（物理像素）。
static NORMAL_W: AtomicU32 = AtomicU32::new(960);
static NORMAL_H: AtomicU32 = AtomicU32::new(580);

const MIN_VALID: u32 = 200;
/// 还原后延迟通知 WebView2 重排的等待时间（毫秒），避开系统拖拽动画。
const RESTORE_DELAY_MS: u64 = 150;

/// 启动时记录初始尺寸，并同步最大化状态。
pub(crate) fn init_window_tracking(window: &WebviewWindow) {
    WAS_MAXIMIZED.store(window.is_maximized().unwrap_or(false), Ordering::SeqCst);
    if let Ok(size) = window.outer_size() {
        remember_normal(window, size);
    }
}

/// 记录「正常状态」下的窗口几何；最大化 / 全屏 / 贴边尺寸不记录。
fn remember_normal(window: &WebviewWindow, size: PhysicalSize<u32>) {
    if size.width < MIN_VALID || size.height < MIN_VALID {
        return;
    }
    if let Ok(Some(monitor)) = window.current_monitor() {
        let screen = monitor.size();
        // 贴顶 / 拖到屏幕边缘时系统会先改尺寸再置最大化，此时尺寸已等于屏幕，
        // 不能当作「还原尺寸」保存。
        if size.width >= screen.width || size.height >= screen.height {
            return;
        }
    }
    NORMAL_W.store(size.width, Ordering::SeqCst);
    NORMAL_H.store(size.height, Ordering::SeqCst);
}

/// 把窗口恢复到记录的正常尺寸。
///
/// 只在尺寸确实不同才设置，避免每次还原都多触发一次重排导致画面抖动/错乱。
fn apply_normal_size(window: &WebviewWindow) {
    let w = NORMAL_W.load(Ordering::SeqCst);
    let h = NORMAL_H.load(Ordering::SeqCst);
    if w < MIN_VALID || h < MIN_VALID {
        return;
    }
    let current = window.outer_size().unwrap_or(PhysicalSize::new(0, 0));
    if current.width != w || current.height != h {
        let _ = window.set_size(PhysicalSize::new(w, h));
    }
}

/// 还原后显示 / 聚焦。延迟执行，避免和系统拖拽（Aero Snap 还原）打架。
fn schedule_restore(window: WebviewWindow) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(RESTORE_DELAY_MS));
        if window.is_maximized().unwrap_or(false)
            || window.is_fullscreen().unwrap_or(false)
            || window.is_minimized().unwrap_or(false)
        {
            return;
        }
        let _ = window.show();
        apply_normal_size(&window);
        let _ = window.set_focus();
    });
}

/// 窗口尺寸变化：跟踪最大化状态，识别「最大化 → 还原」并修复不显示。
pub(crate) fn on_window_resized(window: &WebviewWindow) {
    let is_max = window.is_maximized().unwrap_or(false);
    let is_full = window.is_fullscreen().unwrap_or(false);
    let was = WAS_MAXIMIZED.swap(is_max, Ordering::SeqCst);

    if !is_max && !is_full {
        if was {
            // 从最大化还原（包括贴顶吸附后拖走 / 点击还原按钮）：
            // WebView2 可能停留在最大化尺寸或不再重绘，表现为窗口不可见。
            schedule_restore(window.clone());
        } else if let Ok(size) = window.outer_size() {
            remember_normal(window, size);
        }
    }
}

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

#[tauri::command]
#[specta::specta]
pub fn toggle_maximize_window(window: tauri::WebviewWindow) -> bool {
    if window.is_maximized().unwrap_or(false) {
        // 先取当前（最大化）尺寸不合适，使用正常状态记录值。
        let _ = window.unmaximize();
        schedule_restore(window);
        false
    } else {
        if let Ok(size) = window.outer_size() {
            remember_normal(&window, size);
        }
        let _ = window.maximize();
        window.is_maximized().unwrap_or(true)
    }
}

#[tauri::command]
#[specta::specta]
pub fn set_fullscreen_window(window: tauri::WebviewWindow, fullscreen: bool) -> bool {
    let _ = window.set_fullscreen(fullscreen);
    if !fullscreen {
        // 退出全屏后同样可能出现「窗口存在但内容不显示」，统一走一次恢复。
        let _ = window.show();
        schedule_restore(window.clone());
        let _ = window.set_focus();
    }
    window.is_fullscreen().unwrap_or(fullscreen)
}

#[tauri::command]
#[specta::specta]
pub fn window_state(window: tauri::WebviewWindow) -> (bool, bool) {
    (
        window.is_maximized().unwrap_or(false),
        window.is_fullscreen().unwrap_or(false),
    )
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
        .resolve(
            "resources/announcements.json",
            tauri::path::BaseDirectory::Resource,
        )
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
