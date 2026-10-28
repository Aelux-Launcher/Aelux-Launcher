/**
 * 设置页的数据模型。
 *
 * 分两层：
 *   1. 核心层 —— lib-core 的 `SettingsSchema` 覆盖的字段（内存、Java 路径、实例目录等），
 *      直接与游戏启动相关，保存时必须过一遍 schema 校验再写回 store。
 *   2. 界面层 —— 外观、下载源、社区资源等纯偏好。lib 的 schema 不认识这些字段，
 *      由本文件补一份默认值与类型，落盘时与核心层合并存到同一个 'settings' 键。
 *
 * 落盘/读取都经过 lib 的平台适配器（platform.storage），视图层不直接碰磁盘。
 */
import { SettingsSchema, type Settings } from 'aelux-launcher-lib'
import { platform } from '../store'

/** 'settings' 在本地存储中的键名。 */
export const SETTINGS_KEY = 'settings'

/* ============================== 枚举类型 ============================== */

/** 默认版本隔离方式 */
export type IsolationMode = 'all' | 'mod' | 'snapshot' | 'none'
/** 启动器可见性 */
export type LauncherVisibility = 'keep' | 'hide' | 'minimize'
/** 进程优先级 */
export type ProcessPriority = 'low' | 'normal' | 'high'
/** 内存分配方式 */
export type MemoryMode = 'follow' | 'auto' | 'custom'
/** GC 算法 */
export type GcMode = 'follow' | 'zgc' | 'g1' | 'none'
/** 主题偏好（跟随系统时实际主题由系统决定） */
export type ThemePref = 'light' | 'dark' | 'system'
/** 标题栏样式 */
export type TitleBarStyle = 'none' | 'default' | 'text' | 'image'
/** 主页样式 */
export type HomePageStyle = 'blank' | 'preset' | 'local' | 'online'
/** 下载源偏好 */
export type SourcePref = 'mirror' | 'official-first' | 'official'
/** 社区资源来源偏好 */
export type CommunitySource = 'mirror' | 'mirror-fallback' | 'official'
/** 文件名格式 */
export type FileNameFormat = 'bracket-full' | 'bracket-half' | 'dash' | 'raw'
/** Mod 管理样式 */
export type ModManageStyle = 'title-translated' | 'title-filename'
/** 启动器更新策略 */
export type LauncherUpdate = 'auto' | 'notify' | 'off'
/** 启动器公告策略 */
export type LauncherNotice = 'auto' | 'notify' | 'off'

/** 联机方式 */
export type OnlineMode = 'direct' | 'relay' | 'lan'

/* ============================== 草稿结构 ============================== */

/** 界面层的额外偏好（lib 的 SettingsSchema 不覆盖的部分）。 */
export interface SettingsExtras {
  /* 启动 */
  isolation: IsolationMode
  windowTitle: string
  customInfo: string
  launcherVisibility: LauncherVisibility
  processPriority: ProcessPriority
  windowSize: 'default' | '854' | '1280'
  memoryMode: MemoryMode
  memoryOptimize: boolean
  jvmArgs: string
  gameArgs: string
  gcMode: GcMode
  preLaunchCommand: string
  forbidModUpdate: boolean
  disableFileVerify: boolean
  disableJlw: boolean
  verifySsl: boolean
  /* 个性化 */
  opacity: number
  themePref: ThemePref
  showIconOnLaunch: boolean
  overlayColorBg: boolean
  backgroundImage: string
  backgroundMusic: string
  titleBar: TitleBarStyle
  homePage: HomePageStyle
  hideDownload: boolean
  hideSettings: boolean
  hideMore: boolean
  hideMultiplayer: boolean
  hideAccount: boolean
  hideFeedback: boolean
  hideVote: boolean
  hideUpdateNotice: boolean
  /* 其他 */
  downloadSource: SourcePref
  versionSource: SourcePref
  maxThreads: number
  speedLimit: number
  communitySource: CommunitySource
  fileNameFormat: FileNameFormat
  modManageStyle: ModManageStyle
  releaseNotice: boolean
  betaNotice: boolean
  autoChinese: boolean
  launcherUpdate: LauncherUpdate
  launcherNotice: LauncherNotice
  cacheFolder: string
  anonymousStats: boolean
  /* 联机 */
  /** 联机方式：直连 / 通过中转 / 局域网 */
  onlineMode: OnlineMode
  /** 中转服务器地址（留空则用默认公共节点） */
  onlineRelay: string
  /** 联机时是否自动隐藏启动器 */
  onlineHideLauncher: boolean
  /** 联机时是否自动进入上次服务器 */
  onlineAutoEnter: boolean
  /** 联机端口 */
  onlinePort: number
  /** 联机昵称（留空则用当前账号） */
  onlineNickname: string
}

/** 设置草稿 = 核心字段 + 界面偏好。 */
export type SettingsDraft = Settings & SettingsExtras

/** 核心字段名（落盘时与界面层分开处理）。 */
const CORE_KEYS = [
  'memoryMb',
  'javaPath',
  'instancesDir',
  'closeOnExit',
  'autoUpdate',
  'showConsole',
  'aiFixMod',
] as const

/** 全部默认值。 */
export const DEFAULT_DRAFT: SettingsDraft = {
  /* 核心 */
  memoryMb: 2048,
  javaPath: '',
  instancesDir: '',
  closeOnExit: false,
  autoUpdate: true,
  showConsole: true,
  aiFixMod: false,
  /* 启动 */
  isolation: 'all',
  windowTitle: '',
  customInfo: 'Aelux',
  launcherVisibility: 'keep',
  processPriority: 'normal',
  windowSize: 'default',
  memoryMode: 'follow',
  memoryOptimize: false,
  jvmArgs: '',
  gameArgs: '',
  gcMode: 'follow',
  preLaunchCommand: '',
  forbidModUpdate: false,
  disableFileVerify: false,
  disableJlw: false,
  verifySsl: true,
  /* 个性化 */
  opacity: 100,
  themePref: 'light',
  showIconOnLaunch: true,
  overlayColorBg: false,
  backgroundImage: '',
  backgroundMusic: '',
  titleBar: 'default',
  homePage: 'preset',
  hideDownload: false,
  hideSettings: false,
  hideMore: false,
  hideMultiplayer: false,
  hideAccount: false,
  hideFeedback: false,
  hideVote: false,
  hideUpdateNotice: false,
  /* 其他 */
  downloadSource: 'mirror',
  versionSource: 'mirror',
  maxThreads: 64,
  speedLimit: 42,
  communitySource: 'mirror',
  fileNameFormat: 'bracket-full',
  modManageStyle: 'title-translated',
  releaseNotice: true,
  betaNotice: false,
  autoChinese: true,
  launcherUpdate: 'auto',
  launcherNotice: 'auto',
  cacheFolder: '',
  anonymousStats: false,
  /* 联机 */
  onlineMode: 'direct',
  onlineRelay: '',
  onlineHideLauncher: false,
  onlineAutoEnter: false,
  onlinePort: 25565,
  onlineNickname: '',
}

/** 数值字段的合法区间（落盘数据可能被外部改坏，这里做一次夹取）。 */
const NUM_RANGES: Partial<Record<keyof SettingsDraft, [number, number]>> = {
  memoryMb: [512, 8192],
  opacity: [40, 100],
  maxThreads: [1, 256],
  speedLimit: [1, 42],
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

/**
 * 把落盘的原始数据合并进默认草稿：
 *   - 类型不符的字段一律回落到默认值，避免脏数据进入界面；
 *   - 数值字段额外做区间夹取。
 */
export function mergeStored(raw: unknown): SettingsDraft {
  const out = { ...DEFAULT_DRAFT } as Record<string, unknown>
  if (!raw || typeof raw !== 'object') return out as unknown as SettingsDraft
  const obj = raw as Record<string, unknown>

  for (const key of Object.keys(DEFAULT_DRAFT) as (keyof SettingsDraft)[]) {
    const value = obj[key]
    if (value === undefined || value === null) continue
    const fallback = DEFAULT_DRAFT[key]
    if (typeof value !== typeof fallback) continue
    if (typeof value === 'number') {
      const range = NUM_RANGES[key]
      out[key] = range ? clamp(value, range[0], range[1]) : value
    } else {
      out[key] = value
    }
  }
  return out as unknown as SettingsDraft
}

/**
 * 从外部数据里挑出「存在且类型正确」的字段，用于导入设置时只覆盖用户确实导入的项。
 */
export function pickValid(raw: unknown): Partial<SettingsDraft> {
  const out: Record<string, unknown> = {}
  if (!raw || typeof raw !== 'object') return out as Partial<SettingsDraft>
  const obj = raw as Record<string, unknown>
  for (const key of Object.keys(DEFAULT_DRAFT) as (keyof SettingsDraft)[]) {
    const value = obj[key]
    if (value === undefined || value === null) continue
    const fallback = DEFAULT_DRAFT[key]
    if (typeof value !== typeof fallback) continue
    if (typeof value === 'number') {
      const range = NUM_RANGES[key]
      out[key] = range ? clamp(value, range[0], range[1]) : value
    } else {
      out[key] = value
    }
  }
  return out as unknown as Partial<SettingsDraft>
}

/** 读取已保存的设置草稿。 */
export async function loadDraft(): Promise<SettingsDraft> {
  const raw = await platform.storage.get(SETTINGS_KEY)
  if (!raw) return { ...DEFAULT_DRAFT }
  try {
    return mergeStored(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_DRAFT }
  }
}

/** 从草稿里取出核心字段（过 schema 校验）。 */
export function coreOf(draft: SettingsDraft): Settings {
  return SettingsSchema.parse({
    memoryMb: draft.memoryMb,
    javaPath: draft.javaPath,
    instancesDir: draft.instancesDir,
    closeOnExit: draft.closeOnExit,
    autoUpdate: draft.autoUpdate,
    showConsole: draft.showConsole,
    aiFixMod: draft.aiFixMod,
  })
}

/** 从草稿里取出界面层字段。 */
export function extrasOf(draft: SettingsDraft): SettingsExtras {
  const out = {} as Record<string, unknown>
  for (const key of Object.keys(DEFAULT_DRAFT) as (keyof SettingsDraft)[]) {
    if ((CORE_KEYS as readonly string[]).includes(key)) continue
    out[key] = draft[key]
  }
  return out as unknown as SettingsExtras
}

/**
 * 保存草稿：核心字段过 schema 校验后返回（由调用方写进 store），
 * 同时把核心 + 界面层一起落到本地存储。
 */
export async function persistDraft(draft: SettingsDraft): Promise<Settings> {
  const core = coreOf(draft)
  const payload = { ...core, ...extrasOf(draft) }
  await platform.storage.set(SETTINGS_KEY, JSON.stringify(payload))
  return core
}

/* ============================== 选项表 ============================== */

export const ISOLATION_OPTIONS = [
  { value: 'all', label: '隔离所有版本' },
  { value: 'mod', label: '隔离可安装 Mod 的版本' },
  { value: 'snapshot', label: '隔离非正式版' },
  { value: 'none', label: '不隔离' },
]

export const VISIBILITY_OPTIONS = [
  { value: 'keep', label: '游戏启动后仍保持不变' },
  { value: 'hide', label: '隐藏' },
  { value: 'minimize', label: '最小化' },
]

export const PRIORITY_OPTIONS = [
  { value: 'low', label: '低（省电）' },
  { value: 'normal', label: '中（平衡）' },
  { value: 'high', label: '高（性能）' },
]

export const WINDOW_SIZE_OPTIONS = [
  { value: 'default', label: '默认' },
  { value: '854', label: '854 × 480' },
  { value: '1280', label: '1280 × 720' },
]

export const GC_OPTIONS = [
  { value: 'follow', label: '跟随全局设置' },
  { value: 'zgc', label: '尽量使用 ZGC' },
  { value: 'g1', label: '标准 G1GC' },
  { value: 'none', label: '不指定' },
]

export const TITLE_BAR_OPTIONS: { value: TitleBarStyle; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'default', label: '默认' },
  { value: 'text', label: '文本' },
  { value: 'image', label: '图片' },
]

export const HOME_PAGE_OPTIONS: { value: HomePageStyle; label: string }[] = [
  { value: 'blank', label: '空白' },
  { value: 'preset', label: '预设' },
  { value: 'local', label: '读取本地文件' },
  { value: 'online', label: '联网更新' },
]

export const DOWNLOAD_SOURCE_OPTIONS = [
  { value: 'mirror', label: '尽量使用镜像源' },
  { value: 'official-first', label: '优先使用官方源，在加载缓慢时换用镜像源' },
  { value: 'official', label: '尽量使用官方源' },
]

export const COMMUNITY_SOURCE_OPTIONS = [
  { value: 'mirror', label: '尽量使用镜像源' },
  { value: 'mirror-fallback', label: '仅在官方源加载缓慢时改用镜像源' },
  { value: 'official', label: '尽量使用官方源' },
]

export const FILE_NAME_FORMAT_OPTIONS = [
  { value: 'bracket-full', label: '【机械动力】create-1.21.1-6.0.4' },
  { value: 'bracket-half', label: '[机械动力] create-1.21.1-6.0.4' },
  { value: 'dash', label: '机械动力-create-1.21.1-6.0.4' },
  { value: 'raw', label: 'create-1.21.1-6.0.4' },
]

export const MOD_MANAGE_OPTIONS = [
  { value: 'title-translated', label: '标题显示译名，详情显示文件名' },
  { value: 'title-filename', label: '标题显示文件名，详情显示译名' },
]

export const LAUNCHER_UPDATE_OPTIONS = [
  { value: 'auto', label: '自动检查并下载更新' },
  { value: 'notify', label: '仅提示，不自动下载' },
  { value: 'off', label: '不检查更新' },
]

export const LAUNCHER_NOTICE_OPTIONS = [
  { value: 'auto', label: '启动时自动弹出' },
  { value: 'notify', label: '仅在有新公告时提示' },
  { value: 'off', label: '不显示公告' },
]

/** 联机方式选项 */
export const ONLINE_MODE_OPTIONS = [
  { value: 'direct', label: '直连服务器' },
  { value: 'relay', label: '通过中转节点联机' },
  { value: 'lan', label: '局域网联机' },
]
