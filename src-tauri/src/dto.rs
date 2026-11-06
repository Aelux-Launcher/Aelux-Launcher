//! 壳层 DTO：启动器侧拥有的数据契约。
//!
//! 这些类型是 tauri-specta 导出 TS 绑定的**唯一来源**：
//! - dev-path 链路：aelux-core 的同名结构序列化成 JSON 后落进这里；
//! - release-ffi 链路：cdylib 返回的 JSON 直接反序列化到这里；
//! - mock 链路：直接构造。
//!
//! 字段与 aelux-core 的 serde 形状保持一致（camelCase）。

use serde::{Deserialize, Serialize};

/// 运行环境信息。
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct OsInfo {
    pub name: String,
    pub version: String,
    pub arch: String,
}

/// Minecraft 版本清单里的一条版本。
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct VersionEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub url: String,
    pub time: String,
    pub release_time: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha1: Option<String>,
}

/// 各渠道最新版本。
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LatestVersions {
    pub release: String,
    #[serde(default)]
    pub snapshot: String,
}

/// Minecraft 版本清单。
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct VersionManifest {
    pub latest: LatestVersions,
    pub versions: Vec<VersionEntry>,
}

/// 游戏实例。
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct GameInstance {
    pub id: String,
    pub name: String,
    pub version: String,
    pub loader: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub loader_version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    pub created_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_played_at: Option<String>,
    /// 累计游玩秒数（u32：specta 禁止导出 BigInt 类型）
    #[serde(default)]
    pub playtime_secs: u32,
}

/// 启动器全局配置。
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(default, rename_all = "camelCase")]
pub struct LauncherConfig {
    pub theme: String,
    pub language: String,
    pub java_path: String,
    pub memory_min_mb: u32,
    pub memory_max_mb: u32,
    pub jvm_args: Vec<String>,
    pub game_args: Vec<String>,
    pub game_width: u32,
    pub game_height: u32,
    pub download_concurrency: u32,
    pub hide_on_launch: bool,
}

impl Default for LauncherConfig {
    fn default() -> Self {
        Self {
            theme: "light".into(),
            language: "zh-CN".into(),
            java_path: String::new(),
            memory_min_mb: 512,
            memory_max_mb: 4096,
            jvm_args: Vec::new(),
            game_args: Vec::new(),
            game_width: 854,
            game_height: 480,
            download_concurrency: 8,
            hide_on_launch: false,
        }
    }
}

/// 设备码登录会话（轮询时原样回传）。
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCodeSession {
    pub user_code: String,
    pub verification_uri: String,
    pub interval: u64,
    pub expires_in: u64,
    pub device_code: String,
}

/// 已登录的微软 Minecraft 账户。
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    /// 微软账户标识（XBL user hash，多账户主键）
    pub msa_id: String,
    pub username: String,
    /// Minecraft UUID（无横线）
    pub uuid: String,
    /// 登录时间（Unix 秒，仅展示）
    pub logged_in_at: String,
}

/// 本地账户列表条目（微软 / 离线多账户并存）。
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct StoredAccount {
    /// 微软账户为 msaId，离线账户为离线 UUID
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub username: String,
    pub uuid: String,
    /// 登录时间（Unix 秒，仅展示）
    pub logged_in_at: String,
}

/// 当前登录会话。
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AccountSession {
    #[serde(rename = "type")]
    pub kind: String,
    pub username: String,
    pub uuid: String,
}

/// 外置登录认证服务器（authlib-injector）。
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AuthServer {
    pub id: String,
    pub name: String,
    pub url: String,
}
