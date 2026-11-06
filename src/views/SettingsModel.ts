/**
 * 设置页数据模型（纯 TS，无 zod）。
 *
 * 字段分两层：
 *   1. 核心层 —— lib/types 的 `Settings`（内存、Java 路径、自动更新等），
 *      由视图直接经 store.settings / store.saveSettings 读写落盘；
 *   2. 界面层 —— 本页新增的偏好（窗口标题、执行命令、语言、并发数、下载源等），
 *      核心类型暂不覆盖，保存时随补丁合并进 kv 'settings'
 *      （store.saveSettings 会把合并后的完整对象整体 JSON 落盘），
 *      读取时按类型回落默认值，形成尽力而为的持久化回路。
 */
import type { Settings } from '../lib/types'

/* ============================== 界面层偏好 ============================== */

/** 游戏语言 */
type GameLanguage = 'zh-CN' | 'en-US'
/** 下载源偏好 */
type DownloadSourcePref = 'official-first' | 'mirror-first'
/** 最大并行下载数 */
type MaxParallel = 4 | 8 | 16
/** 版本隔离策略 */
export type VersionIsolation =
  | 'all'
  | 'all-except-vanilla'
  | 'modded-nonrelease'
  | 'nonrelease'
  | 'modded'
  | 'off'
/** 启动器可见性（游戏启动后启动器的行为） */
export type LauncherVisibility = 'keep' | 'close' | 'hide-close' | 'hide-reopen' | 'minimize'
/** 进程优先级 */
export type ProcessPriority = 'high' | 'normal' | 'low'
/** 游戏窗口大小 */
export type GameWindowSize = 'fullscreen' | 'default' | 'launcher' | 'custom' | 'maximized'
/** 快速游玩目标 */
export type QuickPlay = 'none' | 'multiplayer' | 'singleplayer' | 'realms'
/** 游戏设置预设继承策略 */
export type PresetInherit = 'configured' | 'inherit'
/** 内存管理（垃圾回收器） */
export type GcMode = 'zgc' | 'generational-zgc' | 'g1' | 'tuned-g1' | 'none'

/** 界面层偏好（核心 Settings 暂未覆盖的字段）。 */
export interface SettingsExtras {
  /** 游戏窗口标题（留空用默认标题） */
  windowTitle: string
  /** 启动前执行的命令（留空不执行） */
  preLaunchCommand: string
  /** 自动配置内存（关闭后使用核心字段 memoryMb 的手动值） */
  autoMemory: boolean
  /** 游戏语言 */
  gameLanguage: GameLanguage
  /** 启动器不透明度（40–100） */
  opacity: number
  /** 启动页是否显示启动器图标 */
  showLauncherIcon: boolean
  /** 最大并行下载数 */
  maxParallel: MaxParallel
  /** 下载源偏好 */
  downloadSource: DownloadSourcePref

  /* -------------------------- 全局设置：启动选项 -------------------------- */
  /** 默认版本隔离策略 */
  versionIsolation: VersionIsolation
  /** 自定义窗口图标路径（留空用默认图标） */
  iconPath: string
  /** 自定义信息（显示在游戏窗口） */
  customInfo: string
  /** 启动器可见性 */
  launcherVisibility: LauncherVisibility
  /** 进程优先级 */
  processPriority: ProcessPriority
  /** 游戏窗口大小 */
  windowSize: GameWindowSize
  /** 快速游玩 */
  quickPlay: QuickPlay

  /* --------------------------- 全局设置：预设 --------------------------- */
  /** 当前预设名 */
  presetName: string
  /** 预设继承策略 */
  presetInherit: PresetInherit

  /* ------------------------- 全局设置：内存与高级 ------------------------- */
  /** 启动游戏前进行内存优化 */
  memoryOptimize: boolean
  /** Java 虚拟机参数（一行） */
  jvmArgs: string
  /** 游戏启动参数（一行） */
  gameArgs: string
  /** 内存管理（垃圾回收器） */
  gcMode: GcMode
  /** 禁用 Java Launch Wrapper */
  disableLaunchWrapper: boolean
  /** 禁用 LWJGL Unsafe Agent */
  disableUnsafeAgent: boolean
  /** 使用高性能显卡 */
  preferHighPerfGpu: boolean
}

/** 界面层默认值（模块内使用；视图经 readExtras 间接取得）。 */
const DEFAULT_EXTRAS: SettingsExtras = {
  windowTitle: '',
  preLaunchCommand: '',
  autoMemory: true,
  gameLanguage: 'zh-CN',
  opacity: 100,
  showLauncherIcon: true,
  maxParallel: 8,
  downloadSource: 'mirror-first',
  versionIsolation: 'all',
  iconPath: '',
  customInfo: '',
  launcherVisibility: 'keep',
  processPriority: 'normal',
  windowSize: 'default',
  quickPlay: 'none',
  presetName: '预设1',
  presetInherit: 'configured',
  memoryOptimize: true,
  jvmArgs: '',
  gameArgs: '',
  gcMode: 'none',
  disableLaunchWrapper: false,
  disableUnsafeAgent: false,
  preferHighPerfGpu: true,
}

/* ============================== 选项表 ============================== */

export const VERSION_ISOLATION_VALUES = [
  'all',
  'all-except-vanilla',
  'modded-nonrelease',
  'nonrelease',
  'modded',
  'off',
] as const

export const VERSION_ISOLATION_OPTIONS: Array<{
  value: VersionIsolation
  label: string
  desc: string
}> = [
  {
    value: 'all',
    label: '隔离所有版本',
    desc: '不同版本之间的存档、Mod、资源包等均不互通，会导致不同原版版本间的存档不能共用，一般不推荐。',
  },
  {
    value: 'all-except-vanilla',
    label: '隔离所有版本（不含原版）',
    desc: '不同版本之间均不互通，但原版版本除外，原版之间的存档、Mod、资源包可以共用。',
  },
  {
    value: 'modded-nonrelease',
    label: '隔离可装 Mod 的版本与非正式版',
    desc: '可安装 Mod 的版本、快照、预发布版、远古版本、愚人节版本与其他版本隔离。',
  },
  {
    value: 'nonrelease',
    label: '隔离非正式版',
    desc: '快照、预发布版、远古版本、愚人节版本与其他版本隔离。',
  },
  {
    value: 'modded',
    label: '隔离可装 Mod 的版本',
    desc: '可安装 Mod 的版本（如 Forge、Fabric）互相独立以避免 Mod 冲突，其他版本不隔离。',
  },
  { value: 'off', label: '关闭', desc: '所有版本共用同一份存档、Mod、资源包。' },
]

export const LAUNCHER_VISIBILITY_VALUES = [
  'keep',
  'close',
  'hide-close',
  'hide-reopen',
  'minimize',
] as const

export const LAUNCHER_VISIBILITY_OPTIONS: Array<{ value: LauncherVisibility; label: string }> = [
  { value: 'keep', label: '游戏启动后仍保持不变' },
  { value: 'close', label: '游戏启动后立即关闭' },
  { value: 'hide-close', label: '游戏启动后隐藏，游戏退出后自动关闭' },
  { value: 'hide-reopen', label: '游戏启动后隐藏，游戏退出后重新打开' },
  { value: 'minimize', label: '游戏启动后最小化' },
]

export const PROCESS_PRIORITY_VALUES = ['high', 'normal', 'low'] as const

export const PROCESS_PRIORITY_OPTIONS: Array<{ value: ProcessPriority; label: string }> = [
  { value: 'high', label: '高（优先保证游戏运行，游戏性能更佳，可能造成其他程序卡顿）' },
  { value: 'normal', label: '中（平衡）' },
  { value: 'low', label: '低（优先保证其他程序运行，适合挂机）' },
]

export const WINDOW_SIZE_VALUES = ['default', 'fullscreen', 'launcher', 'custom', 'maximized'] as const

export const WINDOW_SIZE_OPTIONS: Array<{ value: GameWindowSize; label: string }> = [
  { value: 'default', label: '默认' },
  { value: 'fullscreen', label: '全屏' },
  { value: 'launcher', label: '与启动器尺寸一致' },
  { value: 'custom', label: '自定义尺寸' },
  { value: 'maximized', label: '最大化' },
]

export const QUICK_PLAY_VALUES = ['none', 'multiplayer', 'singleplayer', 'realms'] as const

export const QUICK_PLAY_OPTIONS: Array<{ value: QuickPlay; label: string }> = [
  { value: 'none', label: '无' },
  { value: 'multiplayer', label: '多人联机' },
  { value: 'singleplayer', label: '单人游戏' },
  { value: 'realms', label: 'Realms' },
]

export const PRESET_INHERIT_VALUES = ['configured', 'inherit'] as const

export const PRESET_INHERIT_OPTIONS: Array<{ value: PresetInherit; label: string }> = [
  { value: 'configured', label: '已配置游戏设置不继承预设' },
  { value: 'inherit', label: '所有游戏设置继承预设' },
]

export const GC_MODE_VALUES = ['zgc', 'generational-zgc', 'g1', 'tuned-g1', 'none'] as const

export const GC_MODE_OPTIONS: Array<{ value: GcMode; label: string }> = [
  { value: 'zgc', label: '尽量使用 ZGC' },
  { value: 'generational-zgc', label: '尽量使用分代 ZGC' },
  { value: 'g1', label: '标准 G1GC' },
  { value: 'tuned-g1', label: '调优 G1GC' },
  { value: 'none', label: '不指定（可自定义）' },
]

/* ============================== 校验 / 夹取 ============================== */

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

/** 不透明度合法区间 */
export const OPACITY_RANGE: readonly [number, number] = [40, 100]

/** 不透明度夹取到合法区间（滑块输入与落盘数据共用）。 */
export function clampOpacity(v: number): number {
  const n = Number(v)
  return Math.round(clamp(Number.isFinite(n) ? n : DEFAULT_EXTRAS.opacity, OPACITY_RANGE[0], OPACITY_RANGE[1]))
}

/**
 * 从落盘设置里恢复界面层偏好：
 *   类型不符 / 非法值的字段一律回落默认值，避免脏数据进入界面。
 */
export function readExtras(raw: unknown): SettingsExtras {
  const out = { ...DEFAULT_EXTRAS }
  if (!raw || typeof raw !== 'object') return out
  const obj = raw as Record<string, unknown>

  if (typeof obj.windowTitle === 'string') out.windowTitle = obj.windowTitle
  if (typeof obj.preLaunchCommand === 'string') out.preLaunchCommand = obj.preLaunchCommand
  if (typeof obj.autoMemory === 'boolean') out.autoMemory = obj.autoMemory
  if (obj.gameLanguage === 'zh-CN' || obj.gameLanguage === 'en-US') out.gameLanguage = obj.gameLanguage
  if (typeof obj.opacity === 'number') out.opacity = clampOpacity(obj.opacity)
  if (typeof obj.showLauncherIcon === 'boolean') out.showLauncherIcon = obj.showLauncherIcon
  if (obj.maxParallel === 4 || obj.maxParallel === 8 || obj.maxParallel === 16) out.maxParallel = obj.maxParallel
  if (obj.downloadSource === 'official-first' || obj.downloadSource === 'mirror-first')
    out.downloadSource = obj.downloadSource

  const pick = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
    typeof value === 'string' && (options as readonly string[]).includes(value) ? (value as T) : fallback

  out.versionIsolation = pick(obj.versionIsolation, VERSION_ISOLATION_VALUES, out.versionIsolation)
  out.launcherVisibility = pick(obj.launcherVisibility, LAUNCHER_VISIBILITY_VALUES, out.launcherVisibility)
  out.processPriority = pick(obj.processPriority, PROCESS_PRIORITY_VALUES, out.processPriority)
  out.windowSize = pick(obj.windowSize, WINDOW_SIZE_VALUES, out.windowSize)
  out.quickPlay = pick(obj.quickPlay, QUICK_PLAY_VALUES, out.quickPlay)
  out.presetInherit = pick(obj.presetInherit, PRESET_INHERIT_VALUES, out.presetInherit)
  if (typeof obj.iconPath === 'string') out.iconPath = obj.iconPath
  if (typeof obj.customInfo === 'string') out.customInfo = obj.customInfo
  if (typeof obj.presetName === 'string' && obj.presetName.trim()) out.presetName = obj.presetName
  if (typeof obj.memoryOptimize === 'boolean') out.memoryOptimize = obj.memoryOptimize
  if (typeof obj.jvmArgs === 'string') out.jvmArgs = obj.jvmArgs
  if (typeof obj.gameArgs === 'string') out.gameArgs = obj.gameArgs
  out.gcMode = pick(obj.gcMode, GC_MODE_VALUES, out.gcMode)
  if (typeof obj.disableLaunchWrapper === 'boolean') out.disableLaunchWrapper = obj.disableLaunchWrapper
  if (typeof obj.disableUnsafeAgent === 'boolean') out.disableUnsafeAgent = obj.disableUnsafeAgent
  if (typeof obj.preferHighPerfGpu === 'boolean') out.preferHighPerfGpu = obj.preferHighPerfGpu
  return out
}

/**
 * 把界面层偏好伪装成 Settings 的部分补丁交给 store.saveSettings：
 * store 会把补丁合并进完整设置再整体落盘，多余键随 JSON 一起持久化，
 * 读取侧 readExtras 按类型回落（与旧版界面层字段合并落盘的策略一致）。
 */
export function extrasPatch(extras: SettingsExtras): Partial<Settings> {
  return { ...extras } as unknown as Partial<Settings>
}

/* ============================== 选项表 ============================== */

/** 游戏语言选项 */
export const LANGUAGE_OPTIONS: Array<{ value: GameLanguage; label: string }> = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en-US', label: 'English' },
]

/** 最大并行下载数候选 */
export const PARALLEL_OPTIONS = [4, 8, 16] as const

/** 下载源偏好选项 */
export const DOWNLOAD_SOURCE_OPTIONS: Array<{ value: DownloadSourcePref; label: string }> = [
  { value: 'official-first', label: '优先官方源' },
  { value: 'mirror-first', label: '优先镜像源' },
]

/** 主题模式选项（值与 store.theme 一致） */
export const THEME_OPTIONS: Array<{ value: 'light' | 'dark'; label: string }> = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

/* ============================== Java 管理 ============================== */

/** 探测到的 Java 运行时（内核探测命令接入前列表恒为空，展示空态）。 */
export interface JavaEntry {
  /** 主版本号（如 8 / 17 / 21） */
  major: number
  /** 可执行文件路径 */
  path: string
  /** 版本名（如 JDK 17.0.10 / JRE 1.8.0_411） */
  version?: string
  /** 供应商（如 Oracle / Eclipse Adoptium） */
  vendor?: string
  /** 架构（如 x86-64 / aarch64） */
  arch?: string
}
