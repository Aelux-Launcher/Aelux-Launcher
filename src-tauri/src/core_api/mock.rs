//! mock 链路：内置假实现。
//!
//! 目的：外部贡献者 clone 仓库后 `cargo tauri dev` 即可跑完整 UI
//! （README 写明：完整版需要官方分发的内核二进制，内核源码不公开）。
//!
//! 数据形状与真实链路一致；kv 用内存表；网络方法返回演示数据或明确错误。

use std::collections::BTreeMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::sync::OnceLock;

use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::dto::{
    Account, AccountSession, AuthServer, DeviceCodeSession, GameInstance, InstallResult,
    JavaInstallResult, JavaRuntime, LaunchOutcome, LatestVersions, LauncherConfig,
    LocalContentItem, ModUpdate, ModpackImportResult, OsInfo, RunningGame, StoredAccount,
    VersionEntry, VersionManifest,
};

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

/// mock 轮询计数：前 2 次 pending，第 3 次起登录成功（预览可测完整流程）。
static MS_POLL_COUNT: AtomicUsize = AtomicUsize::new(0);

pub async fn auth_start_device_flow() -> Result<DeviceCodeSession, CoreError> {
    MS_POLL_COUNT.store(0, Ordering::SeqCst);
    Ok(DeviceCodeSession {
        user_code: "MOCK-CODE-1234".into(),
        verification_uri: "https://microsoft.com/link".into(),
        interval: 1,
        expires_in: 900,
        device_code: "mock-device-code".into(),
    })
}

pub async fn auth_poll_device_flow(_session: DeviceCodeSession) -> Result<Account, CoreError> {
    let n = MS_POLL_COUNT.fetch_add(1, Ordering::SeqCst);
    if n < 2 {
        Err("等待用户完成授权".into())
    } else {
        Ok(Account {
            msa_id: "mock-msa-id".into(),
            username: "MockPlayer".into(),
            uuid: "069a79f444e94726a5befca90e38aaf5".into(),
            logged_in_at: format!(
                "{}",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0)
            ),
        })
    }
}

pub fn auth_logout(_msa_id: String) -> Result<(), CoreError> {
    Ok(())
}

pub fn list_instances() -> Result<Vec<GameInstance>, CoreError> {
    Ok(vec![
        GameInstance {
            id: "mock-1".into(),
            name: "1.21.4 原版".into(),
            version: "1.21.4".into(),
            loader: "vanilla".into(),
            loader_version: None,
            version_id: Some("1.21.4".into()),
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
            version_id: Some("fabric-loader-0.16.0-1.20.1".into()),
            icon: None,
            created_at: "2025-12-01T00:00:00Z".into(),
            last_played_at: None,
            playtime_secs: 0,
        },
    ])
}

pub fn create_instance(
    name: String,
    version: String,
    loader: Option<String>,
    loader_version: Option<String>,
) -> Result<GameInstance, CoreError> {
    Ok(GameInstance {
        id: format!("mock-{}", rand_suffix()),
        name,
        version: version.clone(),
        loader: loader.clone().unwrap_or_else(|| "vanilla".into()),
        loader_version,
        version_id: Some(version),
        icon: None,
        created_at: "2026-01-01T00:00:00Z".into(),
        last_played_at: None,
        playtime_secs: 0,
    })
}

pub fn delete_instance(_id: String) -> Result<(), CoreError> {
    Ok(())
}

/* --------------------------- Java / 本地内容 --------------------------- */

pub fn scan_java() -> Result<Vec<JavaRuntime>, CoreError> {
    // mock 不扫描本机；返回空列表让界面进入「未检测到 Java」分支
    Ok(Vec::new())
}

pub fn required_java(mc_version: String) -> u32 {
    // 与内核同一套 MC 版本 → Java 主版本规则（mock 仅保留判定所需的最小子集）
    let mut parts = mc_version.split('.').filter_map(|p| p.parse::<u32>().ok());
    if parts.next() != Some(1) {
        return 21;
    }
    match (parts.next().unwrap_or(0), parts.next().unwrap_or(0)) {
        (18..=19, _) => 17,
        (20, 0..=4) => 17,
        (17, _) => 16,
        (1..=16, _) => 8,
        _ => 21,
    }
}

pub fn get_instance_dir(id: String) -> Result<String, CoreError> {
    Ok(format!("{}/instances/{id}", get_data_dir()))
}

pub fn list_content(_instance_id: String, _kind: String) -> Result<Vec<LocalContentItem>, CoreError> {
    Ok(Vec::new())
}

pub fn set_content_enabled(
    _instance_id: String,
    _kind: String,
    _file_name: String,
    _enabled: bool,
) -> Result<(), CoreError> {
    Ok(())
}

pub fn delete_content(_instance_id: String, _kind: String, _file_name: String) -> Result<(), CoreError> {
    Ok(())
}

pub fn import_content(_instance_id: String, _kind: String, _source: String) -> Result<LocalContentItem, CoreError> {
    Err("mock 链路不提供文件系统能力".into())
}

pub fn read_text(_path: String) -> Result<Option<String>, CoreError> {
    Ok(None)
}

pub fn write_text(_path: String, _content: String) -> Result<(), CoreError> {
    Ok(())
}

pub fn delete_path(_path: String) -> Result<(), CoreError> {
    Ok(())
}

pub fn rename_path(_from: String, _to: String) -> Result<(), CoreError> {
    Err("mock 链路不提供文件系统能力".into())
}

/* -------------------------- 加载器 / 前置 API -------------------------- */

pub async fn loader_versions(loader: String, _mc_version: String) -> Result<Vec<String>, CoreError> {
    let list = match loader.as_str() {
        "forge" => vec!["54.1.17", "54.1.13", "54.1.9"],
        "neoforge" => vec!["21.4.117", "21.4.110", "21.4.101"],
        "fabric" => vec!["0.20.1", "0.19.2", "0.18.4"],
        "quilt" => vec!["0.27.0", "0.26.4", "0.26.1"],
        "optifine" => vec!["HD U I7", "HD U I6", "HD U I5"],
        other => return Err(format!("未知加载器: {other}").into()),
    };
    Ok(list.into_iter().map(str::to_string).collect())
}

pub async fn mod_api_versions(api: String, _mc_version: String) -> Result<Vec<String>, CoreError> {
    let list = match api.as_str() {
        "fabric-api" => vec!["0.119.4+1.21.4", "0.119.3+1.21.4", "0.119.2+1.21.4"],
        "qsl" => vec!["7.7.0+0.27.0", "7.6.0+0.27.0", "7.5.0+0.27.0"],
        other => return Err(format!("未知前置 API: {other}").into()),
    };
    Ok(list.into_iter().map(str::to_string).collect())
}

/* ----------------------- 账户 / 会话 / 认证服务器 ----------------------- */
// 无内核时仍需与内核同规则：离线 UUID、LittleSkin 播种、地址去重。

const ACCOUNTS_KEY: &str = "accounts";
const SESSION_KEY: &str = "session";
const AUTH_SERVERS_KEY: &str = "auth-servers";
const AUTH_SERVERS_SEEDED_KEY: &str = "auth-servers-seeded";
const LITTLESKIN: (&str, &str, &str) = (
    "littleskin",
    "LittleSkin",
    "https://littleskin.cn/api/yggdrasil",
);

fn read_list<T: DeserializeOwned>(key: &str) -> Vec<T> {
    kv_get(key.to_string())
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn write_list<T: Serialize>(key: &str, list: &[T]) -> Result<(), CoreError> {
    let raw = serde_json::to_string(list).map_err(|e| e.to_string())?;
    kv_set(key.to_string(), raw)
}

pub fn accounts_list() -> Result<Vec<StoredAccount>, CoreError> {
    Ok(read_list(ACCOUNTS_KEY))
}

pub fn accounts_upsert(account: StoredAccount) -> Result<(), CoreError> {
    if account.id.trim().is_empty() {
        return Err("账户 id 不能为空".into());
    }
    if account.username.trim().is_empty() {
        return Err("用户名不能为空".into());
    }
    let mut list = read_list::<StoredAccount>(ACCOUNTS_KEY);
    match list.iter().position(|a| a.id == account.id) {
        Some(idx) => list[idx] = account,
        None => list.push(account),
    }
    write_list(ACCOUNTS_KEY, &list)
}

pub fn accounts_remove(id: String) -> Result<(), CoreError> {
    let mut list = read_list::<StoredAccount>(ACCOUNTS_KEY);
    let removed = list.iter().position(|a| a.id == id).map(|idx| list.remove(idx));
    write_list(ACCOUNTS_KEY, &list)?;
    if let Some(acc) = removed {
        if account_session_get()?.is_some_and(|s| s.uuid == acc.uuid) {
            account_session_set(None)?;
        }
    }
    Ok(())
}

pub fn account_session_get() -> Result<Option<AccountSession>, CoreError> {
    Ok(kv_get(SESSION_KEY.to_string()).and_then(|raw| serde_json::from_str(&raw).ok()))
}

pub fn account_session_set(session: Option<AccountSession>) -> Result<(), CoreError> {
    match session {
        Some(s) => {
            let raw = serde_json::to_string(&s).map_err(|e| e.to_string())?;
            kv_set(SESSION_KEY.to_string(), raw)
        }
        None => kv_remove(SESSION_KEY.to_string()),
    }
}

pub fn account_login_offline(username: String) -> Result<StoredAccount, CoreError> {
    let name = username.trim();
    if name.is_empty() {
        return Err("用户名不能为空".into());
    }
    let uuid = offline_uuid(name);
    let account = StoredAccount {
        id: uuid.clone(),
        kind: "offline".into(),
        username: name.into(),
        uuid: uuid.clone(),
        logged_in_at: now_secs(),
    };
    accounts_upsert(account.clone())?;
    account_session_set(Some(AccountSession {
        kind: "offline".into(),
        username: name.into(),
        uuid,
    }))?;
    Ok(account)
}

pub fn auth_servers_list() -> Result<Vec<AuthServer>, CoreError> {
    let mut list = read_list::<AuthServer>(AUTH_SERVERS_KEY);
    if kv_get(AUTH_SERVERS_SEEDED_KEY.to_string()).is_none() {
        if !list.iter().any(|s| s.id == LITTLESKIN.0) {
            list.insert(
                0,
                AuthServer {
                    id: LITTLESKIN.0.into(),
                    name: LITTLESKIN.1.into(),
                    url: LITTLESKIN.2.into(),
                },
            );
        }
        write_list(AUTH_SERVERS_KEY, &list)?;
        kv_set(AUTH_SERVERS_SEEDED_KEY.to_string(), "1".into())?;
    }
    Ok(list)
}

pub fn auth_server_add(name: Option<String>, url: String) -> Result<AuthServer, CoreError> {
    let addr = url.trim().trim_end_matches('/').to_string();
    if addr.is_empty() {
        return Err("认证服务器地址不能为空".into());
    }
    let mut list = read_list::<AuthServer>(AUTH_SERVERS_KEY);
    if list.iter().any(|s| s.url == addr) {
        return Err("该认证服务器已添加".into());
    }
    let host = host_of(&addr);
    let server = AuthServer {
        id: format!("{}-{:08x}", millis(), rand_suffix()),
        name: name
            .as_deref()
            .map(str::trim)
            .filter(|n| !n.is_empty())
            .unwrap_or(&host)
            .to_string(),
        url: addr,
    };
    list.push(server.clone());
    write_list(AUTH_SERVERS_KEY, &list)?;
    Ok(server)
}

pub fn auth_server_remove(id: String) -> Result<(), CoreError> {
    let mut list = read_list::<AuthServer>(AUTH_SERVERS_KEY);
    list.retain(|s| s.id != id);
    write_list(AUTH_SERVERS_KEY, &list)
}

fn host_of(url: &str) -> String {
    let rest = url.split_once("://").map(|(_, r)| r).unwrap_or(url);
    rest.split(['/', '?', '#']).next().unwrap_or(rest).trim().to_string()
}

fn now_secs() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
        .to_string()
}

fn millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// 与内核 `accounts::offline_uuid` 完全一致的离线 UUID。
fn offline_uuid(name: &str) -> String {
    let hex = md5_hex(format!("OfflinePlayer:{name}").as_bytes());
    format!(
        "{}-{}-3{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[13..16],
        &hex[16..20],
        &hex[20..32]
    )
}

/// 紧凑 MD5（mock 专用，保证预览数据与真实内核一致）。
fn md5_hex(input: &[u8]) -> String {
    const S: [u32; 64] = [
        7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20,
        5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
        6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
    ];
    const K: [u32; 64] = [
        0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613,
        0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193,
        0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d,
        0x02441453, 0xd8a1e681, 0xe7d3fbc8, 0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed,
        0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122,
        0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa,
        0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665, 0xf4292244,
        0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
        0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb,
        0xeb86d391,
    ];
    let mut msg = input.to_vec();
    let bit_len = (input.len() as u64) * 8;
    msg.push(0x80);
    while msg.len() % 64 != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&bit_len.to_le_bytes());
    let mut state = [0x67452301u32, 0xefcdab89, 0x98badcfe, 0x10325476];
    for block in msg.chunks_exact(64) {
        let mut m = [0u32; 16];
        for (i, word) in m.iter_mut().enumerate() {
            *word = u32::from_le_bytes(block[i * 4..i * 4 + 4].try_into().expect("64 字节块"));
        }
        let [mut a, mut b, mut c, mut d] = state;
        for i in 0..64 {
            let (f, g) = match i {
                0..=15 => ((b & c) | (!b & d), i),
                16..=31 => ((d & b) | (!d & c), (5 * i + 1) % 16),
                32..=47 => (b ^ c ^ d, (3 * i + 5) % 16),
                _ => (c ^ (b | !d), (7 * i) % 16),
            };
            let tmp = d;
            d = c;
            c = b;
            b = b.wrapping_add(
                a.wrapping_add(f)
                    .wrapping_add(K[i])
                    .wrapping_add(m[g])
                    .rotate_left(S[i]),
            );
            a = tmp;
        }
        state[0] = state[0].wrapping_add(a);
        state[1] = state[1].wrapping_add(b);
        state[2] = state[2].wrapping_add(c);
        state[3] = state[3].wrapping_add(d);
    }
    let mut out = String::with_capacity(32);
    for word in state {
        for byte in word.to_le_bytes() {
            out.push_str(&format!("{byte:02x}"));
        }
    }
    out
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

/* ---------------------------- 安装 / 启动 / 市场 ---------------------------- */

/// mock 安装结果：按命名规则拼出与内核一致的版本目录名。
fn mock_install(mc_version: &str, loader: &str, loader_version: Option<&str>) -> InstallResult {
    let version_id = match (loader, loader_version) {
        ("vanilla", _) | ("", _) => mc_version.to_string(),
        ("fabric", Some(v)) => format!("fabric-loader-{v}-{mc_version}"),
        ("quilt", Some(v)) => format!("quilt-loader-{v}-{mc_version}"),
        ("forge", Some(v)) => format!("{mc_version}-forge-{v}"),
        ("neoforge", Some(v)) => format!("neoforge-{v}"),
        (other, _) => format!("{other}-{mc_version}"),
    };
    InstallResult {
        version_id,
        mc_version: mc_version.to_string(),
        loader: loader.to_string(),
        loader_version: loader_version.map(str::to_string),
        files: 128,
    }
}

pub async fn install_version(
    mc_version: String,
    loader: String,
    loader_version: Option<String>,
) -> Result<InstallResult, CoreError> {
    tokio::time::sleep(std::time::Duration::from_millis(600)).await;
    Ok(mock_install(&mc_version, &loader, loader_version.as_deref()))
}

pub async fn install_instance(id: String) -> Result<InstallResult, CoreError> {
    tokio::time::sleep(std::time::Duration::from_millis(600)).await;
    Ok(mock_install("1.21.4", "vanilla", None).with_id(&id))
}

pub async fn set_instance_loader(
    id: String,
    loader: String,
    loader_version: Option<String>,
) -> Result<InstallResult, CoreError> {
    let _ = id;
    tokio::time::sleep(std::time::Duration::from_millis(600)).await;
    Ok(mock_install("1.21.4", &loader, loader_version.as_deref()))
}

impl InstallResult {
    /// mock 专用：保留调用方实例 id 的版本目录名。
    fn with_id(mut self, id: &str) -> Self {
        self.version_id = id.to_string();
        self
    }
}

pub async fn launch_instance(_id: String) -> Result<LaunchOutcome, CoreError> {
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    Ok(LaunchOutcome {
        pid: 4242,
        version_id: "mock-launch".into(),
    })
}

pub fn kill_instance(_id: String) -> bool {
    true
}

pub fn running_instances() -> Result<Vec<RunningGame>, CoreError> {
    Ok(Vec::new())
}

pub async fn export_launch_script(_id: String) -> Result<String, CoreError> {
    Ok(format!("{}/mock-launch.bat", get_data_dir()))
}

pub fn backup_world(_instance_id: String, file_name: String) -> Result<String, CoreError> {
    Ok(format!("backups/worlds/{file_name}-mock"))
}

pub async fn authlib_login(
    server_id: String,
    username: String,
    _password: String,
) -> Result<StoredAccount, CoreError> {
    let uuid = offline_uuid(&username);
    let account = StoredAccount {
        id: uuid.clone(),
        kind: "third".into(),
        username: username.clone(),
        uuid: uuid.clone(),
        logged_in_at: now_secs(),
    };
    accounts_upsert(account.clone())?;
    account_session_set(Some(AccountSession {
        kind: "third".into(),
        username,
        uuid,
    }))?;
    let _ = server_id;
    Ok(account)
}

pub async fn authlib_refresh(account_id: String) -> Result<StoredAccount, CoreError> {
    auth_servers_list()?;
    accounts_list()?
        .into_iter()
        .find(|a| a.id == account_id)
        .ok_or_else(|| "账户不存在".to_string())
}

pub async fn install_resource(
    _instance_id: String,
    kind: String,
    _url: String,
    file_name: String,
    _sha1: Option<String>,
) -> Result<LocalContentItem, CoreError> {
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    Ok(LocalContentItem {
        file_name: file_name.clone(),
        path: format!("{kind}/{file_name}"),
        kind,
        name: file_name,
        enabled: true,
        size_bytes: 1024.0,
        modified_secs: 0.0,
        version: Some("mock-1.0".into()),
        description: None,
        loader: None,
        world_game_mode: None,
        world_difficulty: None,
        world_version: None,
    })
}

pub async fn check_mod_updates(_instance_id: String) -> Result<Vec<ModUpdate>, CoreError> {
    Ok(Vec::new())
}

pub async fn install_mod_api(
    _instance_id: String,
    api: String,
    _mc_version: String,
    _version: Option<String>,
) -> Result<LocalContentItem, CoreError> {
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    let file_name = format!("{api}-mock.jar");
    Ok(LocalContentItem {
        file_name: file_name.clone(),
        path: format!("mods/{file_name}"),
        kind: "mods".into(),
        name: api,
        enabled: true,
        size_bytes: 1024.0,
        modified_secs: 0.0,
        version: Some("mock-1.0".into()),
        description: None,
        loader: None,
        world_game_mode: None,
        world_difficulty: None,
        world_version: None,
    })
}

pub fn export_modpack(_instance_id: String) -> Result<String, CoreError> {
    Ok(format!("{}/mock-modpack.zip", get_data_dir()))
}

pub async fn import_modpack(
    source: String,
    name: Option<String>,
) -> Result<ModpackImportResult, CoreError> {
    tokio::time::sleep(std::time::Duration::from_millis(600)).await;
    let instance = create_instance(
        name.unwrap_or_else(|| "导入的整合包".into()),
        "1.21.4".into(),
        Some("fabric".into()),
        Some("0.16.0".into()),
    )?;
    let _ = source;
    Ok(ModpackImportResult { instance, files: 42 })
}

pub async fn install_java(major: u32) -> Result<JavaInstallResult, CoreError> {
    tokio::time::sleep(std::time::Duration::from_millis(600)).await;
    Ok(JavaInstallResult {
        runtime: JavaRuntime {
            path: format!("{}/java/mock-{major}/bin/java.exe", get_data_dir()),
            version: format!("{major}.0.mock"),
            major,
            vendor: "Temurin".into(),
            arch: std::env::consts::ARCH.into(),
        },
        install_dir: format!("{}/java/mock-{major}", get_data_dir()),
    })
}

pub fn probe_java(path: String) -> Result<JavaRuntime, CoreError> {
    Ok(JavaRuntime {
        path,
        version: "21.0.mock".into(),
        major: 21,
        vendor: "Temurin".into(),
        arch: std::env::consts::ARCH.into(),
    })
}

fn rand_suffix() -> u32 {
    use std::hash::{BuildHasher, Hasher};
    let h = std::collections::hash_map::RandomState::new();
    h.build_hasher().finish() as u32
}
