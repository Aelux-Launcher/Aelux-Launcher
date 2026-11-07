/**
 * 壳层数据类型：与 src-tauri/src/dto.rs 的 serde 形状一一对应（camelCase）。
 * 这些类型由 tauri-specta 的 bindings.ts 权威生成，这里是业务侧引用的别名层。
 */

/* ------------------------------ 内核 DTO ------------------------------ */

export interface OsInfo {
  name: string
  version: string
  arch: string
}

export interface VersionEntry {
  id: string
  kind: string
  url: string
  time: string
  releaseTime: string
  sha1?: string | null
}

export interface LatestVersions {
  release: string
  snapshot: string
}

export interface VersionManifest {
  latest: LatestVersions
  versions: VersionEntry[]
}

export type ModLoader = 'vanilla' | 'fabric' | 'forge' | 'neoforge' | 'quilt'

export interface GameInstance {
  id: string
  name: string
  version: string
  loader: string
  loaderVersion?: string | null
  /** 实际安装的版本目录名（加载器安装后写入） */
  versionId?: string | null
  icon?: string | null
  createdAt: string
  lastPlayedAt?: string | null
  playtimeSecs: number
}

/** 本地内容条目（mods / resourcepacks / shaderpacks / saves / schematics）。 */
export interface LocalContentItem {
  /** 磁盘上的文件名或目录名（含 `.disabled` 时按原样） */
  fileName: string
  /** 相对实例根目录的路径 */
  path: string
  kind: string
  /** 展示名（jar 元数据 / 目录名 / NBT 名称） */
  name: string
  enabled: boolean
  sizeBytes: number
  /** 文件修改时间（Unix 秒） */
  modifiedSecs: number
  version?: string | null
  description?: string | null
  loader?: string | null
  /** 存档游戏模式（仅 saves） */
  worldGameMode?: string | null
  /** 存档难度（仅 saves） */
  worldDifficulty?: string | null
  /** 存档版本（仅 saves） */
  worldVersion?: string | null
}

/** 版本安装结果。 */
export interface InstallResult {
  versionId: string
  mcVersion: string
  loader: string
  loaderVersion?: string | null
  files: number
}

/** 启动结果。 */
export interface LaunchOutcome {
  pid: number
  versionId: string
}

/** 正在运行的实例。 */
export interface RunningGame {
  instanceId: string
  pid: number
}

/** 一条可用的 Mod 更新。 */
export interface ModUpdate {
  fileName: string
  projectId: string
  projectTitle: string
  currentVersion: string
  latestVersion: string
  downloadUrl: string
  newFileName: string
  sha1?: string | null
  fileSize: number
  changelog?: string | null
}

/** 整合包导入结果。 */
export interface ModpackImportResult {
  instance: GameInstance
  files: number
}

/** 在线安装 Java 的结果。 */
export interface JavaInstallResult {
  runtime: {
    path: string
    version: string
    major: number
    vendor: string
    arch: string
  }
  installDir: string
}

/** 内核事件（dev-path 链路经 Tauri `core-event` 转发）。 */
export type CoreEvent =
  | { type: 'DownloadProgress'; taskId: string; name: string; received: number; total: number }
  | { type: 'Log'; instanceId: string; line: string }
  | { type: 'Message'; level: string; text: string }
  | {
      type: 'LaunchProgress'
      instanceId: string
      stage: string
      message: string
      current: number
      total: number
      done: boolean
      error?: string | null
    }

export interface LauncherConfig {
  theme: string
  language: string
  javaPath: string
  memoryMinMb: number
  memoryMaxMb: number
  jvmArgs: string[]
  gameArgs: string[]
  gameWidth: number
  gameHeight: number
  gameFullscreen: boolean
  downloadConcurrency: number
  /** 文件下载源：mirror / auto / official */
  fileSource: string
  /** 版本清单与版本 JSON 下载源：mirror / auto / official */
  versionSource: string
  hideOnLaunch: boolean
  cacheDir: string
}

/* ------------------------------ 业务类型 ------------------------------ */

/** 登录会话（微软 / 第三方 / 离线）。 */
export interface Session {
  type: 'microsoft' | 'third' | 'offline'
  username: string
  uuid: string
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  skinUrl?: string
  roleId?: string
}

/** 本地账户列表条目（微软 / 离线多账户并存，落 kv 'accounts'）。 */
export interface StoredAccount {
  /** 微软账户为 msaId（XBL uhs），离线账户为离线 UUID */
  id: string
  type: 'microsoft' | 'third' | 'offline'
  username: string
  uuid: string
  /** 登录时间（Unix 秒，仅展示） */
  loggedInAt: string
}

/** 外置登录认证服务器（authlib-injector）。 */
export interface AuthServer {
  /** 稳定 id（时间戳 + 随机后缀） */
  id: string
  /** 展示名（缺省取服务器域名） */
  name: string
  /** 认证服务器地址 */
  url: string
}

/** 微软设备码登录的状态机（登录弹窗渲染依据）。 */
export interface DeviceFlowState {
  status: 'idle' | 'starting' | 'waiting' | 'success' | 'error'
  userCode: string
  verificationUri: string
  error: string
}

/** 游戏文件夹（版本选择页的文件夹列表条目）。 */
export interface StoredFolder {
  /** 稳定 id（时间戳 + 随机后缀） */
  id: string
  /** current = 启动器数据目录下的 .minecraft（游戏本体 / 依赖库 / 资源都装在这里）；official = 官方启动器文件夹；added = 用户添加 */
  type: 'current' | 'official' | 'added'
  /** 文件夹绝对路径（official 未检测到时为空串） */
  path: string
}

/** 公告。 */
export interface Announcement {
  id: string
  title: string
  body: string
  date: string
  scope: 'push' | 'bundled'
  sinceVersion?: string
}

/** 启动器设置（界面层；与内核 LauncherConfig 的映射在 store 内做）。 */
export interface Settings {
  memoryMb: number
  javaPath: string
  instancesDir: string
  closeOnExit: boolean
  autoUpdate: boolean
  showConsole: boolean
  aiFixMod: boolean
}

/** 启动结果（与上游实现契约一致）。 */
export interface LaunchResult {
  ok: boolean
  pid?: number
  error?: string
  /** 用户主动结束（首页停止按钮）：不算启动失败。 */
  cancelled?: boolean
}

/* --------------------------- 社区资源（Modrinth） --------------------------- */

export type ResourceKind = 'mod' | 'modpack' | 'resourcepack' | 'shader' | 'datapack' | 'world'
export type ResourceSource = 'all' | 'modrinth' | 'curseforge'

export interface ResourceQuery {
  name: string
  source: ResourceSource
  /** 游戏版本筛选（空串 = 全部版本） */
  gameVersion: string
  /** 加载器筛选（空串 = 任意加载器） */
  loader: string
  /** 分类标签筛选（Modrinth category slug，空串 = 全部类型） */
  category: string
}

export interface ResourceProject {
  projectId: string
  slug: string
  title: string
  description: string
  categories: string[]
  displayCategories: string[]
  downloads: number
  iconUrl: string
  dateModified: string
  source: ResourceSource
  /** 项目类型（Modrinth project_type；依赖条目跳转时用于映射资源分类） */
  projectType?: string
  /** 后缀标签（如 .jar / .zip） */
  suffix?: string
  author?: string
  /** 搜索结果附带的支持游戏版本（详情接口不含该字段） */
  versions?: string[]
}

/** Modrinth 版本的前置依赖。 */
export interface ResourceDependency {
  projectId: string | null
  versionId: string | null
  /** required / optional / incompatible / embedded */
  type: string
}

export interface ResourceDetailData {
  project: ResourceProject
  body: string
  versions: ResourceVersion[]
  /** 项目级前置资源（必填依赖，去重后按依赖出现顺序） */
  dependencies: ResourceProject[]
}

export interface ResourceVersion {
  id: string
  name: string
  versionNumber: string
  gameVersions: string[]
  loaders: string[]
  datePublished: string
  downloads: number
  fileUrl: string
  fileName: string
  primary: boolean
  /** release / beta / alpha */
  releaseType?: string
  /** 前置依赖（详情页据此汇总「前置资源」卡片） */
  dependencies?: ResourceDependency[]
}

/* ------------------------------ 下载任务 ------------------------------ */

export interface DownloadTaskState {
  id: string
  name: string
  url: string
  received: number
  total: number
  status: 'pending' | 'downloading' | 'done' | 'failed'
  error?: string
}

export interface DownloadManagerState {
  tasks: DownloadTaskState[]
  /** 并行下载数 */
  active: number
  done: number
  failed: number
  pending: number
  finished: boolean
}

/* ------------------------------ 页面模型 ------------------------------ */

/** 一级模块（侧栏分组切换）：启动页 / 下载 / 设置 / 更多。 */
export type AppModuleKey = 'home' | 'download' | 'settings' | 'more'

/** 下载模块分类。 */
export type DownloadCategory =
  | 'original'
  | 'modpack'
  | 'mod'
  | 'world'
  | 'resourcepack'
  | 'datapack'
  | 'shader'

/** 设置模块分节。 */
export type SettingsSection = 'global' | 'java' | 'general' | 'appearance' | 'download'

/** 更多模块分节。 */
export type MoreSection = 'help' | 'about' | 'feedback' | 'online'

/** 版本设置页的左栏子项（概览 / 设置 / 自动安装 / 模组 / 资源包 / 世界 / 原理图）。 */
export type InstanceTab =
  | 'overall'
  | 'setup'
  | 'install'
  | 'mod'
  | 'resourcepack'
  | 'world'
  | 'schematic'

/** 详情页（进入后顶栏出现返回按钮）。 */
export type SubPage =
  | { kind: 'select' }
  | { kind: 'tasks' }
  | { kind: 'instance'; instanceId: string; tab: InstanceTab }
  | {
      kind: 'resource'
      resourceKind: ResourceKind
      projectId: string
      title: string
      /** 从列表页带入的筛选条件（详情页会预选，可清空） */
      gameVersion?: string
      loader?: string
    }
  | { kind: 'help'; entryId: string; title: string }
  | { kind: 'version'; versionId: string }
  | { kind: 'accounts' }
