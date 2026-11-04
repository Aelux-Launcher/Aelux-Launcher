# Aelux Launcher

Minecraft Java Edition 桌面启动器（公开仓库）：Tauri 2 薄壳 + Vue 3.6 Vapor 前端。
内核（[Aelux-Core](../Aelux-Core)，私有）以三种链路接入，见下文「内核接入」。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Vue 3.6（Vapor Mode，`createVaporApp` 全量 vapor，不打包 vdom 渲染器） |
| 构建 | Vite + @vitejs/plugin-vue（`features.vapor: true`）+ Tailwind CSS 4 |
| 语言 | TypeScript（tauri-specta 自动生成类型化 IPC 客户端 `src/lib/bindings.ts`） |
| 状态 | Pinia |
| 路由 | vue-router（hash 模式） |
| 壳 | Tauri 2.x（无边框透明窗口，Windows / macOS / Linux） |
| 内核接入 | dev-path（rlib 源码联调）/ release-ffi（cdylib + libloading）/ mock（默认，内置假实现） |

## 快速开始

```bash
npm install
npm run dev          # cargo tauri dev（默认 mock 链路，无需内核即可跑完整 UI）
npm run dev:core     # cargo tauri dev --features dev-path（path 依赖 Aelux-Core 源码联调）
npm run typecheck    # vue-tsc
npm run build:web    # 纯前端构建
```

> 外部贡献者：clone 后直接 `npm run dev` 即可（mock 链路）。
> 完整功能需要官方分发的内核二进制，内核源码不公开。

## 内核接入（三条链路）

```toml
[features]
default = ["mock"]                    # 内置假实现，UI 正常跑
dev-path    = ["dep:aelux-core"]      # 本地源码联调
release-ffi = ["dep:libloading"]      # 发布打包
```

- **dev-path**（日常开发）：`aelux-core` 以 path 依赖参与编译，`core_api/dev.rs` 直调
  `CoreApi`；内核事件经 broadcast channel 转发为 Tauri 事件（`core-event`）。
- **release-ffi**（发布打包）：`build.rs` 就位 cdylib（本地 `src-tauri/lib/<platform>/` 优先，
  否则 `node scripts/fetch-core.mjs` 按 manifest.json 下载 + sha256 校验），
  拷入 resources 打进安装包；运行时 `core_api/ffi_backend.rs` 用 libloading 加载，
  JSON 进出，**离线运行**。
- **mock**（默认）：无内核依赖，数据为内置演示值。

三条链路对外暴露**完全相同**的函数签名（`core_api/mod.rs` 契约），命令层零感知。

## IPC 与类型同步

- 命令层：`src-tauri/src/commands.rs`（每个命令带 `#[tauri::command]` + `#[specta::specta]`）
- 绑定：`src/lib/bindings.ts`（tauri-specta 生成，**纳入 git**）
- 本地导出：`cargo tauri dev`（debug 启动时自动重新导出）
- CI 漂移检查：Linux 上 `cargo test export_bindings` + `git diff --exit-code -- src/lib/bindings.ts`，
  diff 非空即「IPC schema drift」

## 打包与分发

```bash
npm run build:release                     # tauri build --features release-ffi
npm run build:win                         # NSIS + MSI
node scripts/fetch-core.mjs               # 打包前就位内核 dll（R2 / 私有 Release）
```

- Windows：便携 ZIP 首选（exe + 内核 dll，解压即用，数据写 exe 同级 `data/`），NSIS / MSI 备选
- macOS：DMG / App（需签名 + 公证）
- Linux：deb / rpm / AppImage

CI（`.github/workflows/`）：`ci.yml`（类型检查 / 构建 / 编译 / bindings 漂移），
`release.yml`（tag 触发：fetch-core → release-ffi 打包 → 便携 ZIP → 公开 Release）。
内核二进制源通过 secret `CORE_MANIFEST_URL` 配置（R2 桶或私有 core 仓库 Release）。

## 目录

```text
src/
├── design/          视觉系统（theme.css 唯一视觉来源 + styles.css 应用层）
├── components/      alx-* 控件（设计规格 1:1）+ TitleBar + 图标
├── views/           页面（启动 / 下载 / 联机 / 设置 / 更多 + 5 类副页面）
├── stores/app.ts    组合根：页面栈模型 + 数据缓存 + 动作
├── lib/             bridge（IPC / 浏览器预览模拟）、bindings.ts（生成）、类型
└── router/          主页面 5 + 副页面 5 类的路由表
src-tauri/
├── src/core_api/    三条内核链路（dev / ffi / mock）
├── src/commands.rs  Tauri 命令层（specta 标注）
├── build.rs         release-ffi 内核就位 + 资源拷贝
└── resources/       随包资源（公告等）
```
