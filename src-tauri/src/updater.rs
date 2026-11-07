//! 自研换身式自动更新（便携分发，不依赖内核）。
//!
//! 流程：查清单（按渠道选最新 Release / 镜像聚合清单）→ 比对版本 →
//! 后台下载 zip（复用内核下载任务，进度进任务面板）→ sha256 校验 →
//! 解压暂存到 `aelux/update/staged/` → 下次启动「换身」：
//! 运行中的 exe/dll 不能覆盖但**可以重命名**——旧文件改名腾位置，
//! 新文件移入，拉起新进程后清理 `.old`。
//!
//! 更新源：
//!   github   GitHub Releases（按渠道挑 Release，读其 launcher-update.json 资产）
//!   self/r2  自建 / R2 镜像（`{base}/launcher-update.json` 聚合清单）
//!   auto     并发探测已配置的源，按 RTT 择优（自建加权优先，差距小仍选自建）

use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::dto::{UpdateChannelEntry, UpdateCheckResult, UpdateStatusInfo};

/// 便携包内的主程序文件名（与 release.yml 打包一致）。
const EXE_NAME: &str = "Aelux-Launcher.exe";
/// 旧版便携包的内核库文件名。新版内核已嵌入 exe，更新包不再带 dll；
/// 这里只用于兼容旧包换身与清理历史残留。
const DLL_NAME: &str = "aelux_core.dll";
const MANIFEST_NAME: &str = "launcher-update.json";

/// 当前启动器版本（与 tauri.conf.json / package.json 三处统一维护）。
pub const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

/// GitHub 更新源仓库（build.rs 注入，KV `update-github-repo` 可覆盖）。
fn github_repo() -> String {
    crate::commands::kv_get("update-github-repo".into())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| env!("AELUX_UPDATE_REPO").into())
}

/// 自建更新源默认地址（build.rs 注入；前端未传参时，KV `update-self-base` 优先）。
fn default_self_base() -> Option<String> {
    kv_override("update-self-base").or_else(|| {
        let v = env!("AELUX_UPDATE_SELF_BASE").trim();
        (!v.is_empty()).then(|| v.to_string())
    })
}

/// Cloudflare 镜像默认地址（build.rs 注入；前端未传参时，KV `update-r2-base` 优先）。
fn default_r2_base() -> Option<String> {
    kv_override("update-r2-base").or_else(|| {
        let v = env!("AELUX_UPDATE_R2_BASE").trim();
        (!v.is_empty()).then(|| v.to_string())
    })
}

/// 读 KV 覆盖值（去空白；空串视为未配置）。
fn kv_override(key: &str) -> Option<String> {
    crate::commands::kv_get(key.into())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// 前端显式传值：空串表示禁用该源。
fn non_empty(value: &str) -> Option<String> {
    let v = value.trim();
    (!v.is_empty()).then(|| v.to_string())
}

/* ------------------------------ 版本比较 ------------------------------ */

/// 解析 `v0.2.0-beta.1` → (0, 2, 0, 预发布序)。预发布排在对应正式版之前。
fn parse_version(v: &str) -> Option<(u32, u32, u32, u32)> {
    let s = v.trim().trim_start_matches('v');
    let (core, pre) = match s.split_once('-') {
        Some((c, p)) => (c, p),
        None => (s, ""),
    };
    let mut it = core.split('.');
    let maj: u32 = it.next()?.parse().ok()?;
    let min: u32 = it.next()?.parse().ok()?;
    let patch: u32 = it.next().unwrap_or("0").parse().ok()?;
    // 预发布序：正式版 = u32::MAX；beta.N 按 N 递增
    let pre_rank = if pre.is_empty() {
        u32::MAX
    } else {
        let num = pre.rsplit('.').next().unwrap_or("0").parse::<u32>().unwrap_or(0);
        num // 0 < 1 < ...，正式版 MAX 恒在其后
    };
    Some((maj, min, patch, pre_rank))
}

/// a > b 返回 Greater。
fn version_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    let (pa, pb) = (parse_version(a), parse_version(b));
    match (pa, pb) {
        (Some(x), Some(y)) => x.cmp(&y),
        // 解析失败按字符串比较兜底
        _ => a.cmp(b),
    }
}

/* ------------------------------ 清单解析 ------------------------------ */

/// 清单条目（内部解析用，兼容缺省字段）。
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct MirEntry {
    version: String,
    pub_date: String,
    notes: String,
    file: String,
    sha256: String,
    size: f64,
}

/// 聚合清单（镜像源形态）。deny_unknown_fields 让单渠道清单落不进这个分支
///（单渠道条目没有 stable/beta 键，version/file 在这里属于未知字段）。
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct MirAggregated {
    /// 仅用于兼容客户端清单的 schema 字段，解析后不参与逻辑。
    #[allow(dead_code)]
    #[serde(default)]
    schema: Option<u32>,
    #[serde(default)]
    stable: Option<MirEntry>,
    #[serde(default)]
    beta: Option<MirEntry>,
}

/// 清单形态：镜像聚合（stable/beta 两键）或 GitHub 单渠道清单。
#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum MirManifest {
    Aggregated(MirAggregated),
    Single(MirEntry),
}

/// 解析清单文本并按渠道取条目。channel: release / dev。
fn parse_manifest(text: &str, channel: &str) -> Result<MirEntry, String> {
    let manifest: MirManifest =
        serde_json::from_str(text).map_err(|e| format!("更新清单格式错误: {e}"))?;
    let entry = match manifest {
        MirManifest::Aggregated(agg) => {
            let want = if channel == "dev" { agg.beta } else { agg.stable };
            want.ok_or_else(|| format!("清单中没有 {} 渠道的版本", if channel == "dev" { "开发版" } else { "正式版" }))?
        }
        MirManifest::Single(e) => e,
    };
    if entry.version.trim().is_empty() || entry.file.trim().is_empty() {
        return Err("更新清单缺少 version / file 字段".into());
    }
    Ok(entry)
}

fn entry_to_dto(e: MirEntry, download_url: String, source: &str) -> UpdateChannelEntry {
    UpdateChannelEntry {
        version: e.version,
        pub_date: e.pub_date,
        notes: e.notes,
        file: e.file,
        sha256: e.sha256,
        size: e.size,
        download_url,
        source: source.into(),
    }
}

fn join_base(base: &str, file: &str) -> String {
    format!("{}/{}", base.trim_end_matches('/'), file.trim_start_matches('/'))
}

/* ------------------------------ 各源获取 ------------------------------ */

fn http_client(timeout: Duration) -> reqwest::Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent("aelux-launcher-updater")
        .connect_timeout(Duration::from_secs(3))
        .timeout(timeout)
        .build()
}

/// GitHub Releases 上的发布（内部解析）。
#[derive(Debug, Deserialize)]
struct GhRelease {
    tag_name: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    body: String,
    #[serde(default)]
    published_at: String,
    #[serde(default)]
    assets: Vec<GhAsset>,
}

#[derive(Debug, Deserialize)]
struct GhAsset {
    name: String,
    browser_download_url: String,
}

fn releases_url(repo: &str) -> String {
    format!("https://api.github.com/repos/{repo}/releases?per_page=30")
}

/// GitHub 源：按渠道挑最新 Release（tag 含 beta → dev，否则 release），
/// 读其 launcher-update.json 资产；缺失时用 zip 资产兜底（跳过 sha256 校验）。
async fn fetch_github(client: &reqwest::Client, channel: &str) -> Result<UpdateChannelEntry, String> {
    let repo = github_repo();
    let url = releases_url(&repo);
    let text = client
        .get(&url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("GitHub Releases 查询失败: {e}"))?
        .text()
        .await
        .map_err(|e| e.to_string())?;
    let releases: Vec<GhRelease> =
        serde_json::from_str(&text).map_err(|e| format!("GitHub Releases 解析失败: {e}"))?;
    let want_beta = channel == "dev";
    let best = releases
        .iter()
        .filter(|r| !r.draft)
        .filter(|r| r.tag_name.to_lowercase().contains("beta") == want_beta)
        .max_by(|a, b| version_cmp(&a.tag_name, &b.tag_name))
        .ok_or_else(|| format!("GitHub 上还没有 {} 渠道的发布", if want_beta { "开发版" } else { "正式版" }))?;

    // 清单资产优先：带 sha256，下载后强制校验
    if let Some(m) = best.assets.iter().find(|a| a.name == MANIFEST_NAME) {
        let m_text = client
            .get(&m.browser_download_url)
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| format!("更新清单下载失败: {e}"))?
            .text()
            .await
            .map_err(|e| e.to_string())?;
        let entry = parse_manifest(&m_text, channel)?;
        // 下载地址以 Release 资产为准（清单里只存文件名）
        let download_url = best
            .assets
            .iter()
            .find(|a| a.name == entry.file)
            .map(|a| a.browser_download_url.clone())
            .unwrap_or_else(|| entry_to_url_fallback(&repo, &best.tag_name, &entry.file));
        return Ok(entry_to_dto(entry, download_url, "github"));
    }

    // 旧发布没有清单资产：用 zip 资产兜底，sha256 留空（下载后不校验）
    let zip = best
        .assets
        .iter()
        .find(|a| a.name.ends_with(".zip"))
        .ok_or_else(|| "Release 上没有可用的更新包资产".to_string())?;
    Ok(UpdateChannelEntry {
        version: best.tag_name.trim_start_matches('v').into(),
        pub_date: best.published_at.clone(),
        notes: best.body.trim().chars().take(500).collect(),
        file: zip.name.clone(),
        sha256: String::new(),
        size: 0.0,
        download_url: zip.browser_download_url.clone(),
        source: "github".into(),
    })
}

fn entry_to_url_fallback(repo: &str, tag: &str, file: &str) -> String {
    format!(
        "https://github.com/{repo}/releases/download/{tag}/{file}"
    )
}

/// 镜像源（自建 / R2）：`{base}/launcher-update.json` 聚合清单。
async fn fetch_base(
    client: &reqwest::Client,
    source: &str,
    base: &str,
    channel: &str,
) -> Result<UpdateChannelEntry, String> {
    let url = join_base(base, MANIFEST_NAME);
    let text = client
        .get(&url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("{source} 更新清单获取失败: {e}"))?
        .text()
        .await
        .map_err(|e| e.to_string())?;
    let entry = parse_manifest(&text, channel)?;
    let url = join_base(base, &entry.file);
    Ok(entry_to_dto(entry, url, source))
}

/* ------------------------------ 源选择 ------------------------------ */

/// 按来源选择并获取条目。source: auto / github / self / r2。
async fn resolve_entry(
    channel: &str,
    source: &str,
    self_base: Option<&str>,
    r2_base: Option<&str>,
) -> Result<UpdateChannelEntry, String> {
    let client = http_client(Duration::from_secs(15)).map_err(|e| e.to_string())?;
    // 显式传值（含空串，表示禁用）优先；未传时回落到 build.rs 默认地址（KV 可覆盖）。
    let self_base = match self_base {
        Some(v) => non_empty(v),
        None => default_self_base(),
    };
    let r2_base = match r2_base {
        Some(v) => non_empty(v),
        None => default_r2_base(),
    };
    let (self_base, r2_base) = (self_base.as_deref(), r2_base.as_deref());

    // 显式指定源：直接用，不探测
    match source {
        "github" => return fetch_github(&client, channel).await,
        "self" => {
            let base = self_base.ok_or("未配置自建更新源地址（设置 → 启动器更新）")?;
            return fetch_base(&client, "self", base, channel).await;
        }
        "r2" => {
            let base = r2_base.ok_or("未配置 Cloudflare R2 更新源地址（设置 → 启动器更新）")?;
            return fetch_base(&client, "r2", base, channel).await;
        }
        _ => {}
    }

    // auto：并发探测已配置的源，RTT 减去加权后取最小；自建加权最大
    //（几百毫秒的探测差距远不如大文件下载的稳定性重要）。
    let mut probes: Vec<(String, reqwest::RequestBuilder, i64)> = Vec::new();
    if let Some(base) = self_base {
        probes.push(("self".into(), client.get(join_base(base, MANIFEST_NAME)), 400));
    }
    if let Some(base) = r2_base {
        probes.push(("r2".into(), client.get(join_base(base, MANIFEST_NAME)), 200));
    }
    probes.push(("github".into(), client.get(releases_url(&github_repo())), 0));

    let names: Vec<String> = probes.iter().map(|(name, _, _)| name.clone()).collect();
    let results = futures_join_probe(probes).await;
    let mut ranked: Vec<(i64, String)> = names
        .into_iter()
        .zip(results.into_iter())
        .filter_map(|(name, res)| {
            res.ok().map(|rtt| (rtt as i64, name))
        })
        .collect();
    // 探测得分 = RTT - 加权；加权让自建在接近时胜出
    let weights = [("self", 400i64), ("r2", 200), ("github", 0)];
    for (score, name) in ranked.iter_mut() {
        *score -= weights
            .iter()
            .find(|(w, _)| *w == name.as_str())
            .map(|(_, v)| *v)
            .unwrap_or(0);
    }
    ranked.sort_by_key(|(score, _)| *score);
    let winner = ranked
        .first()
        .map(|(_, name)| name.clone())
        .ok_or_else(|| "所有更新源都不可用（请检查网络或更换更新源）".to_string())?;

    match winner.as_str() {
        "self" => fetch_base(&client, "self", self_base.unwrap(), channel).await,
        "r2" => fetch_base(&client, "r2", r2_base.unwrap(), channel).await,
        _ => fetch_github(&client, channel).await,
    }
}

/// 并发探测全部候选源（tauri 异步运行时里逐个 spawn，统一收集）。
async fn futures_join_probe(
    probes: Vec<(String, reqwest::RequestBuilder, i64)>,
) -> Vec<Result<u128, String>> {
    let handles: Vec<_> = probes
        .into_iter()
        .map(|(_, builder, _)| {
            tauri::async_runtime::spawn(async move {
                let start = Instant::now();
                builder
                    .send()
                    .await
                    .and_then(|r| r.error_for_status())
                    .map_err(|e| e.to_string())?;
                Ok::<u128, String>(start.elapsed().as_millis())
            })
        })
        .collect();
    let mut out = Vec::with_capacity(handles.len());
    for handle in handles {
        out.push(handle.await.unwrap_or_else(|e| Err(format!("探测任务失败: {e}"))));
    }
    out
}

/* ------------------------------ 路径工具 ------------------------------ */

/// 启动器数据目录（镜像内核规则：根目录 → `aelux/`）。
/// 根目录：`AELUX_DATA_DIR` → exe 同级目录。
fn resolve_data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("AELUX_DATA_DIR") {
        if !dir.trim().is_empty() {
            return PathBuf::from(dir).join("aelux");
        }
    }
    exe_dir()
        .map(|dir| dir.join("aelux"))
        .unwrap_or_else(|_| PathBuf::from("aelux"))
}

fn data_dir_runtime() -> PathBuf {
    PathBuf::from(crate::core_api::get_data_dir())
}

fn update_root(data: &Path) -> PathBuf {
    data.join("update")
}

fn staged_dir(data: &Path) -> PathBuf {
    update_root(data).join("staged")
}

fn exe_dir() -> Result<PathBuf, String> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(Path::to_path_buf))
        .ok_or_else(|| "无法定位当前程序目录".to_string())
}

/// 暂存信息（staged.json）。
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StagedInfo {
    version: String,
}

fn read_staged(data: &Path) -> Option<String> {
    let path = staged_dir(data).join("staged.json");
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str::<StagedInfo>(&text).ok().map(|s| s.version)
}

fn write_staged(data: &Path, version: &str) -> Result<(), String> {
    let path = staged_dir(data).join("staged.json");
    let json = serde_json::to_string(&StagedInfo { version: version.into() }).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| format!("写入 staged.json 失败: {e}"))
}

/* ------------------------------ 对外命令 ------------------------------ */

/// 检查更新（前端入口）。
pub async fn check(
    channel: &str,
    source: &str,
    self_base: Option<&str>,
    r2_base: Option<&str>,
) -> Result<UpdateCheckResult, String> {
    let entry = resolve_entry(channel, source, self_base, r2_base).await?;
    let data = data_dir_runtime();
    let staged = read_staged(&data).unwrap_or_default();
    let status = if !staged.is_empty() && staged == entry.version {
        "staged"
    } else if version_cmp(&entry.version, CURRENT_VERSION) == std::cmp::Ordering::Greater {
        "available"
    } else {
        "up-to-date"
    };
    Ok(UpdateCheckResult {
        status: status.into(),
        current_version: CURRENT_VERSION.into(),
        channel: channel.into(),
        source_used: entry.source.clone(),
        staged_version: staged,
        entry,
    })
}

/// 当前版本与暂存状态（启动时读取）。
pub fn status() -> UpdateStatusInfo {
    let data = data_dir_runtime();
    UpdateStatusInfo {
        current_version: CURRENT_VERSION.into(),
        staged_version: read_staged(&data).unwrap_or_default(),
    }
}

/// 下载 + 校验 + 解压暂存（进度经内核下载任务推送，任务面板可见）。
pub async fn download(entry: &UpdateChannelEntry, task_id: &str) -> Result<String, String> {
    let data = data_dir_runtime();
    let root = update_root(&data);
    std::fs::create_dir_all(&root).map_err(|e| format!("创建更新目录失败: {e}"))?;
    let zip_path = root.join(&entry.file);

    // 已有同名校验通过的包 → 跳过下载（断点友好）
    let mut need_download = true;
    if zip_path.exists() && !entry.sha256.is_empty() {
        if let Ok(actual) = sha256_file(&zip_path) {
            if actual.eq_ignore_ascii_case(&entry.sha256) {
                need_download = false;
            }
        }
    }
    if need_download {
        crate::core_api::download_file(
            entry.download_url.clone(),
            zip_path.to_string_lossy().into_owned(),
            None,
            Some(task_id.into()),
            Some(entry.file.clone()),
        )
        .await?;
    }

    // sha256 校验（清单未提供时跳过，仅旧清单兼容）
    if !entry.sha256.is_empty() {
        let actual = sha256_file(&zip_path)?;
        if !actual.eq_ignore_ascii_case(&entry.sha256) {
            let _ = std::fs::remove_file(&zip_path);
            return Err(format!("sha256 校验失败：期望 {}，实际 {}", entry.sha256, actual));
        }
    }

    // 解压到 staged（zip 内顶层目录 Aelux-Launcher/ 剥掉）
    let staged = staged_dir(&data);
    let _ = std::fs::remove_dir_all(&staged);
    std::fs::create_dir_all(&staged).map_err(|e| format!("创建暂存目录失败: {e}"))?;
    extract_zip(&zip_path, &staged)?;

    let exe_ok = staged.join(EXE_NAME).is_file();
    if !exe_ok {
        let _ = std::fs::remove_dir_all(&staged);
        return Err("更新包内容不完整（缺少主程序）".into());
    }

    write_staged(&data, &entry.version)?;
    let _ = std::fs::remove_file(&zip_path);
    Ok(entry.version.clone())
}

/// 立即应用暂存更新并重启（换身）。
pub fn apply_restart() -> Result<(), String> {
    let data = data_dir_runtime();
    let dir = exe_dir()?;
    let staged = staged_dir(&data);
    if !staged.join(EXE_NAME).is_file() {
        return Err("没有待应用的更新".into());
    }
    match swap_in_place(&dir, &staged) {
        Ok(()) => spawn_and_exit(&dir.join(EXE_NAME), None),
        Err(err) if err == "DLL_LOCKED" => {
            // 内核 dll 正被本进程占用：把新文件摆成 *.new，
            // 用暂存里的新 exe 引导完成最后一步（新进程里 dll 尚未加载）。
            stage_pending_swap(&dir, &staged)?;
            let staged_exe = staged.join(EXE_NAME);
            spawn_and_exit(&staged_exe, Some(EXTRA_APPLY_FLAG.to_string()))
        }
        Err(e) => Err(e),
    }
}

/// 启动早期入口：处理待完成的换身 + 应用暂存更新 + 清理 `.old`。
/// 在窗口与内核初始化**之前**调用；失败不阻断正常启动。
pub fn boot_swap_or_cleanup() {
    let Ok(dir) = exe_dir() else { return };
    let data = resolve_data_dir();

    // 1) 上次会话遗留的待换身（dll 被锁时的分步方案）
    if dir.join("swap-pending.json").exists() {
        finish_pending_swap(&dir, &data);
        spawn_and_exit_quiet(&dir.join(EXE_NAME));
        return;
    }

    // 2) 常规清理：删除换身留下的旧文件
    cleanup_old_files(&dir);

    // 3) 有暂存更新且版本不同 → 换身后用新版本启动
    let staged = staged_dir(&data);
    if staged.join(EXE_NAME).is_file() {
        let staged_version = read_staged(&data).unwrap_or_default();
        if staged_version == CURRENT_VERSION || staged_version.is_empty() {
            let _ = std::fs::remove_dir_all(&staged);
            return;
        }
        if swap_in_place(&dir, &staged).is_ok() {
            spawn_and_exit_quiet(&dir.join(EXE_NAME));
        }
        // 换身失败：继续正常启动（staged 保留，下次再试）
    }
}

/* ------------------------------ 换身实现 ------------------------------ */

const EXTRA_APPLY_FLAG: &str = "--aelux-apply-swap";

/// 把 staged 的 exe 移入程序目录：旧文件改名 `.old`，新文件复制就位。
/// 失败时回滚。旧版更新包带 dll 时一并替换（被占用返回 "DLL_LOCKED"）；
/// 新版单文件包只有 exe。
fn swap_in_place(dir: &Path, staged: &Path) -> Result<(), String> {
    let exe = dir.join(EXE_NAME);
    let dll = dir.join(DLL_NAME);
    let exe_old = dir.join(format!("{EXE_NAME}.old"));
    let dll_old = dir.join(format!("{DLL_NAME}.old"));
    let _ = std::fs::remove_file(&exe_old);
    let _ = std::fs::remove_file(&dll_old);

    let dll_in_update = staged.join(DLL_NAME).is_file();

    std::fs::rename(&exe, &exe_old).map_err(|e| format!("旧主程序重命名失败: {e}"))?;
    let dll_moved = if dll_in_update && dll.exists() {
        match std::fs::rename(&dll, &dll_old) {
            Ok(()) => true,
            // 运行中进程持有 dll（IO 共享冲突）→ 交给分步方案
            Err(_) => {
                let _ = std::fs::rename(&exe_old, &exe);
                return Err("DLL_LOCKED".into());
            }
        }
    } else {
        false
    };

    let copy = |from: &Path, to: &Path| std::fs::copy(from, to).map(|_| ()).map_err(|e| e.to_string());
    let copy_exe = copy(&staged.join(EXE_NAME), &exe);
    let copy_dll = if dll_in_update && (dll_moved || !dll.exists()) {
        copy(&staged.join(DLL_NAME), &dll)
    } else {
        Ok(())
    };

    match (copy_exe, copy_dll) {
        (Ok(()), Ok(())) => {
            // 就位校验：新 exe 必须存在且非空
            if std::fs::metadata(&exe).map(|m| m.len() > 0).unwrap_or(false) {
                Ok(())
            } else {
                rollback(&dir, &exe_old, &dll_old, dll_moved);
                Err("新主程序就位校验失败".into())
            }
        }
        (e1, e2) => {
            let _ = std::fs::remove_file(&exe);
            let _ = std::fs::remove_file(&dll);
            rollback(&dir, &exe_old, &dll_old, dll_moved);
            Err(format!(
                "更新文件就位失败: {}",
                [e1.err(), e2.err()].into_iter().flatten().collect::<Vec<_>>().join("; ")
            ))
        }
    }
}

/// 换身失败回滚：把 `.old` 改回原名。
fn rollback(dir: &Path, exe_old: &Path, dll_old: &Path, dll_moved: bool) {
    let _ = std::fs::rename(exe_old, dir.join(EXE_NAME));
    if dll_moved {
        let _ = std::fs::rename(dll_old, dir.join(DLL_NAME));
    }
}

/// dll 被锁时的分步方案：新文件摆成 `.new` + 标记文件，新进程引导完成。
fn stage_pending_swap(dir: &Path, staged: &Path) -> Result<(), String> {
    std::fs::copy(staged.join(EXE_NAME), dir.join(format!("{EXE_NAME}.new")))
        .map_err(|e| format!("暂存新主程序失败: {e}"))?;
    // 单文件更新包没有 dll，只换 exe
    if staged.join(DLL_NAME).is_file() {
        std::fs::copy(staged.join(DLL_NAME), dir.join(format!("{DLL_NAME}.new")))
            .map_err(|e| format!("暂存新内核库失败: {e}"))?;
    }
    let info = serde_json::to_string(&StagedInfo { version: read_staged(&data_dir_runtime()).unwrap_or_default() })
        .map_err(|e| e.to_string())?;
    std::fs::write(dir.join("swap-pending.json"), info).map_err(|e| e.to_string())
}

/// 新进程里完成分步换身：`.new` 覆盖正式文件（此时旧进程已退出、dll 未加载）。
fn finish_pending_swap(dir: &Path, _data: &Path) {
    let _ = std::fs::rename(dir.join(format!("{EXE_NAME}.new")), dir.join(EXE_NAME));
    let _ = std::fs::rename(dir.join(format!("{DLL_NAME}.new")), dir.join(DLL_NAME));
    let _ = std::fs::remove_file(dir.join("swap-pending.json"));
    cleanup_old_files(dir);
    let staged = staged_dir(_data);
    let _ = std::fs::remove_dir_all(&staged);
}

fn cleanup_old_files(dir: &Path) {
    let _ = std::fs::remove_file(dir.join(format!("{EXE_NAME}.old")));
    let _ = std::fs::remove_file(dir.join(format!("{DLL_NAME}.old")));
    let _ = std::fs::remove_file(dir.join(format!("{EXE_NAME}.new")));
    let _ = std::fs::remove_file(dir.join(format!("{DLL_NAME}.new")));
    // 内核已嵌入 exe：清掉旧版随包分发的 dll（被旧进程占用时下次启动再清）
    let _ = std::fs::remove_file(dir.join(DLL_NAME));
}

/// 拉起新进程并退出当前进程。
fn spawn_and_exit(exe: &Path, extra_arg: Option<String>) -> Result<(), String> {
    let mut cmd = std::process::Command::new(exe);
    cmd.args(std::env::args().skip(1));
    if let Some(arg) = extra_arg {
        cmd.arg(arg);
    }
    cmd.spawn()
        .map_err(|e| format!("拉起新版本失败: {e}"))?;
    std::process::exit(0);
}

/// 启动期换身后的拉起：失败也直接退出（旧文件已被改名，继续跑旧版没有意义）。
fn spawn_and_exit_quiet(exe: &Path) {
    let _ = std::process::Command::new(exe)
        .args(std::env::args().skip(1))
        .spawn();
    std::process::exit(0);
}

/* ------------------------------ 文件工具 ------------------------------ */

fn sha256_file(path: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    let mut file =
        std::fs::File::open(path).map_err(|e| format!("打开更新包失败: {e}"))?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf).map_err(|e| format!("读取更新包失败: {e}"))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// 解压 zip 到目标目录：顶层目录（如 `Aelux-Launcher/`）剥掉，拒绝路径穿越。
fn extract_zip(zip_path: &Path, dest: &Path) -> Result<(), String> {
    let file = std::fs::File::open(zip_path).map_err(|e| format!("打开更新包失败: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("读取更新包失败: {e}"))?;
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("读取更新包条目失败: {e}"))?;
        if entry.is_dir() {
            continue;
        }
        let raw = entry.name().replace('\\', "/");
        // 剥掉顶层目录
        let rel = match raw.split_once('/') {
            Some((_, rest)) if !rest.is_empty() => rest,
            _ => raw.as_str(),
        };
        if rel.is_empty() || rel.contains("..") {
            continue;
        }
        let out = dest.join(rel);
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
        }
        let mut out_file =
            std::fs::File::create(&out).map_err(|e| format!("写入文件失败: {e}"))?;
        std::io::copy(&mut entry, &mut out_file).map_err(|e| format!("解压失败: {e}"))?;
    }
    Ok(())
}

/* ------------------------------- 测试 ------------------------------- */

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_ordering() {
        assert_eq!(version_cmp("v0.2.0", "0.1.0"), std::cmp::Ordering::Greater);
        assert_eq!(version_cmp("0.2.0-beta.1", "v0.2.0"), std::cmp::Ordering::Less);
        assert_eq!(version_cmp("0.2.0-beta.2", "0.2.0-beta.1"), std::cmp::Ordering::Greater);
        assert_eq!(version_cmp("0.1.0", "0.1.0"), std::cmp::Ordering::Equal);
        assert_eq!(version_cmp("0.10.0", "0.9.0"), std::cmp::Ordering::Greater);
    }

    #[test]
    fn manifest_forms() {
        let agg = r#"{"schema":1,"stable":{"version":"0.2.0","file":"a.zip"},"beta":{"version":"0.3.0-beta.1","file":"b.zip"}}"#;
        assert_eq!(parse_manifest(agg, "release").unwrap().version, "0.2.0");
        assert_eq!(parse_manifest(agg, "dev").unwrap().version, "0.3.0-beta.1");
        let single = r#"{"schema":1,"channel":"stable","version":"0.2.0","file":"a.zip"}"#;
        assert_eq!(parse_manifest(single, "release").unwrap().version, "0.2.0");
        // 单渠道清单走 Single 分支，即使带 channel 字段也不误入聚合分支
        assert_eq!(parse_manifest(single, "dev").unwrap().version, "0.2.0");
    }
}
