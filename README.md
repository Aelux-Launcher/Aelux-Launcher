# Aelux-Launcher-App

Aelux Launcher 的桌面启动器壳（Tauri 2 + React 19 + Zustand）。消费 [`aelux-components`](../Aelux-Components) 提供 UI，调用 [`aelux-launcher-lib`](../Aelux-Launcher-Lib) 承载业务规则。

## 架构定位

- **壳只做编排**：窗口/路由/界面拼装，不含业务规则。
- **UI** 来自 `aelux-components`（纯展示组件 + `--aelux-*` 设计变量）。
- **逻辑** 来自 `aelux-launcher-lib`（登录 / Modrinth / 更新 / 公告 / 遥测 / AI 注入）。
- **桌面能力层（Rust）** 在 `src-tauri/`：文件读写、解压、进程启停、Java 探测、系统信息。
  - `src-tauri/src/commands.rs`：实例管理、版本安装与游戏启动、窗口控制。
  - `src-tauri/src/ext_commands.rs`：lib-platform 桥接命令（`kv_*`、下载校验、更新、注入、公告读取）。

## 目录

```
src/
  lib/bridge.ts        # PlatformAdapter → Tauri invoke 的唯一通信面
  store.ts             # Zustand：组合 lib 各模块，驱动 UI
  components/TitleBar  # 自定义标题栏（窗口无系统边框）
  views/               # home / download / multiplayer / settings / more
src-tauri/             # Rust 能力层
  tauri.conf.json          # 主配置（三平台共用部分）
  tauri.windows.conf.json  # Windows 专属覆盖
  tauri.macos.conf.json    # macOS 专属覆盖
  tauri.linux.conf.json    # Linux 专属覆盖
```

## 三平台支持

Windows / macOS / Linux 均可开发与打包。平台差异通过 Tauri 的**平台专属配置文件**表达，
主配置 `tauri.conf.json` 只放三平台共用项：

| 平台 | 打包目标 | 窗口 | 说明 |
|---|---|---|---|
| Windows | `nsis`（安装包）、`msi` | 无边框 + 透明 | NSIS 简体中文 + 英文，可选语言选择器 |
| macOS | `dmg`、`app` | 无边框 + 透明 | 最低系统 10.15 |
| Linux | `deb`、`rpm`、`appimage` | 无边框 + **不透明** | Wayland 下透明窗口不可靠，改由页面补背景色 |

平台专属配置在构建时自动与主配置**深合并**（同名字段覆盖），无需手动切换。

### 平台差异的落地位置

- **Rust 侧**：`commands.rs` 的 `open_folder_in_explorer`（`explorer` / `open` / `xdg-open`）、
  `detect_official_launcher`（`%APPDATA%` / `~/Library/Application Support` / `~/.minecraft`）。
- **lib-core 侧**：`versions.ts` 的 `ruleMatches` 会把 Mojang 的 `os.name = "osx"`
  归一到内部的 `"macos"`，否则 macOS 上 natives 依赖永远匹配不上。
- **前端侧**：`store.ts` 把平台名写到 `<html data-platform>`，
  `styles.css` 据此在 Linux 下补背景色并去掉圆角留白（不透明窗口的 webview 底色是白的）。

## 前置依赖

| 平台 | 依赖 |
|---|---|
| 通用 | Node ≥ 20.19、Rust 工具链（stable）、npm |
| Windows | Visual Studio Build Tools（C++ 构建工具，提供 `link.exe`）、WebView2 Runtime（Win10 1803+ 自带） |
| macOS | Xcode Command Line Tools（`xcode-select --install`） |
| Linux | `libwebkit2gtk-4.1-dev`、`libgtk-3-dev`、`libayatana-appindicator3-dev`、`librsvg2-dev`、`patchelf`、`libssl-dev`、`build-essential` |

Linux 依赖安装（Debian / Ubuntu）：

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev \
  patchelf libssl-dev build-essential libxdo-dev
```

Windows 缺链接器时的典型报错：

```
error: linking with `link.exe` failed
note: in the Visual Studio installer, ensure the "C++ build tools" workload is selected
```

装 Build Tools：

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools `
  --override "--wait --passive --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

装完后**新开一个终端**（PATH 与 LIB 环境变量在装的时候才写入）。

## 常用命令

```bash
npm install

npm run dev:web        # 浏览器预览（纯前端，无 Tauri 运行时，走本地模拟适配器）
npm run dev:desktop    # 桌面端开发（Tauri dev，热重载）
npm run dev            # 等同 dev:desktop

npm run build:web      # 只出静态站点（dist/）
npm run build:desktop  # 桌面端打包（当前平台的全部产物）
npm run build:win      # 仅 NSIS + MSI
npm run build:mac      # 仅 dmg + app
npm run build:linux    # 仅 deb + rpm + AppImage
npm run build          # 等同 build:desktop

npm run typecheck      # 前端类型检查
```

> `build:mac` / `build:linux` 必须在对应系统上执行 —— Tauri 不能跨平台交叉编译
> （macOS 包只能在 macOS 上打，Linux 包只能在 Linux 上打）。
> 三平台产物用 CI 一次出齐，见下。

## 产物位置

```
src-tauri/target/release/bundle/
  nsis/     Aelux Launcher_1.0.0_x64-setup.exe     # Windows 安装包
  msi/      Aelux Launcher_1.0.0_x64_en-US.msi      # Windows MSI
  dmg/      Aelux Launcher_1.0.0_aarch64.dmg       # macOS 磁盘映像
  macos/    Aelux Launcher.app                      # macOS 应用包
  deb/      aelux-launcher_1.0.0_amd64.deb         # Linux
  rpm/      aelux-launcher-1.0.0-1.x86_64.rpm      # Linux
  appimage/ aelux-launcher_1.0.0_amd64.AppImage    # Linux
```

## CI 三平台构建

`.github/workflows/release.yml` 用矩阵在 GitHub Actions 上同时产出三平台安装包：

- **Windows**：`windows-latest` → NSIS + MSI（装 WiX toolset）
- **macOS**：`macos-latest` → dmg（同时出 aarch64 与 x86_64 两个 target）
- **Linux**：`ubuntu-22.04` → deb + rpm + AppImage

触发时机：推 `main`、打 `v*` tag、手动 `workflow_dispatch`。

> App 通过 `file:../` 依赖同级的 `Aelux-Launcher-Lib` 与 `Aelux-Components`（三个独立仓库），
> CI 里分别 checkout 到同级目录，并且**先构建这两个包**（它们产出的 `dist/` 才是 App 的依赖入口）。

## 已知占位

真实游戏启动、Java 探测与更新自替换逻辑仍为占位，按开发文档逐步补全。
