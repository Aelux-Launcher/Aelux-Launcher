#!/usr/bin/env bash
# ============================================================================
# Aelux Launcher · 桌面端构建（含 Rust 编译）
#
# 为什么需要这个脚本：
#   Git Bash 的 /usr/bin/link 是 coreutils 的硬链接工具，会**遮蔽** MSVC 的
#   link.exe（真正的链接器）。cargo 在 MSVC 工具链下调 link 时会命中它，
#   报 "link: extra operand ..."。解决办法是把 MSVC 的 bin 目录放到 PATH 最前面。
#
# 用法：
#   bash scripts/build-desktop.sh            # 完整 tauri build
#   bash scripts/build-desktop.sh --debug    # debug 构建
#   bash scripts/build-desktop.sh --no-rust  # 只构建前端
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ---- 定位 MSVC 链接器并前置到 PATH ----------------------------------------
link_dir() {
  local roots=(
    "/c/Program Files/Microsoft Visual Studio"
    "/c/Program Files (x86)/Microsoft Visual Studio"
  )
  local p
  for root in "${roots[@]}"; do
    [[ -d "$root" ]] || continue
    # 优先 2022 → 2019 BuildTools，取 Hostx64/x64
    for ver in 2022 2019; do
      for build in BuildTools Community Professional Enterprise; do
        for candidate in \
          "$root/$ver/$build/VC/Tools/MSVC"/*/bin/Hostx64/x64 \
          "$root/$ver/$build/VC/Tools/MSVC"/*/bin/Hostx64/x64; do
          if [[ -x "$candidate/link.exe" ]]; then
            printf '%s\n' "$candidate"
            return 0
          fi
        done
      done
    done
  done
  return 1
}

if MSVC_BIN="$(link_dir)"; then
  export PATH="$MSVC_BIN:$PATH"
  echo "[build] MSVC 链接器已前置：$MSVC_BIN"
else
  echo "[build] 未找到 MSVC link.exe（若 cargo 报 link 冲突，请安装 VS Build Tools）" >&2
fi

# ---- 参数 ------------------------------------------------------------------
PROFILE="release"
BUNDLES=""
SKIP_RUST=0
for arg in "$@"; do
  case "$arg" in
    --debug)   PROFILE="dev" ;;
    --release) PROFILE="release" ;;
    --no-rust) SKIP_RUST=1 ;;
    --bundles=*) BUNDLES="${arg#--bundles=}" ;;
  esac
done

cd "$APP_DIR"

# ---- 前端 ------------------------------------------------------------------
echo "[build] 构建前端（vite）…"
npm run build:web

if [[ "$SKIP_RUST" == "1" ]]; then
  echo "[build] 已跳过 Rust 编译（--no-rust）"
  exit 0
fi

# ---- 桌面端 ---------------------------------------------------------------
echo "[build] 构建桌面端（tauri build，profile=$PROFILE）…"
if [[ "$PROFILE" == "dev" ]]; then
  npx tauri build --debug
elif [[ -n "$BUNDLES" ]]; then
  npx tauri build --bundles "$BUNDLES"
else
  npx tauri build
fi

echo "[build] 完成。产物见 src-tauri/target/release/bundle/"
