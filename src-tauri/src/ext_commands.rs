//! lib-platform 桥接命令：aelux-launcher-lib 的 PlatformAdapter 在桌面端通过 Tauri invoke 调用这里。
//! 这些命令是「唯一与系统交互的面」，不含业务规则（业务规则在 TS 层）。
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Read;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/* ===================== 本地 KV 存储 ===================== */

fn store_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    let _ = std::fs::create_dir_all(&dir);
    Some(dir.join("kv.json"))
}

fn load_kv(app: &AppHandle) -> HashMap<String, String> {
    if let Some(p) = store_path(app) {
        if let Ok(s) = std::fs::read_to_string(&p) {
            if let Ok(m) = serde_json::from_str::<HashMap<String, String>>(&s) {
                return m;
            }
        }
    }
    HashMap::new()
}

fn save_kv(app: &AppHandle, kv: &HashMap<String, String>) {
    if let Some(p) = store_path(app) {
        if let Ok(s) = serde_json::to_string(kv) {
            let _ = std::fs::write(p, s);
        }
    }
}

#[tauri::command]
pub fn kv_get(key: String, app: AppHandle) -> Option<String> {
    load_kv(&app).get(&key).cloned()
}

#[tauri::command]
pub fn kv_set(key: String, value: String, app: AppHandle) -> Result<(), String> {
    let mut kv = load_kv(&app);
    kv.insert(key, value);
    save_kv(&app, &kv);
    Ok(())
}

#[tauri::command]
pub fn kv_remove(key: String, app: AppHandle) -> Result<(), String> {
    let mut kv = load_kv(&app);
    kv.remove(&key);
    save_kv(&app, &kv);
    Ok(())
}

/* ===================== 打开外部链接 ===================== */

#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    tauri_plugin_opener::open_url(url, None::<String>).map_err(|e| e.to_string())
}

/* ===================== 下载文件 + 哈希校验 ===================== */

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

#[tauri::command]
pub fn download_file(url: String, dest: String, sha256: Option<String>) -> Result<String, String> {
    let client = reqwest::blocking::Client::new();
    let resp = client.get(&url).send().map_err(|e| e.to_string())?;
    let bytes = resp.bytes().map_err(|e| e.to_string())?;

    if let Some(parent) = PathBuf::from(&dest).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(&dest, &bytes).map_err(|e| e.to_string())?;

    if let Some(expected) = sha256 {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        let actual = hex_encode(&hasher.finalize());
        if actual != expected {
            let _ = std::fs::remove_file(&dest);
            return Err("sha256 校验失败".into());
        }
    }
    Ok(dest)
}

/* ===================== 更新 / 修复模组 / 遥测 ===================== */

#[tauri::command]
pub fn apply_update(_path: String) -> Result<(), String> {
    // 真实自更新建议走 tauri-plugin-updater（带签名校验）。
    // 这里仅占位：替换自身文件逻辑由更新通道处理。
    Ok(())
}

#[tauri::command]
pub fn inject_fixmod(version: String, loader: String, mods_dir: String) -> Result<(), String> {
    let dir = PathBuf::from(&mods_dir);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // 从打包资源目录取对应修复包；未随包发布时静默跳过（保底修复本就是尽力而为）
    if let Some(res) = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|x| x.to_path_buf()))
    {
        let candidate = res.join(format!("aelux-fixmod-{}-{}.jar", loader, version));
        if candidate.exists() {
            let _ = std::fs::copy(&candidate, dir.join(candidate.file_name().unwrap()));
        }
    }
    Ok(())
}

#[tauri::command]
pub fn remove_fixmod(mods_dir: String) -> Result<(), String> {
    let dir = PathBuf::from(&mods_dir);
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if name.starts_with("aelux-fixmod-") {
                let _ = std::fs::remove_file(e.path());
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn report_telemetry(events: Vec<serde_json::Value>) -> Result<(), String> {
    // 尽力上报：此处仅记录，真实上报由后台 API 接收（失败静默）。
    for ev in &events {
        println!("[telemetry] {:?}", ev);
    }
    Ok(())
}

/* ===================== bundled 资源读取 ===================== */

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BundledAnnouncement {
    pub id: String,
    pub title: String,
    pub body: String,
    pub date: String,
    #[serde(default = "default_scope")]
    pub scope: String,
    #[serde(default)]
    pub since_version: Option<String>,
}

fn default_scope() -> String {
    "bundled".to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LocalUpdate {
    pub version: String,
    pub url: String,
    pub sha256: String,
    pub size: i64,
    pub min: Option<String>,
}

#[tauri::command]
pub fn read_bundled_announcements(app: AppHandle) -> Vec<BundledAnnouncement> {
    let path = app.path().resource_dir().ok().map(|d| d.join("bundled-announcements.json"));
    if let Some(p) = path {
        if let Ok(s) = std::fs::read_to_string(&p) {
            if let Ok(v) = serde_json::from_str::<Vec<BundledAnnouncement>>(&s) {
                return v;
            }
        }
    }
    Vec::new()
}

#[tauri::command]
pub fn read_local_update(app: AppHandle) -> Option<LocalUpdate> {
    let path = app.path().resource_dir().ok().map(|d| d.join("latest.json"));
    if let Some(p) = path {
        if let Ok(s) = std::fs::read_to_string(&p) {
            if let Ok(u) = serde_json::from_str::<LocalUpdate>(&s) {
                return Some(u);
            }
        }
    }
    None
}

/* ===================== 文本读写（原子写） ===================== */

#[tauri::command]
pub fn read_text(path: String) -> Option<String> {
    std::fs::read_to_string(&path).ok()
}

#[tauri::command]
pub fn write_text(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = PathBuf::from(&path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    // 先写临时文件再原子 rename，避免断电留下半文件
    let tmp = format!("{}.tmp", path);
    std::fs::write(&tmp, content).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}
