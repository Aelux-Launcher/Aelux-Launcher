/**
 * Minecraft 版本号归组（PCL2 的 GetGroupedVersionName / InitializeFilters 简化实现）：
 *   - 快照版：`25w45a` 这类带 w 的版本恒独立归组；
 *   - 远古版：无法解析为标准版本号的旧版本；折叠旧版本时 1.11 及更早归到这里；
 *   - 版本过多时按 drop 归组（1.21.4 → 1.21，26.1.3 → 26.1），否则保留完整版本号。
 */

/** 资源版本列表通常从 9 个不同游戏版本开始折叠（PCL 同名规则）。 */
export const VERSION_GROUP_THRESHOLD = 9

/** 折叠旧版本时保留的最低主版本（1.12 及以上保留，1.11 及更早折为「远古版」）。 */
const OLDEST_KEPT_MINOR = 12

const SNAPSHOT_RE = /^[0-9]+w[0-9]+[a-z]*$/i
const STANDARD_RE = /^(\d+(?:\.\d+)+)(?:-(?:pre|rc|alpha|beta)[0-9]*)?$/i

/** 解析标准版本号：1.21.4 → {major:1, minor:21}，26.1.3 → {major:26, minor:1}。 */
function standardParts(id: string): { major: number; minor: number } | null {
  const match = STANDARD_RE.exec(id.trim())
  if (!match) return null
  const nums = match[1].split('.').map(Number)
  if (nums.some((n) => Number.isNaN(n))) return null
  return { major: nums[0], minor: nums[1] ?? 0 }
}

/** 是否为快照版（含 PCL 的 `snapshot` 文案兜底）。 */
function isSnapshot(id: string): boolean {
  return SNAPSHOT_RE.test(id.trim()) || /snapshot/i.test(id)
}

/** drop 排序值：1.21 → 1021，26.1 → 26001（仅用于比较与连续段判断）。 */
function versionDrop(id: string): number | null {
  const parts = standardParts(id)
  if (!parts) return null
  return parts.major * 1000 + parts.minor
}

/** drop 排序值 → 展示名：1021 → 1.21，26001 → 26.1。 */
function dropName(drop: number): string {
  const major = Math.floor(drop / 1000)
  const minor = drop % 1000
  return major === 1 ? `1.${minor}` : `${major}.${minor}`
}

/** 归一化后的分组名。 */
export function groupVersionName(id: string, grouped: boolean, foldOld: boolean): string {
  const value = id.trim()
  if (!value) return '未知版本'
  if (isSnapshot(value)) return '快照版'
  const parts = standardParts(value)
  if (!parts) return '远古版'
  if (foldOld && parts.major === 1 && parts.minor < OLDEST_KEPT_MINOR) return '远古版'
  if (!grouped) return value
  return parts.major === 1 ? `1.${parts.minor}` : `${parts.major}.${parts.minor}`
}

/** 按原始版本列表顺序去重得到筛选 chip（最新版本优先）。 */
export function uniqueVersionNames(ids: string[], grouped: boolean, foldOld: boolean): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of ids) {
    const name = groupVersionName(id, grouped, foldOld)
    if (seen.has(name)) continue
    seen.add(name)
    out.push(name)
  }
  return out
}

/** 是否折叠为 drop（不同游戏版本数量 ≥ 9）。 */
export function shouldGroupVersions(ids: string[]): boolean {
  return new Set(ids.filter(Boolean)).size >= VERSION_GROUP_THRESHOLD
}

export interface VersionGrouping {
  grouped: boolean
  foldOld: boolean
}

/**
 * PCL 详情页的四种分组模式（依次尝试，取第一个使筛选名数量 < 9 的组合）：
 *   不分组不折叠 → 仅按 drop 分组 → 仅折叠旧版本 → 分组 + 折叠旧版本。
 */
export function resolveVersionGrouping(ids: string[]): VersionGrouping {
  const candidates: VersionGrouping[] = [
    { grouped: false, foldOld: false },
    { grouped: true, foldOld: false },
    { grouped: false, foldOld: true },
    { grouped: true, foldOld: true },
  ]
  for (const candidate of candidates) {
    if (uniqueVersionNames(ids, candidate.grouped, candidate.foldOld).length < VERSION_GROUP_THRESHOLD) {
      return candidate
    }
  }
  return candidates[candidates.length - 1]
}

const SPECIAL_NAMES = new Set(['快照版', '远古版', '未知版本'])

/** 版本号比较（正式版按 drop 数值；快照排在正式版之前）。 */
export function compareMcVersions(a: string, b: string): number {
  const aSnapshot = isSnapshot(a)
  const bSnapshot = isSnapshot(b)
  if (aSnapshot !== bSnapshot) return aSnapshot ? -1 : 1
  const aNums = a.match(/[0-9]+/g)?.map(Number) ?? []
  const bNums = b.match(/[0-9]+/g)?.map(Number) ?? []
  const len = Math.max(aNums.length, bNums.length)
  for (let i = 0; i < len; i++) {
    const diff = (aNums[i] ?? 0) - (bNums[i] ?? 0)
    if (diff !== 0) return diff
  }
  return a.localeCompare(b)
}

/** 筛选 chip 排序：正式版本降序，快照版 / 远古版等特殊项排在末尾。 */
export function sortVersionNamesDesc(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const aSpecial = SPECIAL_NAMES.has(a)
    const bSpecial = SPECIAL_NAMES.has(b)
    if (aSpecial !== bSpecial) return aSpecial ? 1 : -1
    if (aSpecial && bSpecial) return a.localeCompare(b, 'zh-CN')
    return compareMcVersions(b, a)
  })
}

/** 取一组游戏版本里最新的一个。 */
export function latestMcVersion(ids: string[]): string {
  return [...ids].sort(compareMcVersions).at(-1) ?? ''
}

/**
 * PCL 风格的版本范围摘要：
 *   - 连续段贴近全局最新版本 → `1.21+`
 *   - 连续段覆盖远古版本 → `1.12-`
 *   - 中间断档 → `1.14, 1.12` 或 `1.18~1.14`
 *   - 只有快照 / 非标准版本 → `快照版` / `远古版`
 */
export function versionRangeSummary(ids: string[], latestKnownId?: string): string {
  const drops = new Set<number>()
  let hasSnapshot = false
  let hasAncient = false
  for (const id of ids) {
    const parts = standardParts(id)
    if (!parts) {
      if (isSnapshot(id)) hasSnapshot = true
      else hasAncient = true
      continue
    }
    if (parts.major === 1 && parts.minor < OLDEST_KEPT_MINOR) hasAncient = true
    drops.add(parts.major * 1000 + parts.minor)
  }
  const latestKnownDrop = latestKnownId
    ? versionDrop(latestKnownId) ?? Math.max(...drops)
    : Math.max(...drops, 0)
  /** 远古版边界：1.12 及以上保留，低于 1.12 归入远古版。 */
  const ancientDrop = versionDrop('1.12') ?? 1012

  const segments: string[] = []
  const sorted = [...drops].sort((a, b) => b - a)
  let index = 0
  while (index < sorted.length) {
    const start = sorted[index]
    let end = start
    while (index + 1 < sorted.length && sorted[index + 1] === end - 1) {
      index += 1
      end = sorted[index]
    }
    // 与 PCL ResourceProject.ToResourceItem 的分段文案保持一致：
    //   单版本 → 原名；
    //   从最新版向下连续 → 「最低版本+」（覆盖远古版时为「全版本」）；
    //   最低段落在远古版 → 「最高版本-」；
    //   中间连续段 → 「高，低」；存在缺口 → 「高~低」。
    if (end === start) {
      segments.push(dropName(end))
    } else if (start >= latestKnownDrop) {
      segments.push(end < ancientDrop ? '全版本' : `${dropName(end)}+`)
    } else if (end < ancientDrop) {
      segments.push(`${dropName(start)}-`)
    } else {
      segments.push(`${dropName(start)}~${dropName(end)}`)
    }
    index += 1
  }

  if (segments.length === 0) {
    if (hasSnapshot) segments.push('快照版')
    if (hasAncient) segments.push('远古版')
    if (segments.length === 0) return '暂无版本'
    return segments.join(', ')
  }
  // PCL 只在「起始段覆盖最新版」时追加远古版 / 快照版标记。
  const startsAtLatest = sorted[0] >= latestKnownDrop
  if (startsAtLatest) {
    if (hasAncient) segments.push('远古版')
    else if (hasSnapshot) segments.push('快照版')
  }
  return segments.join(', ')
}
