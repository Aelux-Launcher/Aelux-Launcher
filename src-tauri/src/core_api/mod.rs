//! 内核接入层：三条链路的统一门面。
//!
//!   dev-path    （本地源码联调）→ path 依赖 aelux-core，Rust 直调
//!   release-ffi （发布打包）    → libloading 加载 cdylib，JSON 进出
//!   mock        （默认）        → 内置假实现，无内核也能跑完整 UI
//!
//! 三条链路对外暴露**完全相同**的函数签名（见下方 `pub use backend::*`），
//! 命令层不感知差异；数据全部落进 `dto` 里的壳层 DTO。

#![allow(clippy::too_many_arguments)]

#[cfg(feature = "dev-path")]
mod dev;
#[cfg(feature = "release-ffi")]
mod ffi_backend;
#[cfg(all(feature = "mock", not(any(feature = "dev-path", feature = "release-ffi"))))]
mod mock;

#[cfg(feature = "dev-path")]
pub use dev::*;
#[cfg(feature = "release-ffi")]
pub use ffi_backend::*;
#[cfg(all(feature = "mock", not(any(feature = "dev-path", feature = "release-ffi"))))]
pub use mock::*;

// ---------------------------------------------------------------------------
// 以下签名是三条链路共同遵守的契约；各 backend 模块必须逐一实现。
// ---------------------------------------------------------------------------

/// 统一错误（壳层边界用 String 足够，精确错误在 core 内部）。
pub type CoreError = String;
