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
  编译期用 `include_bytes!` 嵌入 exe；运行时释放到应用缓存目录后
  用 libloading 加载，JSON 进出，**离线运行**（发布包单文件，不带 dll）。

两条链路对外暴露**完全相同**的函数签名（`core_api/mod.rs` 契约），命令层零感知。
未选择任何链路时编译期直接 `compile_error!`，避免误用假实现。

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
| `npm run build:portable` | **单文件 exe**（内核 dll 编译期嵌入，无需随包分发） | 下载二进制（fetch-core） | 公开 CI / 别的机器打包，源码不外泄 |
| `npm run build:release` | NSIS / MSI 安装器（内核已嵌入 exe） | 下载二进制 | 需要安装器形态时 |

- 单文件 exe 复制到任意目录即用，数据写 exe 同级目录（见下方目录布局）
- 便携 ZIP 内含 `Aelux-Launcher.exe` + 说明，解压双击即用
- 三种形态的数据目录行为完全一致（exe 同级根目录，整目录拷走即迁移）

### 目录布局

游戏文件与启动器文件严格分开，根目录就是 exe 所在目录：

```text
<启动器根目录>/
├── Aelux-Launcher.exe
├── .minecraft/            游戏相关：版本 / 依赖库 / 资源 / 实例游戏目录
│   ├── versions/
│   ├── libraries/
│   ├── assets/
│   └── instances/<id>/    实例的存档 / 配置 / 日志
└── aelux/                 启动器相关
    ├── config/launcher.json
    ├── instances/<id>.json
    ├── kv/store.json
    ├── cache/
    ├── logs/
    └── java/              启动器下载的 Java 运行时
```

- 旧版的 `data/` 或 `%APPDATA%\aelux` 会在首次启动时自动拆分迁移到上述两个目录。
- 官方启动器的 `%APPDATA%\.minecraft` 不会被当作 Aelux 的游戏目录。

**版本策略**：日常开发 / 本地构建可保持 `0.1.0`；**发 Release 前必须**把
`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 三处启动器版本
同步为发布版本（workflow 会校验 tag 与三处完全一致）。内核版本独立维护在
`Aelux-Core/Cargo.toml`。「关于」页同时展示启动器版本（Tauri 运行时读取）与内核版本
（`get_core_version` 命令）。

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
   | `CORE_ACCESS_TOKEN` + `CORE_REPO` | 同一 token + `<组织>/Aelux-Core` | CI 里拉源码做 dev-path 编译检查（**CI 必需**） |

### 发测试版（Beta）

**方式 A：本地出包（最快，零配置，推荐日常测试）**

```bash
npm run build:single      # 产出 src-tauri/target/release/aelux-launcher-app.exe（单文件，直接发人）
```

**方式 B：GitHub 出包（走完整发布链路）**

1. 确认上面的「一次性准备」已完成，并把三处启动器版本改成与 tag 相同（如 `0.1.1-beta.1`）
2. 仓库页 → Actions → **发布 Windows 便携包** → Run workflow →
   版本号填 `0.2.0`（或 `0.2.0-beta.1`）、渠道选 `beta` → Run
   - beta 渠道未写 `-beta` 时自动发成 `v0.2.0-beta`，保证 tag / 包名 / 清单渠道一致
   - 版本号与三处工程版本不一致时 workflow 会直接失败（防止装上新版仍报告旧版本）
3. 跑完后两处可取包：
   - 该次运行页底部的 **Artifacts**（即时测试用）
   - **Releases** 页的 `Aelux-Launcher-v0.2.0-beta-Beta.zip`（对外链接）

等价命令行方式：`git tag v0.2.0-beta.1 && git push origin v0.2.0-beta.1`（tag 名含 beta 才会标 Beta）。
要触发现有安装的自动更新，发布版本必须高于客户端当前版本（如客户端 0.1.0 → 发 0.2.0）。

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

### 自动更新分发（客户端更新源）

启动器内置自研换身式更新（设置 → 启动器更新），支持三种来源：

| 来源 | 地址 | 说明 |
| --- | --- | --- |
| GitHub Releases | 本仓库 Release | 公开仓库，客户端直接读取 `launcher-update.json` 资产 |
| 自建服务器 | 如 `https://updates.example.com` | 由 [Aelux-Updates](https://github.com/Aelux-Launcher/Aelux-Updates) 镜像提供 |
| Cloudflare | `https://<project>.pages.dev` 或自定义域名 | 与自建服务器共用同一个 `public/` 部署目录 |

镜像仓库 [Aelux-Updates](https://github.com/Aelux-Launcher/Aelux-Updates) 会每 30 分钟
（或本仓库发版后的 `repository_dispatch`）自动抓取最新 Release 的 zip 与
`launcher-update.json`，sha256 校验后提交进 `public/`。该目录可直接：

- **Cloudflare Pages**：连接 Git 后构建命令留空、输出目录 `public`，随同步提交自动部署
  （或配置 `CF_DEPLOY_HOOK`）；
- **自建服务器**：`git clone` 后交给 `nginx/default.conf`，或 `docker compose up -d`，
  再配一条定时 `git pull`。

发布版本必须高于客户端当前版本，客户端才会提示更新。

### 内核与启动器的版本对应

内核独立发版：core 打 `vx.y.z` tag → core CI 产出 cdylib + manifest.json（`core_version`
取自 tag）→ launcher 打包时 fetch-core 按 manifest 下载并校验 sha256。「关于」页可查当前
使用的内核版本。

## CI（`.github/workflows/`）

- `ci.yml` —— 「CI · 检查（不发布产物）」：前端类型检查与构建、Rust 编译检查（Windows / Linux）、bindings 漂移
- `release.yml` —— 「发布 Windows 便携包」：tag / 手动触发 → fetch-core → 便携 ZIP → GitHub Release

CI 里的内核依赖：`aelux-core` 是 optional path 依赖，而 `src-tauri` 的默认特性 `dev-path`
会直接编译内核源码，所以 CI 必须拿到真实内核源码——

- workflow 用 `CORE_ACCESS_TOKEN`（兼容仓库里的历史拼写 `CORE_ACCESS_TOKE`）+ `CORE_REPO`
  拉取私有内核仓库，然后执行 `cargo check --all-targets`；
- 两个 secret 缺失或拉取失败时，步骤直接报错退出（不再退化成空 stub crate——
  空 stub 在 dev-path 下必然编译失败，只会报出一串误导性的「找不到模块」错误）。

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
