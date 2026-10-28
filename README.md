# Aelux-Launcher-App

Aelux Launcher 的桌面启动器壳（Tauri 2 + React 19 + Zustand）。消费 [`aelux-components`](../Aelux-Components) 提供 UI，调用 [`aelux-launcher-lib`](../Aelux-Launcher-Lib) 承载业务规则。

## 架构定位

- **壳只做编排**：窗口/路由/界面拼装，不含业务规则。
- **UI** 来自 `aelux-components`（纯展示组件 + `--aelux-*` 设计变量）。
- **逻辑** 来自 `aelux-launcher-lib`（登录 / Modrinth / 更新 / 公告 / 遥测 / AI 注入）。
- **桌面能力层（Rust）** 在 `src-tauri/`：文件读写、解压、进程启停、Java 探测、系统信息。
  - `src-tauri/src/commands.rs`：原型（`Aelux-Tauri`）遗留的能力层，已被本仓库取代。
  - `src-tauri/src/ext_commands.rs`：lib-platform 桥接命令（`kv_*`、下载校验、更新、注入、公告读取）。

## 目录

```
src/
  lib/bridge.ts        # PlatformAdapter → Tauri invoke 的唯一通信面
  store.ts             # Zustand：组合 lib 各模块，驱动 UI
  components/TitleBar  # 自定义标题栏（窗口无系统边框）
  views/               # home / login / mods / settings
src-tauri/             # Rust 能力层
```

## 运行

前置：Rust 工具链 + Node ≥ 20.19 + WebView2（Windows 10 1803+ 已自带）。

```bash
npm install
npm run tauri dev      # 开发模式
npm run tauri build    # 产出安装包（NSIS / MSI / dmg / AppImage）
```

> 注意：`src-tauri` 的 Rust 代码在本机需 `cargo build` 通过；真实游戏启动、Java 探测与更新自替换逻辑仍为占位，按开发文档逐步补全。
