//! 原生文件对话框：rfd 同步调用，跑在主线程（经典模态方式）。
//!
//! 背景：tauri-plugin-dialog 的链路（tokio worker → tao 事件循环 proxy →
//! 主线程闭包 → rfd AsyncFileDialog 自起线程）在本应用实测中对话框延迟
//! 15s+ 甚至不出现；rfd async 在本进程自起 STA 线程时，其 COM 调用疑似
//! 被 WebView2 等组件占用的套间阻塞（独立进程里同样调用 <200ms）。
//! 因此这里回到经典做法：**rfd 同步 API 直接在主线程执行**——
//! 对话框与属主窗口同线程，`Show` 的模态循环自己泵消息，天然无死锁，
//! 且对话框对主窗口保持系统级模态。命令用 spawn_blocking 等 IPC 不占 worker。

use std::path::PathBuf;

use serde::Deserialize;
use specta::Type;
use tauri::Manager;

/// 文件类型过滤器（`name` 为显示名，`extensions` 不带点）。
#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DialogFilter {
  pub name: String,
  pub extensions: Vec<String>,
}

/// 「另存为」选项。
#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SaveDialogOptions {
  pub title: Option<String>,
  /// 预填路径：可以是完整文件路径（自动拆目录 + 文件名）或纯目录。
  pub default_path: Option<String>,
  pub filters: Option<Vec<DialogFilter>>,
}

/// 打开文件 / 文件夹选项。
#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OpenDialogOptions {
  pub title: Option<String>,
  pub default_path: Option<String>,
  pub filters: Option<Vec<DialogFilter>>,
  pub multiple: Option<bool>,
  pub directory: Option<bool>,
}

/// 去掉 Windows 文件对话框返回的 `\\?\` 逐字前缀。
fn normalize(path: &std::path::Path) -> String {
  let s = path.to_string_lossy().into_owned();
  s.strip_prefix(r"\\?\").map(String::from).unwrap_or(s)
}

/// 应用预填路径（与插件 `set_default_path` 逻辑一致）。
fn apply_default_path(builder: rfd::FileDialog, default_path: &str) -> rfd::FileDialog {
  let raw = PathBuf::from(default_path);
  let path: PathBuf = raw.components().collect();
  if path.is_file() || !path.exists() {
    match (path.parent(), path.file_name()) {
      (Some(parent), Some(name)) if parent.components().count() > 0 => builder
        .set_directory(parent)
        .set_file_name(name.to_string_lossy()),
      _ => builder.set_directory(&path),
    }
  } else {
    builder.set_directory(&path)
  }
}

fn apply_filters(builder: rfd::FileDialog, filters: &[DialogFilter]) -> rfd::FileDialog {
  let mut builder = builder;
  for f in filters {
    let exts: Vec<&str> = f.extensions.iter().map(String::as_str).collect();
    builder = builder.add_filter(&f.name, &exts);
  }
  builder
}

/// 在主线程执行同步对话框，命令侧用 channel + spawn_blocking 等结果。
async fn run_dialog<T: Send + 'static>(
  window: tauri::WebviewWindow,
  dialog: impl FnOnce() -> T + Send + 'static,
) -> Result<T, String> {
  let (tx, rx) = std::sync::mpsc::channel();
  let app = window.app_handle().clone();
  app
    .run_on_main_thread(move || {
      let out = dialog();
      let _ = tx.send(out);
    })
    .map_err(|e| e.to_string())?;
  tauri::async_runtime::spawn_blocking(move || rx.recv())
    .await
    .map_err(|e| e.to_string())?
    .map_err(|_| "对话框通道已关闭".to_string())
}

/// 原生「另存为」对话框；用户取消返回 `None`。
#[tauri::command]
#[specta::specta]
pub async fn save_file_dialog(
  window: tauri::WebviewWindow,
  options: SaveDialogOptions,
) -> Result<Option<String>, String> {
  run_dialog(window, move || {
    let mut builder = rfd::FileDialog::new();
    if let Some(title) = options.title {
      builder = builder.set_title(title);
    }
    if let Some(default_path) = options.default_path {
      builder = apply_default_path(builder, &default_path);
    }
    if let Some(filters) = options.filters {
      builder = apply_filters(builder, &filters);
    }
    builder.save_file().map(|h| normalize(&h))
  })
  .await
}

/// 原生打开对话框（文件 / 文件夹，单个或多个）；取消返回 `None`。
/// `multiple=false` 时返回长度为 1 的数组，便于统一处理。
#[tauri::command]
#[specta::specta]
pub async fn pick_file_dialog(
  window: tauri::WebviewWindow,
  options: OpenDialogOptions,
) -> Result<Option<Vec<String>>, String> {
  run_dialog(window, move || {
    let directory = options.directory.unwrap_or(false);
    let multiple = options.multiple.unwrap_or(false);

    let mut builder = rfd::FileDialog::new();
    if let Some(title) = options.title {
      builder = builder.set_title(title);
    }
    if let Some(default_path) = options.default_path {
      builder = apply_default_path(builder, &default_path);
    }
    if let Some(filters) = options.filters {
      builder = apply_filters(builder, &filters);
    }

    let picked = if directory {
      builder.pick_folder().map(|f| vec![normalize(&f)])
    } else if multiple {
      builder
        .pick_files()
        .map(|list| list.iter().map(|f| normalize(f)).collect())
    } else {
      builder.pick_file().map(|f| vec![normalize(&f)])
    };
    picked
  })
  .await
}
