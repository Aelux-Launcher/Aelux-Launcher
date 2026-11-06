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
