//! 内核接入层：真实内核的唯一门面。
//!
//!   dev-path    （本地源码联调）→ path 依赖 aelux-core，Rust 直调
//!   release-ffi （发布打包）    → libloading 加载 cdylib，JSON 进出
//!
//! 两条链路对外暴露**完全相同**的函数签名（见下方 `pub use backend::*`），
//! 命令层不感知差异；数据全部落进 `dto` 里的壳层 DTO。
//!
//! 不再提供 mock 假实现：所有数据都来自真实内核、真实文件系统或真实网络。

#![allow(clippy::too_many_arguments)]

// 两条链路同时开启时（`tauri build --features release-ffi` 会叠加默认的 dev-path），
// 优先 release-ffi，避免 glob 重导出产生同名歧义。
#[cfg(all(feature = "dev-path", not(feature = "release-ffi")))]
mod dev;
#[cfg(feature = "release-ffi")]
mod ffi_backend;

#[cfg(all(feature = "dev-path", not(feature = "release-ffi")))]
pub use dev::*;
#[cfg(feature = "release-ffi")]
pub use ffi_backend::*;

#[cfg(not(any(feature = "dev-path", feature = "release-ffi")))]
compile_error!(
    "未选择内核接入链路：请使用 `--features dev-path`（本地联调）或 `--features release-ffi`（发布打包）"
);

// ---------------------------------------------------------------------------
// 以下签名是两条链路共同遵守的契约；各 backend 模块必须逐一实现。
// ---------------------------------------------------------------------------

/// 统一错误（壳层边界用 String 足够，精确错误在 core 内部）。
pub type CoreError = String;
