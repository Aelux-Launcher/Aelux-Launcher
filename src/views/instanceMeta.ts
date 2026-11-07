/**
 * 「版本设置」页共用的元数据与小工具（原 aelux-launcher-lib 的相关形状在此重建）。
 *
 * 这里只放**展示层**需要的东西：
 *   - 实例设置（InstanceSettings）的类型与默认值 —— 经 store 的
 *     loadInstanceSettings / updateInstanceSettings 持久化；
 *   - 实例外观偏好（InstanceUi）—— 走 bridge 的本地 KV；
 *   - 加载器中文名 / 实例副文本拼装 / 导出计划等纯逻辑。
 */
import { call, kvGet } from '../lib/bridge'
import type { GameInstance } from '../lib/types'

/* ------------------------------ 实例设置 ------------------------------ */

/** 实例级启动设置（持久化在 store 的 instanceSettings[instanceId]）。 */
export interface InstanceSettings {
  /** 版本隔离：on / off */
  indie: 'on' | 'off'
  /** 游戏窗口标题（空 = 跟随全局设置） */
  title: string
  /** 自定义信息（空 = 跟随全局设置） */
  info: string
  /** Java 选择方式：auto / autoRange / custom / folder（folder 在界面上视同 custom） */
  javaMode: 'auto' | 'autoRange' | 'custom' | 'folder'
  /** 自定义 Java 可执行文件路径 */
  javaPath: string
  /** 内存分配方式：跟随全局 / 自动 / 自定义 */
  ramType: 'follow' | 'auto' | 'custom'
  /** 自定义内存（MB） */
  ramCustomMb: number
  /** 启动游戏前进行内存优化：跟随全局 / 开启 / 关闭 */
  ramOptimize: 'follow' | 'on' | 'off'
  /** 登录方式（follow = 跟随全局设置） */
  serverLogin: 'follow' | 'official' | 'authlib' | 'offline' | 'both' | 'nide'
  /** 自动进入的服务器地址（如 127.0.0.1:25565） */
  serverAutoEnter: string
  /** Java 虚拟机参数（空 = 跟随全局设置） */
  advanceJvm: string
  /** 游戏参数（空 = 跟随全局设置） */
  advanceGame: string
  /** 启动前执行命令（空 = 跟随全局设置） */
  advanceRun: string
  /** 内存管理（GC 策略） */
  advanceGc: 'follow' | 'g1' | 'zgc' | 'generationalZgc' | 'tunedG1' | 'custom'
  /** 禁用 Java Launch Wrapper */
  disableJlw: boolean
  /** 禁用 LWJGL Unsafe Agent */
  disableAssetsVerify: boolean
  /** 禁用 Mod 自动更新 */
  disableModUpdate: boolean
}

/** 实例设置默认值。 */
export const DEFAULT_INSTANCE_SETTINGS: InstanceSettings = {
  indie: 'on',
  title: '',
  info: '',
  javaMode: 'auto',
  javaPath: '',
  ramType: 'follow',
  ramCustomMb: 2048,
  ramOptimize: 'follow',
  serverLogin: 'follow',
  serverAutoEnter: '',
  advanceJvm: '',
  advanceGame: '',
  advanceRun: '',
  advanceGc: 'follow',
  disableJlw: false,
  disableAssetsVerify: false,
  disableModUpdate: false,
}

/** 兜底：实例设置为空 / 缺字段时补默认值（避免控件拿到 undefined）。 */
export function fallbackInstanceSettings(settings?: Partial<InstanceSettings>): InstanceSettings {
  return { ...DEFAULT_INSTANCE_SETTINGS, ...(settings ?? {}) }
}

/* ------------------------------ 外观偏好 ------------------------------ */

/** 外观偏好（单个实例，走本地 KV）。 */
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
  /** 「修改」页提交的加载器版本（下载完成后生效） */
  loaderVersion?: string
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

/** KV 存储键：实例 id → 外观偏好。 */
const UI_KEY = 'aelux.instance.ui'

/** 读取全部实例的外观偏好。 */
export async function loadInstanceUiMap(): Promise<Record<string, InstanceUi>> {
  try {
    const raw = await kvGet(UI_KEY)
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
    await call('kv_set', { key: UI_KEY, value: JSON.stringify(map) })
  } catch {
    /* 存储失败不影响界面 */
  }
  return next
}

/* ------------------------------ 文案与副文本 ------------------------------ */

/** 加载器 → 中文名（与主页保持一致）。 */
export const LOADER_LABEL: Record<string, string> = {
  vanilla: '原版',
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  quilt: 'Quilt',
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
    case 'follow':
      return '跟随全局登录'
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

/** 版本摘要：`正式版 1.21, Fabric 0.16.9`（不含登录方式）。 */
export function versionSummary(inst: Pick<GameInstance, 'name' | 'version' | 'loader'>): string[] {
  const parts = [`${versionTypeLabel(inst.version)} ${inst.version}`]
  if (inst.loader && inst.loader !== 'vanilla') {
    const label = LOADER_LABEL[inst.loader] ?? inst.loader
    const loaderVersion = extractLoaderVersion(inst.name, inst.loader)
    parts.push(loaderVersion ? `${label} ${loaderVersion}` : label)
  }
  return parts
}

/**
 * 实例副文本：`正式版 1.21, Fabric 0.16.9, Authlib 验证`。
 *
 * 加载器版本号未在实例元数据里单独保存，这里从实例名中尽力提取；
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

/* ------------------------------ 目录与文件 ------------------------------ */

/** 实例根目录（由内核返回，前端不自行拼接）。 */
export async function resolveInstanceDir(instanceId: string): Promise<string> {
  return call<string>('get_instance_dir', { id: instanceId })
}

/** 在系统文件管理器里打开目录（失败时抛出，由调用方提示）。 */
export async function openFolderInExplorer(path: string): Promise<void> {
  await call('open_folder_in_explorer', { path })
}

/* ------------------------------ Java 运行时 ------------------------------ */

/** 本机可用的 Java 运行时（内核扫描结果）。 */
export interface JavaRuntime {
  /** 可执行文件 / 安装目录路径 */
  path: string
  /** 大版本号（8 / 11 / 17 / 21…） */
  major: number
  /** 完整版本字符串 */
  version: string
  /** 发行方（Oracle / Eclipse Adoptium / Microsoft…），内核提供 */
  vendor?: string
  /** 架构（x64 / x86 / aarch64） */
  arch?: string
}

/** 按 MC 版本推断所需的 Java 大版本（1.20.5+ → 21，1.18+ → 17，1.17 → 16，更早 → 8）。 */
export function requiredJavaMajor(version: string): number {
  const m = /^1\.(\d+)(?:\.(\d+))?/.exec(version)
  if (m) {
    const minor = Number(m[1])
    const patch = Number(m[2] ?? 0)
    if (minor >= 21 || (minor === 20 && patch >= 5)) return 21
    if (minor >= 18) return 17
    if (minor === 17) return 16
    return 8
  }
  // 快照（如 25w14a）按最新约束处理
  return 21
}

/** Java 运行时扫描与解析。 */
export class JavaManager {
  /** 扫描结果缓存（整个会话复用，避免每次进入页面都重新起进程探测）。 */
  private cache: JavaRuntime[] | null = null

  /** 读取可用 Java 列表；已扫描过时直接返回缓存。 */
  async allAvailable(): Promise<JavaRuntime[]> {
    if (this.cache) return this.cache
    return this.refresh()
  }

  /** 强制重新扫描（用户点「刷新」或在线安装 Java 之后调用）。 */
  async refresh(): Promise<JavaRuntime[]> {
    try {
      const list = await call<JavaRuntime[] | null>('scan_java')
      this.cache = Array.isArray(list) ? list : []
    } catch {
      this.cache = []
    }
    return this.cache
  }

  /** 解析某个 MC 版本应使用的 JRE：优先大版本精确匹配，其次任一更高版本。 */
  async resolveFor(version: string): Promise<{ jre: JavaRuntime | null }> {
    const list = await this.allAvailable()
    if (list.length === 0) return { jre: null }
    let need: number
    try {
      need = await call<number>('required_java', { mcVersion: version })
    } catch {
      need = requiredJavaMajor(version)
    }
    const exact = list.filter((j) => j.major === need)
    const newer = list.filter((j) => j.major > need).sort((a, b) => a.major - b.major)
    return { jre: exact[0] ?? newer[0] ?? null }
  }
}

/**
 * 全应用共享的 Java 管理器。
 *
 * 与 HMCL 的策略一致：启动器只扫描一次本机 Java，之后所有页面（设置 / 版本设置 /
 * 在线安装）复用同一份结果；只有用户主动点「重新获取」或安装新 Java 时才重扫。
 */
export const javaManager = new JavaManager()

/* ------------------------------ 本地内容 ------------------------------ */

/** 本地已安装的一件内容（Mod / 资源包 / 光影 / 存档 / 原理图）。 */
export interface LocalContent {
  /** 稳定标识（文件名） */
  id: string
  /** 展示名（元数据优先） */
  name: string
  /** 磁盘文件名（不含 `.disabled`） */
  fileName: string
  /** 相对实例目录的路径 */
  path: string
  description?: string
  version?: string
  loader?: string
  enabled: boolean
  sizeBytes: number
  modifiedSecs: number
}

/** 兼容旧命名的 Mod 清单类型。 */
export type LocalMod = LocalContent

/** 读取实例内某类本地内容（内核 `list_content`）。 */
export async function listLocalContent(instanceId: string, kind: string): Promise<LocalContent[]> {
  const items = await call<Omit<LocalContent, 'id'>[]>('list_content', { instanceId, kind })
  if (!Array.isArray(items)) return []
  return items.map((item) => ({ ...item, id: item.path || item.fileName }))
}

/** 本地 Mod 清单仓库。 */
export const localModsRepo = {
  list(instanceId: string): Promise<LocalMod[]> {
    return listLocalContent(instanceId, 'mods')
  },
}

/** 文件大小：10 / 1k / 1.3M / 1B（与下载页统一的简洁单位）。 */
export function formatContentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0'
  const units = ['k', 'M', 'B', 'T']
  let value = bytes
  let unit = -1
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit += 1
  }
  if (unit < 0) return String(Math.round(value))
  const text = value >= 10 ? Math.round(value).toString() : value.toFixed(1).replace(/\.0$/, '')
  return `${text}${units[unit]}`
}

/** 相对时间：刚刚 / X 分钟前 / X 小时前 / X 天前 / X 个月前 / X 年前。 */
export function formatModifiedAgo(secs: number, nowSecs = Date.now() / 1000): string {
  if (!Number.isFinite(secs) || secs <= 0) return '—'
  const diff = Math.max(0, nowSecs - secs)
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`
  if (diff < 86400 * 365) return `${Math.floor(diff / (86400 * 30))} 个月前`
  return `${Math.floor(diff / (86400 * 365))} 年前`
}

/** 读取实例内某类内容并在失败时返回空列表（界面据此展示空状态）。 */
export async function loadLocalContent(instanceId: string, kind: string): Promise<LocalContent[]> {
  try {
    return await listLocalContent(instanceId, kind)
  } catch {
    return []
  }
}

/** 启用 / 禁用本地内容。 */
export async function setContentEnabled(
  instanceId: string,
  kind: string,
  fileName: string,
  enabled: boolean,
): Promise<void> {
  await call('set_content_enabled', { instanceId, kind, fileName, enabled })
}

/** 删除本地内容（文件 / 存档目录）。 */
export async function deleteLocalContent(instanceId: string, kind: string, fileName: string): Promise<void> {
  await call('delete_content', { instanceId, kind, fileName })
}

/** 从外部文件导入内容。 */
export async function importLocalContent(
  instanceId: string,
  kind: string,
  source: string,
): Promise<LocalContent> {
  return call<LocalContent>('import_content', { instanceId, kind, source })
}

/* ------------------------------ 导出计划 ------------------------------ */

/** 导出内容树的节点。 */
export interface ExportOption {
  id: string
  label: string
  description: string
  checked: boolean
  /** 锁定项（如游戏本体）不可取消勾选 */
  locked?: boolean
  children?: ExportOption[]
}

/** 勾选节点 id → 打包时的文件规则（glob）。 */
const EXPORT_PATH_RULES: Record<string, string> = {
  'game-json': 'versions/*.json',
  'game-jar': 'versions/*.jar',
  libraries: 'libraries/**',
  assets: 'assets/**',
  mods: 'mods/**',
  config: 'config/**',
  options: 'options.txt',
  saves: 'saves/**',
  resourcepacks: 'resourcepacks/**',
}

/** 导出内容树默认值（游戏本体锁定必选）。 */
export const EXPORT_TREE: ExportOption[] = [
  {
    id: 'game',
    label: '游戏本体',
    description: '版本 JSON 与客户端 jar',
    checked: true,
    locked: true,
    children: [
      { id: 'game-json', label: '版本配置', description: 'versions/<id>/<id>.json', checked: true, locked: true },
      { id: 'game-jar', label: '客户端 jar', description: 'versions/<id>/<id>.jar', checked: true, locked: true },
    ],
  },
  {
    id: 'libraries',
    label: '依赖库',
    description: 'libraries 下的运行依赖',
    checked: true,
    children: [{ id: 'libraries-loader', label: '加载器依赖', description: 'Fabric / Forge 等加载器注入的库', checked: true }],
  },
  { id: 'assets', label: '资源文件', description: 'assets 下的索引与对象（体积较大）', checked: false },
  { id: 'mods', label: 'Mod 文件', description: 'mods 目录下的全部 jar', checked: true },
  { id: 'config', label: '配置文件', description: 'config 目录', checked: true },
  { id: 'options', label: '游戏选项', description: 'options.txt 等本地设置', checked: false },
  { id: 'saves', label: '存档', description: 'saves 目录下的世界存档', checked: false },
  { id: 'resourcepacks', label: '资源包与光影包', description: 'resourcepacks / shaderpacks 目录', checked: true },
]

/** 导出计划的基础信息。 */
export interface ExportPlanMeta {
  name: string
  version: string
  format: 'mcpack' | 'mrpack'
  includeResources: boolean
  modrinthOnly: boolean
}

/** 导出计划 = 基础信息 + 调整后的内容树。 */
export interface ExportPlan extends ExportPlanMeta {
  options: ExportOption[]
}

/** 递归勾选 / 取消勾选某个节点（锁定项保持原状）。 */
export function toggleTree(nodes: ExportOption[], id: string, checked: boolean): ExportOption[] {
  return nodes.map((node) => {
    if (node.id === id) {
      return node.locked ? node : { ...node, checked, children: node.children ? forceChildren(node.children, checked) : undefined }
    }
    return node.children ? { ...node, children: toggleTree(node.children, id, checked) } : node
  })
}

/** 父节点取消勾选时，子孙全部联动。 */
function forceChildren(nodes: ExportOption[], checked: boolean): ExportOption[] {
  return nodes.map((node) => ({
    ...node,
    checked: node.locked ? node.checked : checked,
    children: node.children ? forceChildren(node.children, checked) : undefined,
  }))
}

/** 收集勾选项对应的文件规则（未在规则表里的节点跳过）。 */
export function collectCheckedPaths(nodes: ExportOption[]): string[] {
  const out: string[] = []
  for (const node of nodes) {
    if (node.checked && EXPORT_PATH_RULES[node.id]) out.push(EXPORT_PATH_RULES[node.id])
    if (node.children) out.push(...collectCheckedPaths(node.children))
  }
  return out
}

/** 生成导出计划：校验基础信息，并按高级选项调整内容树。 */
export function createExportPlan(meta: ExportPlanMeta, options: ExportOption[]): ExportPlan {
  const name = meta.name.trim()
  if (!name) throw new Error('整合包名称不能为空')
  let tree = options
  // 不包含资源包 / 光影包时取消对应勾选（锁定项不受影响）。
  if (!meta.includeResources) tree = toggleTree(tree, 'resourcepacks', false)
  // 仅打包社区源上有的文件时，剔除体积大且无法从社区源获取的资源对象。
  if (meta.modrinthOnly) tree = toggleTree(tree, 'assets', false)
  return { ...meta, name, version: meta.version.trim() || '1.0.0', options: tree }
}
