/**
 * 版本分类图标：把对应图标放进 `src/assets/versions/` 即可自动生效。
 *   release.png   正式版
 *   snapshot.png  快照版
 *   legacy.png    远古版
 *   april.png     愚人节版
 * 未放图标时返回 null，由调用方回退到草方块图标。
 */
import { VANILLA_ICON_URL } from './loaderIcons'

const modules = import.meta.glob('../assets/versions/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const ICONS: Record<string, string> = {}
for (const path in modules) {
  const name = path.split('/').pop()
  if (name) ICONS[name.replace(/\.png$/, '')] = modules[path]
}

/** 分类 key → 图标地址（未放图标返回 null）。 */
export function versionIcon(key: string): string | null {
  return ICONS[key] ?? null
}

/** 列表行图标：优先分类图标，缺素材回退草方块。 */
export function versionRowIcon(key: string): string {
  return versionIcon(key) ?? VANILLA_ICON_URL
}

/**
 * 愚人节版本 id（小写比对）。
 * Mojang 清单把它们混在 release / snapshot 里，需要先于 kind 判断。
 */
export const APRIL_FOOLS = new Set([
  '2.0',
  '2.0-red',
  '2.0-blue',
  '1.rv-pre1',
  '15w14a',
  '3d shareware v1.34',
  '20w14infinite',
  '24w14potato',
  '25w14craftmine',
])

/** 版本号本身就是快照格式（如 `25w45a`），清单 kind 缺失时也能正确归类。 */
const SNAPSHOT_ID = /^[0-9]+w[0-9]+[a-z]*$/i

/** 版本 id + 清单 kind → 分类图标 key（release / snapshot / legacy / april）。 */
export function versionIconKey(id: string, kind?: string): string {
  const lower = id.trim().toLowerCase()
  if (APRIL_FOOLS.has(lower)) return 'april'
  if (kind === 'old_beta' || kind === 'old_alpha') return 'legacy'
  if (kind === 'snapshot' || SNAPSHOT_ID.test(lower)) return 'snapshot'
  return 'release'
}
