/**
 * PCL 内置皮肤素材：离线账户按用户名确定性选一张，
 * 正版 / 第三方账户在线头像不可用时也回退到这里。
 */
import alex from '../assets/skins/Alex.png'
import ari from '../assets/skins/Ari.png'
import efe from '../assets/skins/Efe.png'
import kai from '../assets/skins/Kai.png'
import makena from '../assets/skins/Makena.png'
import noor from '../assets/skins/Noor.png'
import steve from '../assets/skins/Steve.png'
import sunny from '../assets/skins/Sunny.png'
import zuri from '../assets/skins/Zuri.png'

/** 固定顺序保证同一用户名永远落到同一张皮肤。 */
const SKINS = [alex, ari, efe, kai, makena, noor, sunny, zuri, steve]

/** 按用户名取本地皮肤（64×64 全身图，头像区由 AccountAvatar 裁切）。 */
export function localSkinUrl(username: string): string {
  const name = username.trim()
  if (!name) return steve
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return SKINS[hash % SKINS.length]
}
