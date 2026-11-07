//! 原生文件对话框：常驻工作线程执行，主线程不再被模态消息循环占住。
//!
//! 背景：Windows 上 `IFileDialog::Show` 是系统级模态。若在主线程调用，
//! 弹窗期间（含首次加载 shell 组件的数百毫秒）主线程会被模态循环占住，
//! 表现为每次打开对话框都「顿一下」。
//!
//! 现方案：所有对话框请求投递到一条常驻线程上串行执行——
//! - 对话框通过 `set_parent` 绑定主窗口，仍然对应用保持系统级模态；
//! - 主线程只继续跑事件循环、响应取窗口句柄的请求，不执行 `Show`；
//! - 工作线程启动时即初始化 STA 套间并持有到进程结束，rfd 每次弹窗的
//!   `CoInitializeEx` 只相当于引用计数，不会反复建立/销毁套间；
//! - 命令侧 await oneshot 回执，不占用 tokio worker，也不阻塞 UI。
//!
//! 注意：工作线程里 `set_parent` 会同步请求主线程取窗口句柄；
//! 只要主线程没被别的同步操作阻塞，就不会死锁（这正是本方案的前提）。

use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Mutex, OnceLock};

use serde::Deserialize;
use specta::Type;

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

enum Request {
  Save {
    window: tauri::WebviewWindow,
    options: SaveDialogOptions,
    reply: tokio::sync::oneshot::Sender<Option<String>>,
  },
  Open {
    window: tauri::WebviewWindow,
    options: OpenDialogOptions,
    reply: tokio::sync::oneshot::Sender<Option<Vec<String>>>,
  },
}

static DIALOG_TX: OnceLock<Mutex<Sender<Request>>> = OnceLock::new();

/// 去掉 Windows 文件对话框返回的 `\\?\` 逐字前缀。
fn normalize(path: &std::path::Path) -> String {
  let s = path.to_string_lossy().into_owned();
  s.strip_prefix(r"\\?\").map(String::from).unwrap_or(s)
}

/// 构建对话框：绑定主窗口，并应用标题 / 预填路径（预填逻辑与插件一致）/ 过滤器。
fn build_dialog(
  window: &tauri::WebviewWindow,
  title: Option<String>,
  default_path: Option<String>,
  filters: Option<Vec<DialogFilter>>,
) -> rfd::FileDialog {
  let mut builder = rfd::FileDialog::new().set_parent(window);
  if let Some(title) = title {
    builder = builder.set_title(title);
  }
  if let Some(default_path) = default_path {
    let raw = std::path::PathBuf::from(default_path);
    let path: std::path::PathBuf = raw.components().collect();
    builder = if path.is_file() || !path.exists() {
      match (path.parent(), path.file_name()) {
        (Some(parent), Some(name)) if parent.components().count() > 0 => builder
          .set_directory(parent)
          .set_file_name(name.to_string_lossy()),
        _ => builder.set_directory(&path),
      }
    } else {
      builder.set_directory(&path)
    };
  }
  if let Some(filters) = filters {
    for f in filters {
      let exts: Vec<&str> = f.extensions.iter().map(String::as_str).collect();
      builder = builder.add_filter(&f.name, &exts);
    }
  }
  builder
}

fn show_save(window: &tauri::WebviewWindow, options: SaveDialogOptions) -> Option<String> {
  build_dialog(window, options.title, options.default_path, options.filters)
    .save_file()
    .map(|h| normalize(&h))
}

fn show_open(window: &tauri::WebviewWindow, options: OpenDialogOptions) -> Option<Vec<String>> {
  let directory = options.directory.unwrap_or(false);
  let multiple = options.multiple.unwrap_or(false);
  let builder = build_dialog(window, options.title, options.default_path, options.filters);

  if directory {
    builder.pick_folder().map(|f| vec![normalize(&f)])
  } else if multiple {
    builder
      .pick_files()
      .map(|list| list.iter().map(|f| normalize(f)).collect())
  } else {
    builder.pick_file().map(|f| vec![normalize(&f)])
  }
}

/// 保持 STA 套间到进程结束：rfd 每次弹窗仍会 `CoInitializeEx`，这里预初始化后
/// 它的调用只是纯引用计数，首次弹窗的 COM 加载不再落在点击路径上。
#[cfg(windows)]
fn init_com_sta() {
  use windows_sys::Win32::System::Com::{
    CoInitializeEx, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE,
  };
  unsafe {
    let _ = CoInitializeEx(
      std::ptr::null(),
      (COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) as u32,
    );
  }
}

#[cfg(not(windows))]
fn init_com_sta() {}

fn spawn_worker() -> Sender<Request> {
  let (tx, rx) = mpsc::channel();
  std::thread::Builder::new()
    .name("aelux-file-dialog".into())
    .spawn(move || {
      init_com_sta();
      worker_loop(rx);
    })
    .expect("无法创建文件对话框线程");
  tx
}

fn worker_loop(rx: Receiver<Request>) {
  for request in rx {
    match request {
      Request::Save {
        window,
        options,
        reply,
      } => {
        let _ = reply.send(show_save(&window, options));
      }
      Request::Open {
        window,
        options,
        reply,
      } => {
        let _ = reply.send(show_open(&window, options));
      }
    }
  }
}

fn dialog_tx() -> &'static Mutex<Sender<Request>> {
  DIALOG_TX.get_or_init(|| Mutex::new(spawn_worker()))
}

/// 启动时预热：线程创建与 COM 套间初始化提前完成，不落在首次点击上。
pub fn warm_up() {
  let _ = dialog_tx();
}

/// 原生「另存为」对话框；用户取消返回 `None`。
#[tauri::command]
#[specta::specta]
pub async fn save_file_dialog(
  window: tauri::WebviewWindow,
  options: SaveDialogOptions,
) -> Result<Option<String>, String> {
  let (reply, rx) = tokio::sync::oneshot::channel();
  dialog_tx()
    .lock()
    .map_err(|_| "文件对话框线程不可用".to_string())?
    .send(Request::Save {
      window,
      options,
      reply,
    })
    .map_err(|_| "文件对话框线程已退出".to_string())?;
  rx.await
    .map_err(|_| "文件对话框线程已退出".to_string())
}

/// 原生打开对话框（文件 / 文件夹，单个或多个）；取消返回 `None`。
/// `multiple=false` 时返回长度为 1 的数组，便于统一处理。
#[tauri::command]
#[specta::specta]
pub async fn pick_file_dialog(
  window: tauri::WebviewWindow,
  options: OpenDialogOptions,
) -> Result<Option<Vec<String>>, String> {
  let (reply, rx) = tokio::sync::oneshot::channel();
  dialog_tx()
    .lock()
    .map_err(|_| "文件对话框线程不可用".to_string())?
    .send(Request::Open {
      window,
      options,
      reply,
    })
    .map_err(|_| "文件对话框线程已退出".to_string())?;
  rx.await
    .map_err(|_| "文件对话框线程已退出".to_string())
}
