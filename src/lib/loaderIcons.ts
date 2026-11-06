/**
 * 加载器品牌图标：优先使用随项目打包的位图素材（来源 PCL 素材库），
 * 缺素材时返回 null，由调用方回退到内置矢量图标。
 */
import fabricIcon from '../assets/loaders/fabric.png'
import forgeIcon from '../assets/loaders/forge.png'
import neoforgeIcon from '../assets/loaders/neoforge.png'

const ICONS: Record<string, string> = {
  forge: forgeIcon,
  neoforge: neoforgeIcon,
  fabric: fabricIcon,
  'fabric-api': fabricIcon,
}

export function loaderIconUrl(key: string): string | null {
  return ICONS[key] ?? null
}
