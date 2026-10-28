use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::path::PathBuf;
use tauri::{State, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GameInstance {
    pub id: String,
    pub name: String,
    pub version: String,
    pub loader: Option<String>,
    pub last_played: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct SessionPayload {
    pub r#type: String,
    pub username: String,
    pub uuid: String,
    #[serde(default)]
    pub access_token: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LaunchRequest {
    pub instance: GameInstance,
    pub session: Option<SessionPayload>,
    pub memory_mb: u64,
    pub java_path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VersionInfo {
    pub id: String,
    pub name: String,
    pub version_type: String,
    pub mod_loader: Option<String>,
    pub date: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FolderInfo {
    pub name: String,
    pub path: String,
    pub version_count: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TagInfo {
    pub id: String,
    pub name: String,
    pub color: String,
    pub version_ids: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LauncherState {
    pub instances: Vec<GameInstance>,
    pub current_user: Option<String>,
    pub selected_version: Option<String>,
    pub tags: Vec<TagInfo>,
    pub extra_folders: Vec<FolderInfo>,
}

impl Default for LauncherState {
    fn default() -> Self {
        Self {
            // 实例是用户数据，落盘保存（见 load_instances / save_instances），
            // 这里不再塞假数据，否则主页会凭空出现几个不存在的实例。
            instances: Vec::new(),
            current_user: None,
            selected_version: None,
            tags: vec![
                TagInfo {
                    id: "favorites".to_string(),
                    name: "收藏".to_string(),
                    color: "#F44336".to_string(),
                    version_ids: vec![],
                },
                TagInfo {
                    id: "survival".to_string(),
                    name: "生存".to_string(),
                    color: "#4CAF50".to_string(),
                    version_ids: vec![],
                },
                TagInfo {
                    id: "modded".to_string(),
                    name: "模组".to_string(),
                    color: "#FF9800".to_string(),
                    version_ids: vec![],
                },
            ],
            extra_folders: Vec::new(),
        }
    }
}

/* ===================== 游戏实例持久化 ===================== */

/// 实例列表落盘位置：<app_data_dir>/instances.json
fn instances_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    let _ = std::fs::create_dir_all(&dir);
    Some(dir.join("instances.json"))
}

fn load_instances(app: &AppHandle) -> Vec<GameInstance> {
    let Some(p) = instances_path(app) else {
        return Vec::new();
    };
    let Ok(s) = std::fs::read_to_string(&p) else {
        return Vec::new();
    };
    serde_json::from_str(&s).unwrap_or_default()
}

fn save_instances(app: &AppHandle, list: &[GameInstance]) -> Result<(), String> {
    let Some(p) = instances_path(app) else {
        return Ok(());
    };
    let s = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    std::fs::write(&p, s).map_err(|e| e.to_string())
}

/// 用时间戳生成实例 id（同一毫秒内不会重复）。
fn new_instance_id() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis().to_string())
        .unwrap_or_else(|_| "1".to_string())
}

#[tauri::command]
pub fn ping() -> String {
    "pong".to_string()
}

#[tauri::command]
pub fn get_versions() -> Vec<String> {
    vec![
        "1.21.4".to_string(),
        "1.21.3".to_string(),
        "1.21.2".to_string(),
        "1.21.1".to_string(),
        "1.20.6".to_string(),
        "1.20.4".to_string(),
        "1.20.2".to_string(),
        "1.20.1".to_string(),
        "1.19.4".to_string(),
        "1.19.2".to_string(),
        "1.18.2".to_string(),
        "1.16.5".to_string(),
        "1.12.2".to_string(),
        "1.7.10".to_string(),
    ]
}

#[tauri::command]
pub fn get_instances(app: AppHandle) -> Vec<GameInstance> {
    load_instances(&app)
}

#[tauri::command]
pub fn create_instance(
    name: String,
    version: String,
    loader: Option<String>,
    app: AppHandle,
) -> Result<GameInstance, String> {
    let mut list = load_instances(&app);
    let instance = GameInstance {
        id: new_instance_id(),
        name,
        version,
        loader,
        last_played: None,
    };
    list.push(instance.clone());
    save_instances(&app, &list)?;
    Ok(instance)
}

#[tauri::command]
pub fn delete_instance(id: String, app: AppHandle) -> Result<(), String> {
    let mut list = load_instances(&app);
    list.retain(|i| i.id != id);
    save_instances(&app, &list)
}

/// 把 Maven 坐标（group:artifact:version[:classifier]）还原为 libraries 下的相对路径。
fn maven_path(name: &str) -> Option<String> {
    let parts: Vec<&str> = name.split(':').collect();
    if parts.len() < 3 {
        return None;
    }
    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];
    let file = match parts.get(3) {
        Some(c) => format!("{}-{}-{}.jar", artifact, version, c),
        None => format!("{}-{}.jar", artifact, version),
    };
    Some(format!("{}/{}/{}/{}", group, artifact, version, file))
}

/// 判定 arguments 里带 rules 的参数在当前系统是否启用。
///
/// 规则语义与 Mojang 一致：按顺序求值，第一条命中的规则决定去留；
/// 全部不命中则不启用。此处只做 os.name / os.arch 级别的判定
/// （arguments 里的条件参数几乎只用 os.name），版本号级别的判定交给 lib-core 侧。
fn rules_allow(rules: Option<&serde_json::Value>, _version: &str) -> bool {
    let Some(rules) = rules.and_then(|r| r.as_array()) else {
        return true;
    };
    let os_name = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    };
    let arch = if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else {
        "x86_64"
    };

    for rule in rules {
        let matched = if let Some(os) = rule.get("os") {
            let name_ok = os
                .get("name")
                .and_then(|n| n.as_str())
                .map(|n| n == os_name)
                .unwrap_or(true);
            let arch_ok = os
                .get("arch")
                .and_then(|a| a.as_str())
                .map(|a| a == arch)
                .unwrap_or(true);
            name_ok && arch_ok
        } else {
            true
        };
        if matched {
            let action = rule.get("action").and_then(|a| a.as_str()).unwrap_or("allow");
            return action == "allow";
        }
    }
    false
}

/// 启动一次游戏（lib-core Launch.run 的后端实现）。
///
/// 流程（参考 HMCLCore 的启动编排，简化版）：
///   解析版本 JSON → 组装类路径（客户端 jar + libraries + natives）→ 解析游戏参数并做变量替换
///   → 拼接 JVM 参数（内存、classpath、主类）→ 以指定 Java 拉起进程。
/// 注：依赖库 / 资源 / 原生库的**下载**由 lib-core 的 VersionRepository 负责（计划 → DownloadManager），
/// 此处只负责「已就位文件的装配与启动」。
#[tauri::command]
pub fn launch_minecraft(req: LaunchRequest, app: AppHandle) -> Result<String, String> {
    let mc = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(".aelux")
        .join("minecraft");
    let version = req.instance.version.clone();
    let json_path = mc
        .join("versions")
        .join(&version)
        .join(format!("{}.json", version));

    let text = std::fs::read_to_string(&json_path)
        .map_err(|_| format!("缺少版本文件：{}", json_path.display()))?;
    let vjson: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;

    let main_class = vjson
        .get("mainClass")
        .and_then(|v| v.as_str())
        .ok_or("版本 JSON 缺少 mainClass")?
        .to_string();
    let client_jar = mc.join("versions").join(&version).join(format!("{}.jar", version));
    if !client_jar.exists() {
        return Err(format!(
            "缺少客户端 jar：{}（该版本可能未下载完成，请重新安装）",
            client_jar.display()
        ));
    }

    // 类路径：客户端 jar + 已下载的 libraries
    let mut classpath = vec![client_jar.to_string_lossy().to_string()];
    if let Some(libs) = vjson.get("libraries").and_then(|l| l.as_array()) {
        for lib in libs {
            if let Some(name) = lib.get("name").and_then(|n| n.as_str()) {
                if let Some(p) = maven_path(name) {
                    let jar = mc.join("libraries").join(p);
                    if jar.exists() {
                        classpath.push(jar.to_string_lossy().to_string());
                    }
                }
            }
        }
    }
    // 原生库 jar 也进 classpath：LWJGL 3 会自行从 classpath 里解出 .dll/.so。
    let natives_dir = mc.join("natives").join(&version);
    if let Ok(entries) = std::fs::read_dir(&natives_dir) {
        for e in entries.flatten() {
            let path = e.path();
            if path.extension().map(|x| x == "jar").unwrap_or(false) {
                classpath.push(path.to_string_lossy().to_string());
            }
        }
    }

    // 资源索引名：新版在 assetIndex.id，旧版在 assets 字段。
    let assets_index = vjson
        .get("assetIndex")
        .and_then(|a| a.get("id"))
        .and_then(|a| a.as_str())
        .or_else(|| vjson.get("assets").and_then(|a| a.as_str()))
        .unwrap_or("legacy")
        .to_string();

    // 版本类型（正式版 / snapshot），arguments 里会用到 ${version_type}
    let version_type = vjson
        .get("type")
        .and_then(|t| t.as_str())
        .unwrap_or("release")
        .to_string();

    // 游戏参数：新版 arguments.game 或旧版 minecraftArguments
    let mut game_args: Vec<String> = Vec::new();
    if let Some(args) = vjson
        .get("arguments")
        .and_then(|a| a.get("game"))
        .and_then(|g| g.as_array())
    {
        for a in args {
            if let Some(s) = a.as_str() {
                game_args.push(s.to_string());
            } else if let Some(value) = a.get("value") {
                // 形如 { "rules": [...], "value": "--xxx" | ["--a","--b"] }
                if !rules_allow(a.get("rules"), &version) {
                    continue;
                }
                match value {
                    Some(v) if v.is_string() => game_args.push(v.as_str().unwrap_or_default().to_string()),
                    Some(v) if v.is_array() => {
                        for item in v.as_array().unwrap() {
                            if let Some(s) = item.as_str() {
                                game_args.push(s.to_string());
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
    } else if let Some(legacy) = vjson.get("minecraftArguments").and_then(|m| m.as_str()) {
        game_args = legacy.split_whitespace().map(|s| s.to_string()).collect();
    }

    // 变量替换
    let player = req
        .session
        .as_ref()
        .map(|s| s.username.clone())
        .unwrap_or_else(|| req.instance.name.clone());
    let uuid = req
        .session
        .as_ref()
        .map(|s| s.uuid.clone())
        .unwrap_or_else(|| "offline".to_string());
    let token = req
        .session
        .as_ref()
        .and_then(|s| s.access_token.clone())
        .unwrap_or_else(|| "0".to_string());
    let user_type = match req.session.as_ref().map(|s| s.r#type.as_str()) {
        Some("microsoft") => "msa",
        _ => "mojang",
    };

    let mc_dir = mc.to_string_lossy().to_string();
    let assets_root = mc.join("assets").to_string_lossy().to_string();
    let replacements: Vec<(&str, String)> = vec![
        ("${auth_player_name}", player),
        ("${version_name}", version.clone()),
        ("${version_type}", version_type.clone()),
        ("${game_directory}", mc_dir),
        ("${assets_root}", assets_root),
        ("${assets_index_name}", assets_index),
        ("${auth_uuid}", uuid),
        ("${auth_access_token}", token),
        ("${user_type}", user_type.to_string()),
        ("${user_properties}", "{}".to_string()),
        ("${resolution_width}", "854".to_string()),
        ("${resolution_height}", "480".to_string()),
    ];
    game_args = game_args
        .into_iter()
        .map(|a| {
            let mut s = a;
            for (k, v) in &replacements {
                s = s.replace(k, v);
            }
            s
        })
        .collect();

    // JVM 参数
    let sep = if cfg!(windows) { ";" } else { ":" };
    let mut jvm_args = vec![
        format!("-Xmx{}M", req.memory_mb),
        "-XX:+UnlockExperimentalVMOptions".to_string(),
        "-XX:+UseG1GC".to_string(),
    ];
    // 原生库目录（LWJGL 2 需要显式指定；LWJGL 3 会自己从 classpath 解）
    if natives_dir.exists() {
        jvm_args.push(format!(
            "-Djava.library.path={}",
            natives_dir.to_string_lossy()
        ));
    }
    jvm_args.push("-cp".to_string());
    jvm_args.push(classpath.join(sep));

    let java = if req.java_path.is_empty() {
        "java".to_string()
    } else {
        req.java_path.clone()
    };

    let child = std::process::Command::new(&java)
        .args(&jvm_args)
        .arg(main_class)
        .args(&game_args)
        .current_dir(&mc)
        .spawn();

    match child {
        Ok(c) => Ok(format!("已启动（pid {}）", c.id())),
        Err(e) => Err(format!("启动失败：{}", e)),
    }
}

#[tauri::command]
pub fn login_offline(username: String, state: State<Mutex<LauncherState>>) -> Result<String, String> {
    let mut state = state.lock().unwrap();
    state.current_user = Some(username.clone());
    Ok(format!("已登录为 {}", username))
}

#[tauri::command]
pub fn get_settings() -> serde_json::Value {
    serde_json::json!({
        "memory": 2048,
        "java_path": "",
        "window_width": 854,
        "window_height": 480,
        "mc_directory": "~/.minecraft",
        "instances_directory": "~/aelux/instances",
        "close_game_on_exit": false,
        "auto_update": true,
        "show_console": true
    })
}

#[tauri::command]
pub fn save_settings(_settings: serde_json::Value) -> Result<(), String> {
    // TODO: 保存设置到文件
    Ok(())
}

#[tauri::command]
pub fn minimize_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.minimize().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_maximize(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_maximized().unwrap_or(false) {
            window.unmaximize().map_err(|e| e.to_string())?;
        } else {
            window.maximize().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn close_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 官方启动器的 .minecraft 目录候选路径（按平台）。
///
/// - Windows: `%APPDATA%\.minecraft`
/// - macOS:   `~/Library/Application Support/minecraft`
/// - Linux:   `~/.minecraft`（多数发行版）
fn official_minecraft_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    if cfg!(target_os = "windows") {
        if let Some(appdata) = std::env::var_os("APPDATA") {
            dirs.push(PathBuf::from(appdata).join(".minecraft"));
        }
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            dirs.push(PathBuf::from(local).join(".minecraft"));
        }
    } else if cfg!(target_os = "macos") {
        if let Some(home) = dirs::home_dir() {
            dirs.push(
                home.join("Library")
                    .join("Application Support")
                    .join("minecraft"),
            );
        }
    } else {
        if let Some(home) = dirs::home_dir() {
            dirs.push(home.join(".minecraft"));
        }
    }
    dirs
}

#[tauri::command]
pub fn detect_official_launcher() -> Option<FolderInfo> {
    for mc_path in official_minecraft_dirs() {
        if !mc_path.exists() {
            continue;
        }
        // 官方目录必须有 versions 子目录才是有效的启动器数据目录
        if !mc_path.join("versions").is_dir() {
            continue;
        }
        return Some(FolderInfo {
            name: "官方启动器".to_string(),
            path: mc_path.to_string_lossy().to_string(),
            version_count: count_versions(&mc_path),
        });
    }
    None
}

#[tauri::command]
pub fn get_mc_versions(folder_path: String) -> Vec<VersionInfo> {
    let versions_path = PathBuf::from(&folder_path).join("versions");
    let mut versions = Vec::new();
    
    if let Ok(entries) = std::fs::read_dir(&versions_path) {
        for entry in entries.flatten() {
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                let name = entry.file_name().to_string_lossy().to_string();
                let json_path = entry.path().join(format!("{}.json", name));
                
                let (version_type, date) = if json_path.exists() {
                    if let Ok(content) = std::fs::read_to_string(&json_path) {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                            let vtype = json.get("type")
                                .and_then(|t| t.as_str())
                                .unwrap_or("release")
                                .to_string();
                            let date = json.get("releaseTime")
                                .and_then(|t| t.as_str())
                                .map(|s| s[0..10].to_string());
                            (vtype, date)
                        } else {
                            ("release".to_string(), None)
                        }
                    } else {
                        ("release".to_string(), None)
                    }
                } else {
                    ("release".to_string(), None)
                };
                
                let mod_loader = if name.contains("fabric") {
                    Some("Fabric".to_string())
                } else if name.contains("forge") {
                    Some("Forge".to_string())
                } else if name.contains("neoforge") {
                    Some("NeoForge".to_string())
                } else if name.contains("quilt") {
                    Some("Quilt".to_string())
                } else {
                    None
                };
                
                versions.push(VersionInfo {
                    id: name.clone(),
                    name,
                    version_type,
                    mod_loader,
                    date,
                });
            }
        }
    }
    
    versions.sort_by(|a, b| b.date.cmp(&a.date));
    versions
}

fn count_versions(path: &PathBuf) -> usize {
    let versions_path = path.join("versions");
    std::fs::read_dir(&versions_path)
        .map(|entries| entries.filter(|e| e.as_ref().map(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false)).unwrap_or(false)).count())
        .unwrap_or(0)
}

#[tauri::command]
pub fn add_folder(name: String, path: String) -> Result<FolderInfo, String> {
    let mc_path = PathBuf::from(&path);
    if !mc_path.exists() {
        return Err("文件夹不存在".to_string());
    }
    if !mc_path.join("versions").exists() {
        return Err("这不是有效的 .minecraft 文件夹（缺少 versions 目录）".to_string());
    }
    
    let version_count = count_versions(&mc_path);
    Ok(FolderInfo {
        name,
        path,
        version_count,
    })
}

#[tauri::command]
pub fn create_tag(name: String, color: String, state: State<Mutex<LauncherState>>) -> Result<TagInfo, String> {
    let mut state = state.lock().unwrap();
    let id = name.to_lowercase().replace(" ", "_");
    
    if state.tags.iter().any(|t| t.id == id) {
        return Err("标签已存在".to_string());
    }
    
    let tag = TagInfo {
        id: id.clone(),
        name,
        color,
        version_ids: Vec::new(),
    };
    
    state.tags.push(tag.clone());
    Ok(tag)
}

#[tauri::command]
pub fn delete_tag(id: String, state: State<Mutex<LauncherState>>) -> Result<(), String> {
    let mut state = state.lock().unwrap();
    state.tags.retain(|t| t.id != id);
    Ok(())
}

#[tauri::command]
pub fn get_tags(state: State<Mutex<LauncherState>>) -> Vec<TagInfo> {
    let state = state.lock().unwrap();
    state.tags.clone()
}

/// 打开目录：Windows 用 explorer，macOS 用 open，Linux 用 xdg-open。
#[tauri::command]
pub fn open_folder_in_explorer(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("目录不存在：{}", p.display()));
    }
    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = std::process::Command::new("explorer");
        // explorer 会把路径当 glob 解析，含特殊字符时必须转成绝对规范路径
        c.arg(p.canonicalize().unwrap_or(p.clone()));
        c
    } else if cfg!(target_os = "macos") {
        let mut c = std::process::Command::new("open");
        c.arg(&p);
        c
    } else {
        let mut c = std::process::Command::new("xdg-open");
        c.arg(&p);
        c
    };
    cmd.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn select_folder() -> Result<Option<String>, String> {
    // This will be called from frontend using Tauri dialog plugin
    // For now return None, frontend will handle dialog
    Ok(None)
}