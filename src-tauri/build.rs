// Path 仅 release-ffi 分支使用（内核库就位检查），避免 dev-path/mock 构建的 unused 警告
#[cfg(feature = "release-ffi")]
use std::path::Path;

fn main() {
    tauri_build::build();

    // 发布链路（release-ffi）：内核以 cdylib 随包分发，运行完全离线。
    // 库文件的就位策略（按优先级）：
    //   1. src-tauri/lib/<platform>/ 下已有本地文件（本地打包测试）
    //   2. 由 scripts/fetch-core.mjs 按 manifest.json 下载（CI / 本地补拉）
    // dev-path / mock 链路不做任何事。
    #[cfg(feature = "release-ffi")]
    require_core_lib();
}

#[cfg(feature = "release-ffi")]
fn require_core_lib() {
    let file = core_lib_path();
    if file.exists() {
        // 拷贝进资源目录，tauri.conf 的 resources glob 会把它打进安装包
        let res_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("lib")
            .join(platform_key());
        std::fs::create_dir_all(&res_dir).expect("创建内核资源目录失败");
        let res_file = res_dir.join(core_lib_name());
        if res_file != file {
            std::fs::copy(&file, &res_file).expect("拷贝内核动态库失败");
            println!("cargo:rerun-if-changed={}", res_file.display());
        }
        println!("cargo:rustc-env=AELUX_CORE_LIB={}", file.display());
    } else {
        panic!(
            "release-ffi 需要 aelux-core 动态库：未找到 {}。\n\
             获取方式二选一：\n  \
             1. node scripts/fetch-core.mjs   # 按 manifest.json 下载并校验 sha256\n  \
             2. 在 Aelux-Core 仓库 cargo build --release，把产物拷入 src-tauri/lib/<platform>/",
            file.display()
        );
    }
}

/// 当前平台的内核库文件路径（src-tauri/lib/<platform>/）。
#[cfg(feature = "release-ffi")]
fn core_lib_path() -> std::path::PathBuf {
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
    let platform = platform_key();
    manifest.join("lib").join(platform).join(core_lib_name())
}

/// 平台键，与 manifest.json 的键保持一致。
#[cfg(feature = "release-ffi")]
fn platform_key() -> &'static str {
    #[cfg(all(target_os = "windows", target_env = "msvc"))]
    {
        if cfg!(target_arch = "x86_64") {
            "windows-x64"
        } else {
            "windows-arm64"
        }
    }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        "macos-arm64"
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        "macos-x64"
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        "linux-x64"
    }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        "linux-arm64"
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        compile_error!("release-ffi 暂不支持该平台");
    }
}

/// 各平台的动态库文件名。
#[cfg(feature = "release-ffi")]
fn core_lib_name() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "aelux_core.dll"
    }
    #[cfg(target_os = "macos")]
    {
        "libaelux_core.dylib"
    }
    #[cfg(target_os = "linux")]
    {
        "libaelux_core.so"
    }
}
