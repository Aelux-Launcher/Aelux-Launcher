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
  icon?: string | null
  createdAt: string
  lastPlayedAt?: string | null
  playtimeSecs: number
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
  downloadConcurrency: number
  hideOnLaunch: boolean
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
}

/* --------------------------- 社区资源（Modrinth） --------------------------- */

export type ResourceKind = 'mod' | 'modpack' | 'resourcepack' | 'shader' | 'datapack' | 'world'
export type ResourceSource = 'all' | 'modrinth' | 'curseforge'

export interface ResourceQuery {
  name: string
  source: ResourceSource
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
  /** 后缀标签（如 .jar / .zip） */
  suffix?: string
  author?: string
}

export interface ResourceDetailData {
  project: ResourceProject
  body: string
  versions: ResourceVersion[]
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

/** 版本设置页的左栏子项（概览→设置→修改→Mod 管理→导出）。 */
export type InstanceTab = 'overall' | 'setup' | 'modify' | 'mod' | 'export'

/** 详情页（进入后顶栏出现返回按钮）。 */
export type SubPage =
  | { kind: 'select' }
  | { kind: 'tasks' }
  | { kind: 'instance'; instanceId: string; tab: InstanceTab }
  | { kind: 'resource'; resourceKind: ResourceKind; projectId: string; title: string }
  | { kind: 'help'; entryId: string; title: string }
