import { platform } from '../store'
import { DEFAULT_INSTANCE_SETTINGS } from 'aelux-launcher-lib'
import type { GameInstance, InstanceSettings } from 'aelux-launcher-lib'

/**
 * 「版本选择」与「版本设置」两页共用的元数据与小工具。
 *
 * 这里只放**展示层**需要的东西：
 *   - 加载器 / 版本类型的中文名；
 *   - 实例副文本（版本 · 加载器 · 登录方式）的拼装；
 *   - 启动器本地的实例外观偏好（图标 / 分类 / 收藏 / 名称 / 描述 等）。
 *
 * 凡是 lib-core 的 `InstanceSettings` 已经覆盖的字段（Java、内存、服务器、
 * 高级选项等），一律走 store 的 `loadInstanceSettings` / `updateInstanceSettings`；
 * 只有 lib-core 尚未建模的外观偏好才落在这里，走 lib 平台适配器的 KV 存储。
 */

/** 加载器 → 中文名（与主页保持一致）。 */
export const LOADER_LABEL: Record<string, string> = {
  vanilla: '原版',
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  quilt: 'Quilt',
}

/** 外观偏好（单个实例）。 */
export interface InstanceUi {
  /** 图标：auto / stone / grass / diamond / furnace / chest */
  icon?: string
  /** 分类：auto / optimize / survival / fun / horror / server */
  category?: string
  /** 是否加入收藏夹 */
  favorite?: boolean
  /** 自定义版本名（为空时用实例原名） */
  alias?: string
  /** 版本描述 */
  description?: string
  /** 认证服务器地址 */
  authServer?: string
  /** 注册链接 */
  registerUrl?: string
  /** 服务器名称 */
  serverName?: string
  /** 是否使用高性能显卡 */
  highPerf?: boolean
}

/** KV 存储键：实例 id → 外观偏好。 */
const UI_KEY = 'aelux.instance.ui'

/** 读取全部实例的外观偏好。 */
export async function loadInstanceUiMap(): Promise<Record<string, InstanceUi>> {
  try {
    const raw = await platform.storage.get(UI_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, InstanceUi> = {}
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value && typeof value === 'object') out[id] = value as InstanceUi
    }
    return out
  } catch {
    return {}
  }
}

/** 写入单个实例的外观偏好（读改写，避免覆盖其它实例）。 */
export async function saveInstanceUi(id: string, patch: InstanceUi): Promise<InstanceUi> {
  const map = await loadInstanceUiMap()
  const next = { ...(map[id] ?? {}), ...patch }
  map[id] = next
  try {
    await platform.storage.set(UI_KEY, JSON.stringify(map))
  } catch {
    /* 存储失败不影响界面 */
  }
  return next
}

/** 版本号 → 版本类型（正式版 / 快照 / 测试版）。 */
export function versionTypeLabel(version: string): string {
  if (/^\d+(\.\d+)*$/.test(version)) return '正式版'
  if (/^\d{2}w\d{2}/.test(version)) return '快照'
  if (/-pre\d|-rc\d/.test(version)) return '测试版'
  return '正式版'
}

/** 登录方式 → 中文说明（实例副文本用）。 */
export function authLabel(serverLogin: string): string {
  switch (serverLogin) {
    case 'official':
      return '正版验证'
    case 'authlib':
      return 'Authlib 验证'
    case 'offline':
      return '离线模式'
    case 'nide':
      return 'Nide 验证'
    case 'both':
    default:
      return '正版 + 第三方验证'
  }
}

/**
 * 实例副文本：`正式版 1.21, Fabric 0.16.9, Authlib 验证`。
 *
 * 加载器版本号未在实例元数据里单独保存，这里从实例名中尽力提取
 * （例如「[Fabric]0.16.9 方块酒馆」），取不到时只给出加载器名称；
 * 登录方式来自该实例的设置（未加载时按默认的「正版 + 第三方验证」显示）。
 */
export function summarizeInstance(
  inst: Pick<GameInstance, 'name' | 'version' | 'loader'>,
  serverLogin?: string,
): string {
  const parts = versionSummary(inst)
  parts.push(authLabel(serverLogin ?? 'both'))
  return parts.join(', ')
}

/**
 * 版本摘要：`正式版 1.21, Fabric 0.16.9`（不含登录方式）。
 */
export function versionSummary(
  inst: Pick<GameInstance, 'name' | 'version' | 'loader'>,
): string[] {
  const parts = [`${versionTypeLabel(inst.version)} ${inst.version}`]
  if (inst.loader && inst.loader !== 'vanilla') {
    const label = LOADER_LABEL[inst.loader] ?? inst.loader
    const loaderVersion = extractLoaderVersion(inst.name, inst.loader)
    parts.push(loaderVersion ? `${label} ${loaderVersion}` : label)
  }
  return parts
}

/**
 * 从实例名里提取加载器版本号。
 *
 * 命名习惯形如「[Fabric]0.16.9 方块酒馆」或「Fabric 0.16.9」，
 * 因此按「加载器名（可选）+ 版本号」的顺序匹配一次。
 */
function extractLoaderVersion(name: string, loader: string): string {
  const label = LOADER_LABEL[loader] ?? loader
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`${escaped}[^\\d]{0,3}(\\d+\\.\\d+(?:\\.\\d+)?)`, 'i').exec(name)
  return m ? m[1] : ''
}

/** 实例根目录（`<数据目录>/.aelux/instances/<id>`）。 */
export async function resolveInstanceDir(instanceId: string): Promise<string> {
  const dataDir = await platform.invoke<string>('get_data_dir')
  return `${dataDir}/.aelux/instances/${instanceId}`
}

/** 在系统文件管理器里打开目录（失败时抛出，由调用方提示）。 */
export async function openFolderInExplorer(path: string): Promise<void> {
  await platform.invoke('open_folder_in_explorer', { path })
}

/** 外观偏好的缺省值。 */
export const DEFAULT_INSTANCE_UI: InstanceUi = {
  icon: 'auto',
  category: 'auto',
  favorite: false,
  alias: '',
  description: '',
  authServer: '',
  registerUrl: '',
  serverName: '',
  highPerf: true,
}

/** 兜底：实例设置为空时使用 lib-core 的默认值（避免控件拿到 undefined）。 */
export function fallbackInstanceSettings(settings?: InstanceSettings): InstanceSettings {
  return settings ?? { ...DEFAULT_INSTANCE_SETTINGS }
}
