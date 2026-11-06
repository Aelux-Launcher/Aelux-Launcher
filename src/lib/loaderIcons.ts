/**
 * 加载器 / 游戏品牌图标：优先使用位图素材，缺素材时返回 null，
 * 由调用方回退到内置矢量图标。
 *
 * 新增素材放到 `src/assets/loaders/`，文件名与下表键名一致即可。
 */
import fabricIcon from '../assets/loaders/fabric.png'
import forgeIcon from '../assets/loaders/forge.png'
import neoforgeIcon from '../assets/loaders/neoforge.png'
import optifineIcon from '../assets/loaders/optifine.png'
import quiltIcon from '../assets/loaders/quilt.png'
import vanillaIcon from '../assets/loaders/vanilla.png'

const ICONS: Record<string, string> = {
  vanilla: vanillaIcon,
  forge: forgeIcon,
  neoforge: neoforgeIcon,
  fabric: fabricIcon,
  quilt: quiltIcon,
  optifine: optifineIcon,
  'fabric-api': fabricIcon,
  qsl: quiltIcon,
}

export function loaderIconUrl(key: string): string | null {
  return ICONS[key] ?? null
}

/** 原版游戏图标（草方块），版本列表 / 详情页共用。 */
export const VANILLA_ICON_URL = vanillaIcon
