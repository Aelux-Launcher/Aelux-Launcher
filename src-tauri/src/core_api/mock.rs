//! mock 链路：内置假实现。
//!
//! 目的：外部贡献者 clone 仓库后 `cargo tauri dev` 即可跑完整 UI
//! （README 写明：完整版需要官方分发的内核二进制，内核源码不公开）。
//!
//! 数据形状与真实链路一致；kv 用内存表；网络方法返回演示数据或明确错误。

use std::collections::BTreeMap;
use std::sync::Mutex;
use std::sync::OnceLock;

use crate::dto::{GameInstance, LatestVersions, LauncherConfig, OsInfo, VersionEntry, VersionManifest};

use super::CoreError;

fn kv_store() -> &'static Mutex<BTreeMap<String, String>> {
    static STORE: OnceLock<Mutex<BTreeMap<String, String>>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(BTreeMap::new()))
}

pub fn init(_app: &tauri::AppHandle) {
    tracing::info!("mock 链路启动：内核能力为内置假实现");
}

pub fn get_data_dir() -> String {
    // 无内核：指向系统临时目录下的演示目录，让「便携目录」等展示有落点
    std::env::temp_dir().join("aelux-mock").to_string_lossy().into_owned()
}

pub fn get_os_info() -> Result<OsInfo, CoreError> {
    Ok(OsInfo {
        name: std::env::consts::OS.into(),
        version: "mock".into(),
        arch: std::env::consts::ARCH.into(),
    })
}

pub fn get_core_version() -> String {
    "mock".into()
}

pub async fn fetch_json(_url: String) -> Result<String, CoreError> {
    Err("mock 链路不提供网络能力（请使用 dev-path 或 release-ffi 内核）".into())
}

pub async fn download_file(url: String, dest: String, _sha1: Option<String>) -> Result<String, CoreError> {
    // 模拟下载耗时，让进度 UI 有东西可看
    tokio::time::sleep(std::time::Duration::from_millis(800)).await;
    Ok(format!("mock://{dest} <- {url}"))
}

pub async fn fetch_minecraft_manifest() -> Result<VersionManifest, CoreError> {
    Ok(VersionManifest {
        latest: LatestVersions {
            release: "1.21.4".into(),
            snapshot: "25w14a".into(),
        },
        versions: [
            ("1.21.4", "release"),
            ("1.21.3", "release"),
            ("1.21.1", "release"),
            ("1.20.6", "release"),
            ("1.20.1", "release"),
            ("1.19.2", "release"),
            ("1.16.5", "release"),
            ("1.12.2", "release"),
            ("1.8.9", "release"),
            ("25w14a", "snapshot"),
            ("1.20.4", "release"),
        ]
        .into_iter()
        .map(|(id, kind)| VersionEntry {
            id: id.into(),
            kind: kind.into(),
            url: format!("https://piston-meta.mojang.com/mock/{id}.json"),
            time: "2026-01-01T00:00:00+00:00".into(),
            release_time: "2026-01-01T00:00:00+00:00".into(),
            sha1: None,
        })
        .collect(),
    })
}

pub fn list_instances() -> Result<Vec<GameInstance>, CoreError> {
    Ok(vec![
        GameInstance {
            id: "mock-1".into(),
            name: "1.21.4 原版".into(),
            version: "1.21.4".into(),
            loader: "vanilla".into(),
            loader_version: None,
            icon: None,
            created_at: "2026-01-01T00:00:00Z".into(),
            last_played_at: Some("2026-01-02T00:00:00Z".into()),
            playtime_secs: 3600,
        },
        GameInstance {
            id: "mock-2".into(),
            name: "1.20.1 Fabric".into(),
            version: "1.20.1".into(),
            loader: "fabric".into(),
            loader_version: Some("0.16.0".into()),
            icon: None,
            created_at: "2025-12-01T00:00:00Z".into(),
            last_played_at: None,
            playtime_secs: 0,
        },
    ])
}

pub fn create_instance(name: String, version: String, loader: Option<String>) -> Result<GameInstance, CoreError> {
    Ok(GameInstance {
        id: format!("mock-{}", rand_suffix()),
        name,
        version,
        loader: loader.unwrap_or_else(|| "vanilla".into()),
        loader_version: None,
        icon: None,
        created_at: "2026-01-01T00:00:00Z".into(),
        last_played_at: None,
        playtime_secs: 0,
    })
}

pub fn delete_instance(_id: String) -> Result<(), CoreError> {
    Ok(())
}

pub fn kv_get(key: String) -> Option<String> {
    kv_store().lock().ok()?.get(&key).cloned()
}

pub fn kv_set(key: String, value: String) -> Result<(), CoreError> {
    kv_store().lock().map_err(|_| "kv 锁中毒".to_string())?.insert(key, value);
    Ok(())
}

pub fn kv_remove(key: String) -> Result<(), CoreError> {
    kv_store().lock().map_err(|_| "kv 锁中毒".to_string())?.remove(&key);
    Ok(())
}

pub fn get_config() -> Result<LauncherConfig, CoreError> {
    Ok(LauncherConfig::default())
}

pub fn save_config(_config: LauncherConfig) -> Result<(), CoreError> {
    Ok(())
}

fn rand_suffix() -> u32 {
    use std::hash::{BuildHasher, Hasher};
    let h = std::collections::hash_map::RandomState::new();
    h.build_hasher().finish() as u32
}
