/** Modrinth API URL 构造与资源分类文案（社区资源搜索 / 详情）。 */
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

/** 全部分类标签（一次拉取，按 project_type 分组后缓存于 store）。 */
export function buildResourceTagsUrl(): string {
  return `${API}/tag/category`
}

export function buildResourceDetailUrl(projectId: string): string {
  return `${API}/project/${projectId}`
}

export function buildResourceVersionsUrl(projectId: string): string {
  return `${API}/project/${projectId}/version`
}

/** 项目详情不含作者名，需要通过团队接口取第一个负责人。 */
export function buildResourceTeamMembersUrl(teamId: string): string {
  return `${API}/team/${teamId}/members`
}

/** Modrinth category slug → 中文标签（未知 slug 原样显示）。 */
const CATEGORY_LABELS: Record<string, string> = {
  adventure: '冒险',
  audio: '音效',
  blocks: '方块',
  bloom: '泛光',
  buildings: '建筑',
  cartoon: '卡通',
  challenging: '硬核',
  combat: '战斗',
  cursed: '诅咒',
  decoration: '装饰',
  economy: '经济',
  equipment: '装备',
  fantasy: '奇幻',
  foliage: '植被',
  fonts: '字体',
  food: '食物',
  'game-mechanics': '游戏机制',
  'kitchen-sink': '整合',
  library: '前置库',
  light: '轻量',
  lighting: '光照',
  magic: '魔法',
  management: '管理',
  medium: '中等',
  minigame: '小游戏',
  models: '模型',
  mobs: '生物',
  multiplayer: '多人',
  optimization: '优化',
  parkour: '跑酷',
  quests: '任务',
  realism: '写实',
  realistic: '真实',
  reflections: '反射',
  'semi-realistic': '半写实',
  shadows: '阴影',
  simplified: '简约',
  social: '社交',
  storage: '存储',
  technology: '科技',
  themed: '主题',
  transportation: '交通',
  trinkets: '饰品',
  tweaks: '微调',
  utility: '实用',
  'vanilla-like': '原版风',
  water: '水体',
  worldgen: '世界生成',
}

export interface CategoryOption {
  slug: string
  label: string
}

/** category slug → 中文标签。 */
export function categoryLabel(slug: string): string {
  return CATEGORY_LABELS[slug] ?? slug
}

/** 下载量 → `1.2 万` / `8,214`。 */
export function formatDownloads(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)} 亿`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)} 万`
  return n.toLocaleString('zh-CN')
}
