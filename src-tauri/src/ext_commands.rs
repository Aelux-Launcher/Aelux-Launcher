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

/* ===================== 版本清单 / JSON 拉取 ===================== */

fn fetch_text(url: &str) -> Result<String, String> {
    let client = reqwest::blocking::Client::new();
    let resp = client.get(url).send().map_err(|e| e.to_string())?;
    resp.text().map_err(|e| e.to_string())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteVersion {
    pub id: String,
    #[serde(rename = "type")]
    pub version_type: String,
    #[serde(rename = "releaseTime")]
    pub release_time: String,
    pub url: String,
    #[serde(default)]
    pub sha1: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteManifest {
    pub latest: serde_json::Value,
    pub versions: Vec<RemoteVersion>,
}

/// 拉取 MC 版本清单（lib-core VersionRepository.manifestProvider 的后端实现）。
/// 优先 BMCLAPI 镜像（国内可达），失败回退 Mojang 官方源。
#[tauri::command]
pub fn fetch_minecraft_manifest() -> Result<RemoteManifest, String> {
    let sources = [
        "https://bmclapi2.bangbang93.com/version_manifest.json",
        "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json",
    ];
    for src in sources {
        if let Ok(text) = fetch_text(src) {
            if let Ok(m) = serde_json::from_str::<RemoteManifest>(&text) {
                return Ok(m);
            }
        }
    }
    Err("无法获取版本清单".into())
}

/// 拉取任意 URL 的 JSON 文本（lib-core fetchVersionJson 的后端实现）。
#[tauri::command]
pub fn fetch_json(url: String) -> Result<String, String> {
    fetch_text(&url)
}

/* ===================== Java 探测 ===================== */

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JreInfo {
    pub path: String,
    pub major: i32,
    pub version: String,
}

fn java_major_from_version(v: &str) -> i32 {
    let parts: Vec<&str> = v.split('.').collect();
    if parts.first().map(|s| *s == "1").unwrap_or(false) {
        parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(8)
    } else {
        parts.first().and_then(|s| s.parse().ok()).unwrap_or(8)
    }
}

fn probe_java(path: &str) -> Option<JreInfo> {
    let out = std::process::Command::new(path).arg("-version").output().ok()?;
    let err = String::from_utf8_lossy(&out.stderr);
    let line = err.lines().next()?;
    // java -version 输出到 stderr，形如：java version "21.0.3" / openjdk version "17.0.10"
    let start = line.find('"')?;
    let rest = &line[start + 1..];
    let end = rest.find('"')?;
    let ver = &rest[..end];
    let major = java_major_from_version(ver);
    Some(JreInfo {
        path: path.to_string(),
        major,
        version: ver.to_string(),
    })
}

/// 探测可用 JRE：系统 PATH 的 java + 托管目录 <.aelux/jre/<major>/bin/java>。
/// 对应 lib-core JavaManager.listManaged / detectSystem。
#[tauri::command]
pub fn list_jres(app: AppHandle) -> Vec<JreInfo> {
    let mut result: Vec<JreInfo> = Vec::new();

    if let Some(info) = probe_java("java") {
        result.push(info);
    }

    if let Some(base) = app.path().app_data_dir().ok() {
        let jre_root = base.join(".aelux").join("jre");
        if let Ok(entries) = std::fs::read_dir(&jre_root) {
            for e in entries.flatten() {
                let java_bin = e.path().join("bin").join(if cfg!(windows) { "java.exe" } else { "java" });
                if java_bin.exists() {
                    if let Some(info) = probe_java(java_bin.to_str().unwrap_or("")) {
                        result.push(info);
                    }
                }
            }
        }
    }
    result
}

/* ===================== 运行期路径 ===================== */

#[tauri::command]
pub fn get_data_dir(app: AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .map(|p| p.to_string_lossy().to_string())
}
