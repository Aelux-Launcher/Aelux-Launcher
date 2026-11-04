/** Modrinth API URL 构造（社区资源搜索 / 详情）。 */
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

export function buildResourceSearchUrl(query: string, kind: ResourceKind): string {
  const facets = JSON.stringify([[`project_type:${PROJECT_TYPE[kind]}`]])
  return `${API}/search?query=${encodeURIComponent(query)}&limit=20&index=relevance&facets=${encodeURIComponent(facets)}`
}

export function buildResourceDetailUrl(projectId: string): string {
  return `${API}/project/${projectId}`
}

export function buildResourceVersionsUrl(projectId: string): string {
  return `${API}/project/${projectId}/version`
}
