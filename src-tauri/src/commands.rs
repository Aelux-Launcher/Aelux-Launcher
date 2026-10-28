use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::path::PathBuf;
use tauri::{State, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GameInstance {
    pub id: String,
    pub name: String,
    pub version: String,
    pub mod_loader: Option<String>,
    pub last_played: Option<String>,
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
            instances: vec![
                GameInstance {
                    id: "1".to_string(),
                    name: "原版生存".to_string(),
                    version: "1.21.4".to_string(),
                    mod_loader: None,
                    last_played: Some("2小时前".to_string()),
                },
                GameInstance {
                    id: "2".to_string(),
                    name: "模组服务器".to_string(),
                    version: "1.20.4".to_string(),
                    mod_loader: Some("Fabric".to_string()),
                    last_played: Some("昨天".to_string()),
                },
                GameInstance {
                    id: "3".to_string(),
                    name: "创造模式".to_string(),
                    version: "1.21.4".to_string(),
                    mod_loader: None,
                    last_played: Some("3天前".to_string()),
                },
            ],
            current_user: None,
            selected_version: None,
            tags: vec![
                TagInfo {
                    id: "favorites".to_string(),
                    name: "收藏".to_string(),
                    color: "#F44336".to_string(),
                    version_ids: vec!["1".to_string(), "3".to_string()],
                },
                TagInfo {
                    id: "survival".to_string(),
                    name: "生存".to_string(),
                    color: "#4CAF50".to_string(),
                    version_ids: vec!["1".to_string()],
                },
                TagInfo {
                    id: "modded".to_string(),
                    name: "模组".to_string(),
                    color: "#FF9800".to_string(),
                    version_ids: vec!["2".to_string()],
                },
            ],
            extra_folders: Vec::new(),
        }
    }
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
pub fn get_instances(state: State<Mutex<LauncherState>>) -> Vec<GameInstance> {
    let state = state.lock().unwrap();
    state.instances.clone()
}

#[tauri::command]
pub fn create_instance(
    name: String,
    version: String,
    mod_loader: Option<String>,
    state: State<Mutex<LauncherState>>,
) -> Result<GameInstance, String> {
    let mut state = state.lock().unwrap();
    let instance = GameInstance {
        id: (state.instances.len() + 1).to_string(),
        name,
        version,
        mod_loader,
        last_played: None,
    };
    state.instances.push(instance.clone());
    Ok(instance)
}

#[tauri::command]
pub fn delete_instance(id: String, state: State<Mutex<LauncherState>>) -> Result<(), String> {
    let mut state = state.lock().unwrap();
    state.instances.retain(|i| i.id != id);
    Ok(())
}

#[tauri::command]
pub fn launch_minecraft(version: String, state: State<Mutex<LauncherState>>) -> Result<String, String> {
    // TODO: 实现真实的启动逻辑
    // 1. 检查版本是否存在
    // 2. 下载版本文件（如果需要）
    // 3. 验证游戏文件
    // 4. 启动游戏进程
    
    let mut state = state.lock().unwrap();
    state.selected_version = Some(version.clone());
    
    Ok(format!("Minecraft {} 启动成功", version))
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

#[tauri::command]
pub fn detect_official_launcher() -> Option<FolderInfo> {
    let appdata = std::env::var("APPDATA").ok()?;
    let mc_path = PathBuf::from(appdata).join(".minecraft");
    
    if mc_path.exists() {
        let version_count = count_versions(&mc_path);
        Some(FolderInfo {
            name: "官方启动器".to_string(),
            path: mc_path.to_string_lossy().to_string(),
            version_count,
        })
    } else {
        None
    }
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

#[tauri::command]
pub fn open_folder_in_explorer(path: String) -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn select_folder() -> Result<Option<String>, String> {
    // This will be called from frontend using Tauri dialog plugin
    // For now return None, frontend will handle dialog
    Ok(None)
}