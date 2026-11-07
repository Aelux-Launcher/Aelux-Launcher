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
| 壳 | Tauri 2.x（无边框窗口，Windows / macOS / Linux） |
| 内核接入 | dev-path（rlib 源码联调，默认）/ release-ffi（cdylib + libloading） |

## 快速开始

```bash
npm install
npm run dev          # cargo tauri dev（默认 dev-path，直调 Aelux-Core 源码）
npm run dev:core     # 同上（显式指定 dev-path）
npm run dev:web      # 仅启动 Vite 前端开发服务器（tauri dev 会自动调用）
npm run typecheck    # vue-tsc
npm run build:web    # 纯前端构建
```

> 启动器只连接真实内核，不再提供浏览器预览 / mock 假数据：直接打开网页会提示
> 「未连接启动器内核」，请始终用 `npm run dev` 或打包后的桌面端运行。
> 完整功能需要官方分发的内核二进制，内核源码不公开。
> 系统要求：Windows 10 (1803+) / Windows 11（WebView2 运行时系统自带；缺失时安装微软官方 Runtime 即可）。

## 内核接入（两条链路）

```toml
[features]
default = ["dev-path"]                # 本地源码联调（默认）
dev-path    = ["dep:aelux-core"]      # 本地源码联调
release-ffi = ["dep:libloading"]      # 发布打包
```

- **dev-path**（默认）：`aelux-core` 以 path 依赖参与编译，`core_api/dev.rs` 直调
  `CoreApi`；内核事件经 broadcast channel 转发为 Tauri 事件（`core-event`）。
- **release-ffi**（发布打包）：`build.rs` 就位 cdylib（本地 `src-tauri/lib/<platform>/` 优先，
  否则 `node scripts/fetch-core.mjs` 按 manifest.json 下载 + sha256 校验），
  拷入 resources 打进安装包；运行时 `core_api/ffi_backend.rs` 用 libloading 加载，
  JSON 进出，**离线运行**。

两条链路对外暴露**完全相同**的函数签名（`core_api/mod.rs` 契约），命令层零感知。
未选择任何链路时编译期直接 `compile_error!`，避免误用假实现。

## 第三方服务配置

凭据只保存在本机内核 KV（`data/kv/store.json`），不上传；设置页修改后立即生效。

### CurseForge API Key

1. 打开 <https://console.curseforge.com/>，用 CurseForge 账号登录；
2. 在 **API Keys** 页申请一个 Key（个人使用即可）；
3. 启动器「设置 → 服务与 API → CurseForge API Key」粘贴保存。

未配置时 CurseForge 源不可用，搜索会自动只展示 Modrinth；配置后搜索结果
会把两个来源合并并按下载量排序。所有请求由内核转发到
`https://api.curseforge.com/v1`（请求头 `x-api-key`），前端不直接接触 Key。

### 微软正版登录（Microsoft OAuth 设备码流）

1. 打开 <https://portal.azure.com/> → **Microsoft Entra ID → 应用注册 → 新注册**；
2. 受支持的账户类型选「**仅个人 Microsoft 账户**」；
3. 注册后在「**身份验证 → 添加平台 → 移动和桌面应用程序**」，
   勾选「`https://login.microsoftonline.com/common/oauth2/nativeclient`」与
   「**允许公共客户端流 (Enable public client flow)**」；
4. 复制概览页的「**应用程序(客户端) ID**」；
5. 填入「设置 → 服务与 API → 微软 Client ID」，或打包时用环境变量注入：

   ```powershell
   $env:AELUX_MSA_CLIENT_ID = "<你的客户端 ID>"
   ```

解析优先级：环境变量 `AELUX_MSA_CLIENT_ID` → 内核 KV `msa_client_id` → 占位值。
占位值状态下发起登录会直接提示「未配置微软 Client ID」。

登录链路：设备码 → Xbox Live → XSTS → Minecraft 服务 → 档案；
refresh token 按账户存入系统钥匙串，账户页「刷新」会静默续期，不再要求重新登录。

### 已对接的公开 API

| 服务 | 地址 | 用途 |
| --- | --- | --- |
| Modrinth v2 | `https://api.modrinth.com/v2` | 搜索 / 详情 / 版本 / 依赖 / 更新检查 |
| CurseForge v1 | `https://api.curseforge.com/v1` | 搜索 / 详情 / 版本 / 依赖 / 整合包解析 |
| Mojang 版本清单 | `https://launchermeta.mojang.com` / `piston-meta` | 游戏与资源下载 |
| Fabric / Quilt / Forge / NeoForge | 各自官方 meta | 加载器版本与安装 |
| MC 百科 | `https://search.mcmod.cn` | 资源中文名补充 |

## IPC 与类型同步

- 命令层：`src-tauri/src/commands.rs`（每个命令带 `#[tauri::command]` + `#[specta::specta]`）
- 绑定：`src/lib/bindings.ts`（tauri-specta 生成，**纳入 git**）
- 本地导出：`cargo tauri dev`（debug 启动时自动重新导出）
- CI 漂移检查：Linux 上 `cargo test export_bindings` + `git diff --exit-code -- src/lib/bindings.ts`，
  diff 非空即「IPC schema drift」

## 打包与分发

三种产物形态，按发布场景选：

| 命令 | 产物 | 内核来源 | 适用场景 |
| --- | --- | --- | --- |
| `npm run build:single` | **单文件 exe**（内核静态编译进 exe，无需 dll） | 内核源码（dev-path） | **你自己在有源码的机器上发布**，最简单 |
| `npm run build:portable` | 便携 ZIP（exe + 内核 dll） | 下载二进制（fetch-core） | 公开 CI / 别的机器打包，源码不外泄 |
| `npm run build:release` | NSIS / MSI 安装器 | 下载二进制 | 需要安装器形态时 |

- 单文件 exe 复制到任意目录即用，数据写 exe 同级 `data/`
- 便携 ZIP 内含 `Aelux-Launcher.exe` + `aelux_core.dll` + 说明，解压双击即用
- 三种形态的数据目录行为完全一致（exe 同级 `data/`，整目录拷走即迁移）

**版本策略（测试期）**：版本号统一为 `0.1.0`，不随构建自增，改版本时手动同步三处——
`package.json`、`src-tauri/tauri.conf.json`（启动器）、`Aelux-Core/Cargo.toml`（内核）。
「关于」页同时展示启动器版本（Tauri 运行时读取）与内核版本（`get_core_version` 命令）。

## 发布操作手册

### 一次性准备

1. **内核仓库（Aelux-Core，私有）**：打一次 tag 发布内核
   ```bash
   cd Aelux-Core
   git tag v0.1.0
   git push origin v0.1.0        # 触发 core CI → 三平台编译 cdylib + manifest.json → 传到 core 的 Release
   ```
2. **launcher 仓库** 配置三个 Secrets（Settings → Secrets and variables → Actions）：
   | Secret | 值 | 用途 |
   | --- | --- | --- |
   | `CORE_MANIFEST_URL` | `https://github.com/<组织>/Aelux-Core/releases/download/v0.1.0/manifest.json` | 打包时拉内核 dll 清单（**发布必需**） |
   | `CORE_DOWNLOAD_TOKEN` | 对内核仓库有 Contents 只读权限的 fine-grained PAT | 私有 Release 资产下载鉴权（**发布必需**） |
   | `CORE_ACCESS_TOKEN` + `CORE_REPO` | 同一 token + `<组织>/Aelux-Core` | 可选：CI 里拉源码做 dev-path 集成检查 |

### 发测试版（Beta）

**方式 A：本地出包（最快，零配置，推荐日常测试）**

```bash
npm run build:single      # 产出 src-tauri/target/release/aelux-launcher-app.exe（单文件，直接发人）
```

**方式 B：GitHub 出包（走完整发布链路）**

1. 确认上面的「一次性准备」已完成
2. 仓库页 → Actions → **发布 Windows 便携包** → Run workflow →
   版本号填 `0.1.0`、渠道选 `beta` → Run
3. 跑完后两处可取包：
   - 该次运行页底部的 **Artifacts**（即时测试用）
   - **Releases** 页的 `Aelux-Launcher-v0.1.0-Beta.zip`（对外链接）

等价命令行方式：`git tag v0.1.0 && git push origin v0.1.0`（tag 名含 beta 才会标 Beta，
纯数字 tag 默认按 Stable 处理——所以测试版建议直接用 Actions 页面触发）。

### 发正式版（Stable）

1. **升版本号**（测试结束转正时）：三处 `0.1.0` → `x.y.z` 并提交
   - `package.json`、`src-tauri/tauri.conf.json`（启动器）
   - `Aelux-Core/Cargo.toml`（内核，若内核有改动）
2. **内核先发**（若内核有改动）：core 仓库打 `vx.y.z` tag 并推送 → 确认 core CI 绿灯
3. **更新内核清单地址**：launcher 仓库 secret `CORE_MANIFEST_URL` 改指向新 tag 的 manifest
4. **发正式包**：Actions → 发布 Windows 便携包 → Run workflow →
   版本号填 `x.y.z`、渠道选 **`stable`** → Run
   - 产物：`Aelux-Launcher-vx.y.z-Stable.zip`，自动创建 Release
5. 验证 Release 页资产与「关于」页双版本号（启动器 / 内核）

> 日常「测试版」不需要升版本号、不需要动 tag；只有转正式版时才走上面五步。

### 内核与启动器的版本对应

内核独立发版：core 打 `vx.y.z` tag → core CI 产出 cdylib + manifest.json（`core_version`
取自 tag）→ launcher 打包时 fetch-core 按 manifest 下载并校验 sha256。「关于」页可查当前
使用的内核版本。

## CI（`.github/workflows/`）

- `ci.yml` —— 「CI · 检查（不发布产物）」：前端类型检查与构建、Rust 编译检查（Windows / Linux）、bindings 漂移
- `release.yml` —— 「发布 Windows 便携包」：tag / 手动触发 → fetch-core → 便携 ZIP → GitHub Release

CI 里的内核依赖：`aelux-core` 是 optional path 依赖，Cargo resolve 阶段要求路径存在，因此
workflow 会先准备它——

- **未配置 secrets**（外部贡献者 / fork）：生成空 stub crate 占位，CI 只做前端检查；
- **配置了 `CORE_ACCESS_TOKEN` + `CORE_REPO` secrets**：拉取私有内核仓库，并顺带执行
  `cargo check --features dev-path` 验证源码集成。

## 目录

```text
src/
├── design/          视觉系统（theme.css 唯一视觉来源 + styles.css 应用层）
├── components/      TopHeader / SideNav / 控件（极简黑白设计）+ 图标
├── views/           页面（启动 / 下载 / 设置 / 更多 + 详情页）
├── stores/app.ts    组合根：模块分组模型 + 数据缓存 + 动作
├── lib/             bridge（IPC）、bindings.ts（生成）、类型
└── router/          模块页 + 详情页的路由表
src-tauri/
├── src/core_api/    两条内核链路（dev / ffi）
├── src/commands.rs  Tauri 命令层（specta 标注）
├── build.rs         release-ffi 内核就位 + 资源拷贝
└── resources/       随包资源（公告等）
```
