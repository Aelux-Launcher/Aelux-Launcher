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
}

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
}
