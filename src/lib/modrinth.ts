/** Modrinth API URL 构造、PCL 分类选项与资源展示格式化（社区资源搜索 / 详情）。 */
import type { ResourceKind } from './types'

const API = 'https://api.modrinth.com/v2'

/** ResourceKind → Modrinth project_type facet 值。 */
const PROJECT_TYPE: Record<ResourceKind, string> = {
  mod: 'mod',
  modpack: 'modpack',
  resourcepack: 'resourcepack',
  shader: 'shader',
  datapack: 'datapack',
  world: 'world',
}

/** 每页结果数（Modrinth 最大 100，这里沿用 PCL 的 40 条/页）。 */
export const RESOURCE_PAGE_SIZE = 40

export interface ResourceSearchOptions {
  kind: ResourceKind
  /** 关键词（空串表示不按名称筛选，返回该分类热门项目） */
  name?: string
  /** 游戏版本（空串 = 全部） */
  gameVersion?: string
  /** 加载器（空串 = 任意） */
  loader?: string
  /** 分类标签 slug（空串 = 全部） */
  category?: string
  /** 从 0 开始的页码 */
  page?: number
  pageSize?: number
}

/**
 * 搜索 URL。筛选条件全部落在 facets 上（PCL 的「版本 / 加载器 / 类型」行）：
 *   versions:<mc> / loaders:<loader> / categories:<slug>
 */
export function buildResourceSearchUrl(options: ResourceSearchOptions): string {
  const pageSize = options.pageSize ?? RESOURCE_PAGE_SIZE
  const facets: string[][] = [[`project_type:${PROJECT_TYPE[options.kind]}`]]
  if (options.gameVersion?.trim()) facets.push([`versions:${options.gameVersion.trim()}`])
  if (options.loader?.trim()) facets.push([`loaders:${options.loader.trim()}`])
  if (options.category?.trim()) facets.push([`categories:${options.category.trim()}`])

  const params = new URLSearchParams({
    query: options.name?.trim() ?? '',
    limit: String(pageSize),
    offset: String((options.page ?? 0) * pageSize),
    index: 'relevance',
    facets: JSON.stringify(facets),
  })
  return `${API}/search?${params.toString()}`
}

export function buildResourceDetailUrl(projectId: string): string {
  return `${API}/project/${projectId}`
}

export function buildResourceVersionsUrl(projectId: string): string {
  return `${API}/project/${projectId}/version`
}

/** 批量项目详情（详情页解析前置资源用）。 */
export function buildResourceProjectsUrl(ids: string[]): string {
  return `${API}/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`
}

/** 项目详情不含作者名，需要通过团队接口取第一个负责人。 */
export function buildResourceTeamMembersUrl(teamId: string): string {
  return `${API}/team/${teamId}/members`
}

/** Modrinth category slug → 中文标签（未知 slug 原样显示）。 */
const CATEGORY_LABELS: Record<string, string> = {
  adventure: '冒险',
  audio: '含声音',
  blocks: '方块',
  bloom: '泛光',
  buildings: '建筑',
  cartoon: '卡通风',
  challenging: '硬核',
  combat: '战斗',
  'colored-lighting': '彩色光照',
  'core-shaders': '核心着色器',
  cursed: '鬼畜',
  decoration: '装饰',
  economy: '经济',
  entities: '含实体',
  equipment: '装备与工具',
  fantasy: '幻想风',
  foliage: '植被',
  fonts: '含字体',
  food: '食物与烹饪',
  'game-mechanics': '游戏机制',
  gui: '含 UI',
  iris: 'Iris',
  'kitchen-sink': '水槽包',
  library: '支持库',
  light: '轻量',
  lightweight: '轻量整合',
  lighting: '光照',
  locale: '含语言',
  magic: '魔法',
  management: '管理',
  medium: '中等',
  minigame: '小游戏',
  models: '含模型',
  modded: '兼容 Mod',
  mobs: '生物',
  multiplayer: '多人',
  optifine: 'OptiFine',
  optimization: '性能优化',
  'path-tracing': '路径追踪',
  parkour: '跑酷',
  pbr: 'PBR',
  quests: '任务',
  realism: '写实',
  realistic: '写实风',
  reflections: '反射',
  'semi-realistic': '半写实风',
  shadows: '阴影',
  simplistic: '简洁',
  social: '服务器',
  storage: '仓储',
  technology: '科技',
  themed: '主题化',
  transportation: '运输',
  trinkets: '饰品',
  tweaks: '改良',
  utility: '实用',
  vanilla: '原版',
  'vanilla-like': '原版风',
  water: '水体',
  worldgen: '世界元素',
}

export interface CategoryOption {
  slug: string
  label: string
  /** 光影页把加载器放在「类型」里（PCL 行为），这些项走 loaders facet。 */
  facet?: 'category' | 'loader'
}

/** PCL 各下载页的「类型」下拉（中文文案 + Modrinth slug）。 */
export const RESOURCE_CATEGORIES: Record<ResourceKind, CategoryOption[]> = {
  mod: [
    { slug: 'worldgen', label: '世界元素' },
    { slug: 'technology', label: '科技' },
    { slug: 'food', label: '食物与烹饪' },
    { slug: 'game-mechanics', label: '游戏机制' },
    { slug: 'transportation', label: '运输' },
    { slug: 'storage', label: '仓储' },
    { slug: 'magic', label: '魔法' },
    { slug: 'adventure', label: '冒险' },
    { slug: 'decoration', label: '装饰' },
    { slug: 'mobs', label: '生物' },
    { slug: 'utility', label: '实用' },
    { slug: 'equipment', label: '装备与工具' },
    { slug: 'optimization', label: '性能优化' },
    { slug: 'social', label: '服务器' },
    { slug: 'library', label: '支持库' },
  ],
  modpack: [
    { slug: 'multiplayer', label: '多人' },
    { slug: 'optimization', label: '性能优化' },
    { slug: 'challenging', label: '硬核' },
    { slug: 'combat', label: '战斗' },
    { slug: 'quests', label: '任务' },
    { slug: 'technology', label: '科技' },
    { slug: 'magic', label: '魔法' },
    { slug: 'adventure', label: '冒险' },
    { slug: 'kitchen-sink', label: '水槽包' },
    { slug: 'lightweight', label: '轻量整合' },
  ],
  datapack: [
    { slug: 'worldgen', label: '世界元素' },
    { slug: 'technology', label: '科技' },
    { slug: 'game-mechanics', label: '游戏机制' },
    { slug: 'transportation', label: '运输' },
    { slug: 'storage', label: '仓储' },
    { slug: 'magic', label: '魔法' },
    { slug: 'adventure', label: '冒险' },
    { slug: 'decoration', label: '装饰' },
    { slug: 'mobs', label: '生物' },
    { slug: 'utility', label: '实用' },
    { slug: 'equipment', label: '装备与工具' },
    { slug: 'optimization', label: '性能优化' },
    { slug: 'social', label: '服务器' },
    { slug: 'library', label: '支持库' },
  ],
  resourcepack: [
    { slug: 'vanilla-like', label: '原版风' },
    { slug: 'realistic', label: '写实风' },
    { slug: 'themed', label: '主题化' },
    { slug: 'simplistic', label: '简洁' },
    { slug: 'decoration', label: '装饰' },
    { slug: 'combat', label: '战斗' },
    { slug: 'utility', label: '实用' },
    { slug: 'tweaks', label: '改良' },
    { slug: 'cursed', label: '鬼畜' },
    { slug: 'entities', label: '含实体' },
    { slug: 'audio', label: '含声音' },
    { slug: 'fonts', label: '含字体' },
    { slug: 'models', label: '含模型' },
    { slug: 'locale', label: '含语言' },
    { slug: 'gui', label: '含 UI' },
    { slug: 'core-shaders', label: '核心着色器' },
    { slug: 'modded', label: '兼容 Mod' },
    { slug: '8x-', label: '8x 或更低' },
    { slug: '16x', label: '16x' },
    { slug: '32x', label: '32x' },
    { slug: '48x', label: '48x' },
    { slug: '64x', label: '64x' },
    { slug: '128x', label: '128x' },
    { slug: '256x', label: '256x' },
    { slug: '512x+', label: '512x 或更高' },
  ],
  shader: [
    { slug: 'vanilla-like', label: '原版风' },
    { slug: 'fantasy', label: '幻想风' },
    { slug: 'realistic', label: '写实风' },
    { slug: 'semi-realistic', label: '半写实风' },
    { slug: 'cartoon', label: '卡通风' },
    { slug: 'colored-lighting', label: '彩色光照' },
    { slug: 'path-tracing', label: '路径追踪' },
    { slug: 'pbr', label: 'PBR' },
    { slug: 'reflections', label: '反射' },
    { slug: 'vanilla', label: '原版可用', facet: 'loader' },
    { slug: 'iris', label: 'Iris', facet: 'loader' },
    { slug: 'optifine', label: 'OptiFine', facet: 'loader' },
  ],
  world: [],
}

/** category slug → 中文标签。 */
export function categoryLabel(slug: string): string {
  return CATEGORY_LABELS[slug] ?? slug
}

/** Modrinth project_type → 前端资源分类（依赖条目跳转用）。 */
export function resourceKindForProjectType(type: string, categories: string[] = []): ResourceKind {
  if (categories.includes('datapack')) return 'datapack'
  if (type === 'modpack') return 'modpack'
  if (type === 'resourcepack') return 'resourcepack'
  if (type === 'shader') return 'shader'
  return 'mod'
}

/** 下载量 → `1.2 万` / `8,214`。 */
export function formatDownloads(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)} 亿`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)} 万`
  return n.toLocaleString('zh-CN')
}

/** ISO 时间 → PCL 风格的相对时间（刚刚 / N 分钟前 / N 天前 / N 个月前 …）。 */
export function formatRelativeTime(iso: string): string {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return '未知'
  const diff = Date.now() - time
  if (diff < 60_000) return '刚刚'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} 个月前`
  return `${Math.floor(months / 12)} 年前`
}
