/**
 * CurseForge 真实接口封装。
 *
 * 请求统一经内核命令 `curseforge_fetch` 转发（API Key 由内核从本机 KV 读取，
 * 不下发到前端）。这里只负责 URL 构造与 DTO → 前端资源模型的映射。
 *
 * 文档：https://docs.curseforge.com/rest-api/
 */
import { call } from './bridge'
import type {
  ResourceDependency,
  ResourceKind,
  ResourceProject,
  ResourceVersion,
} from './types'

const CF_PREFIX = 'cf:'
const GAME_ID = 432

/** 资源分类 → CurseForge classId。 */
const CLASS_ID: Record<ResourceKind, number> = {
  mod: 6,
  modpack: 4546,
  resourcepack: 12,
  shader: 4471,
  datapack: 6945,
  world: 17,
}

/** 加载器 → CurseForge modLoaderType。 */
const LOADER_TYPE: Record<string, number> = {
  forge: 1,
  fabric: 4,
  quilt: 5,
  neoforge: 6,
}

/** classId → 资源分类（依赖条目跳转用）。 */
const KIND_BY_CLASS: Record<number, ResourceKind> = {
  6: 'mod',
  4546: 'modpack',
  12: 'resourcepack',
  4471: 'shader',
  6945: 'datapack',
  17: 'world',
}

const LOADER_TOKENS = ['forge', 'fabric', 'quilt', 'neoforge', 'liteloader', 'rift']

export function isCurseForgeProjectId(id: string): boolean {
  return id.startsWith(CF_PREFIX)
}

export function curseForgeRawId(id: string): string {
  return id.startsWith(CF_PREFIX) ? id.slice(CF_PREFIX.length) : id
}

export function curseForgeKindFromClass(classId: number | undefined): ResourceKind | undefined {
  return classId ? KIND_BY_CLASS[classId] : undefined
}

/** 项目页外链（详情页「在 CurseForge 打开」）。 */
export function curseForgeProjectUrl(kind: ResourceKind, slug: string): string {
  const section: Record<ResourceKind, string> = {
    mod: 'mc-mods',
    modpack: 'modpacks',
    resourcepack: 'texture-packs',
    shader: 'shaders',
    datapack: 'data-packs',
    world: 'worlds',
  }
  return `https://www.curseforge.com/minecraft/${section[kind]}/${encodeURIComponent(slug)}`
}

interface CfCategory {
  id?: number
  name?: string
}

interface CfDependency {
  modId?: number
  relationType?: number
}

interface CfFile {
  id: number
  displayName?: string
  fileName?: string
  releaseType?: number
  fileDate?: string
  downloadCount?: number
  gameVersions?: string[]
  dependencies?: CfDependency[]
  downloadUrl?: string | null
  hashes?: Array<{ algo?: number; value?: string }>
}

interface CfMod {
  id: number
  name?: string
  slug?: string
  summary?: string
  downloadCount?: number
  dateModified?: string
  classId?: number
  categories?: CfCategory[]
  authors?: Array<{ name?: string }>
  logo?: { thumbnailUrl?: string; url?: string }
  latestFiles?: CfFile[]
}

/** 构造搜索路径（分页从 0 开始）。 */
export function buildCurseForgeSearchPath(params: {
  kind: ResourceKind
  name: string
  gameVersion: string
  loader: string
  page: number
  pageSize: number
}): string {
  const query = new URLSearchParams({
    gameId: String(GAME_ID),
    classId: String(CLASS_ID[params.kind]),
    index: String(params.page * params.pageSize),
    pageSize: String(params.pageSize),
    sortField: '2',
    sortOrder: 'desc',
  })
  if (params.name.trim()) query.set('searchFilter', params.name.trim())
  if (params.gameVersion.trim()) query.set('gameVersion', params.gameVersion.trim())
  const loaderType = LOADER_TYPE[params.loader]
  if (loaderType) query.set('modLoaderType', String(loaderType))
  return `/mods/search?${query.toString()}`
}

/** 搜索 CurseForge。 */
export async function searchCurseForge(params: {
  kind: ResourceKind
  name: string
  gameVersion: string
  loader: string
  page: number
  pageSize: number
}): Promise<{ total: number; projects: ResourceProject[] }> {
  const raw = await call<string>('curseforge_fetch', {
    path: buildCurseForgeSearchPath(params),
  })
  const body = JSON.parse(raw) as { data?: CfMod[]; pagination?: { totalCount?: number } }
  const items = body.data ?? []
  return {
    total: body.pagination?.totalCount ?? items.length,
    projects: items.map((mod) => mapProject(mod, params.kind)),
  }
}

/** 单个项目 → 前端模型。 */
function mapProject(mod: CfMod, kind?: ResourceKind): ResourceProject {
  const categories = (mod.categories ?? []).map((c) => c.name ?? '').filter(Boolean)
  const resolvedKind = kind ?? curseForgeKindFromClass(mod.classId) ?? 'mod'
  return {
    projectId: `${CF_PREFIX}${mod.id}`,
    slug: mod.slug ?? String(mod.id),
    title: mod.name ?? `CurseForge #${mod.id}`,
    description: mod.summary ?? '',
    categories,
    displayCategories: categories,
    downloads: mod.downloadCount ?? 0,
    iconUrl: mod.logo?.thumbnailUrl ?? mod.logo?.url ?? '',
    dateModified: mod.dateModified ?? '',
    source: 'curseforge',
    projectType: resolvedKind,
    suffix: resolvedKind === 'mod' || resolvedKind === 'shader' ? '.jar' : '.zip',
    author: mod.authors?.[0]?.name,
  }
}

/** 版本文件 → 前端模型。 */
function mapVersion(file: CfFile): ResourceVersion {
  const all = file.gameVersions ?? []
  const gameVersions = all.filter((v) => !LOADER_TOKENS.includes(v.toLowerCase()))
  const loaders = all
    .filter((v) => LOADER_TOKENS.includes(v.toLowerCase()))
    .map((v) => v.toLowerCase())
  return {
    id: String(file.id),
    name: file.displayName ?? file.fileName ?? `#${file.id}`,
    versionNumber: file.displayName ?? file.fileName ?? String(file.id),
    gameVersions,
    loaders,
    datePublished: file.fileDate ?? '',
    downloads: file.downloadCount ?? 0,
    fileUrl: file.downloadUrl ?? '',
    fileName: file.fileName ?? '',
    primary: true,
    releaseType: file.releaseType === 2 ? 'beta' : file.releaseType === 3 ? 'alpha' : 'release',
    dependencies: (file.dependencies ?? [])
      .filter((d) => d.modId)
      .map<ResourceDependency>((d) => ({
        projectId: `${CF_PREFIX}${d.modId}`,
        versionId: null,
        type:
          d.relationType === 2
            ? 'optional'
            : d.relationType === 5
              ? 'incompatible'
              : d.relationType === 1
                ? 'embedded'
                : 'required',
      })),
  }
}

/**
 * 项目详情：项目信息 + 文件列表 + 必填前置。
 * 描述接口返回 HTML；失败时回退到 summary，不影响主流程。
 */
export async function loadCurseForgeDetail(
  projectId: string,
  kind: ResourceKind,
): Promise<{
  project: ResourceProject
  body: string
  versions: ResourceVersion[]
  dependencies: ResourceProject[]
}> {
  const id = curseForgeRawId(projectId)
  const [rawMod, rawDesc, rawFiles] = await Promise.all([
    call<string>('curseforge_fetch', { path: `/mods/${id}` }),
    call<string>('curseforge_fetch', { path: `/mods/${id}/description` }).catch(() => null),
    call<string>('curseforge_fetch', {
      path: `/mods/${id}/files?pageSize=50&index=0`,
    }).catch(() => null),
  ])

  const mod = (JSON.parse(rawMod) as { data?: CfMod }).data
  if (!mod) throw new Error('CurseForge 未返回项目数据')

  const project = mapProject(mod, kind)
  const files = rawFiles
    ? ((JSON.parse(rawFiles) as { data?: CfFile[] }).data ?? [])
    : (mod.latestFiles ?? [])
  const versions = files.map(mapVersion)

  const description = rawDesc
    ? (JSON.parse(rawDesc) as { data?: string }).data ?? project.description
    : project.description

  // 必填依赖：去重后逐个取项目信息（CurseForge 没有批量 GET）
  const requiredIds: string[] = []
  for (const v of versions) {
    for (const d of v.dependencies ?? []) {
      if (d.type !== 'required' || !d.projectId) continue
      if (d.projectId === projectId) continue
      if (!requiredIds.includes(d.projectId)) requiredIds.push(d.projectId)
    }
  }
  const dependencies = (
    await Promise.all(
      requiredIds.map(async (depId) => {
        try {
          const raw = await call<string>('curseforge_fetch', {
            path: `/mods/${curseForgeRawId(depId)}`,
          })
          const dep = (JSON.parse(raw) as { data?: CfMod }).data
          return dep ? mapProject(dep) : null
        } catch {
          return null
        }
      }),
    )
  ).filter((d): d is ResourceProject => Boolean(d))

  return { project, body: description, versions, dependencies }
}

export const CURSEFORGE_PREFIX = CF_PREFIX
