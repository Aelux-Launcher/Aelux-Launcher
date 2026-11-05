/**
 * Minecraft 版本号归组（PCL2 的 GetGroupedVersionName 简化实现）：
 *   - 快照版：`25w45a` 这类带 w 的版本恒独立归组；
 *   - 远古版：无法解析为 1.x 的旧版本；折叠旧版本时 1.20 之前也归到这里；
 *   - 版本过多时按 drop 归组（1.21.4 → 1.21），否则保留完整版本号。
 */

/** 资源版本列表通常从 9 个不同游戏版本开始折叠为 drop（PCL 同名规则）。 */
export const VERSION_GROUP_THRESHOLD = 9

const SNAPSHOT_RE = /^[0-9]+w[0-9]+[a-z]*$/i

/** 归一化后的分组名。 */
export function groupVersionName(id: string, grouped: boolean, foldOld: boolean): string {
  const value = id.trim()
  if (!value) return '未知版本'
  if (SNAPSHOT_RE.test(value) || /snapshot/i.test(value)) return '快照版'
  const match = /^1\.([0-9]+)/.exec(value)
  if (!match) return '远古版'
  const minor = Number(match[1])
  if (foldOld && minor < 20) return '远古版'
  return grouped ? `1.${minor}` : value
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

/** 版本号比较（用于取「最新支持版本」；快照排在正式版之后）。 */
export function compareMcVersions(a: string, b: string): number {
  const aSnapshot = SNAPSHOT_RE.test(a) || /snapshot/i.test(a)
  const bSnapshot = SNAPSHOT_RE.test(b) || /snapshot/i.test(b)
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

/** 取一组游戏版本里最新的一个。 */
export function latestMcVersion(ids: string[]): string {
  return [...ids].sort(compareMcVersions).at(-1) ?? ''
}
