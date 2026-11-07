/**
 * 内置皮肤素材：离线账户按用户名确定性选一张，
 * 正版 / 第三方账户在线头像不可用时也回退到这里。
 *
 * 在线皮肤：Mojang 会话档案 / 认证服务器档案的 textures 属性里带贴图地址，
 * 由内核 `fetch_json` 抓取（webview 直连会被跨域拦截）。
 */
import { call } from './bridge'
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

/** Mojang 会话档案（按 UUID 查，无需登录）。 */
const MOJANG_PROFILE = 'https://sessionserver.mojang.com/session/minecraft/profile/'

/** 档案接口的 textures 属性是 base64(JSON)，补齐 padding 后按 UTF-8 解码。 */
function decodeBase64Utf8(value: string): string {
  const normalized = value.replace(/\s/g, '')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

/** 从档案 JSON 里取出皮肤贴图地址；格式异常时返回空串。 */
export function skinUrlFromProfile(raw: string): string {
  try {
    const profile = JSON.parse(raw) as {
      properties?: Array<{ name?: string; value?: string }>
    }
    const textures = profile.properties?.find((p) => p.name === 'textures')?.value
    if (!textures) return ''
    const decoded = JSON.parse(decodeBase64Utf8(textures)) as {
      textures?: { SKIN?: { url?: string } }
    }
    const url = decoded.textures?.SKIN?.url ?? ''
    // Mojang 档案历史上给的是 http 贴图地址；升级 https 避免混合内容拦截
    return url.startsWith('http://textures.minecraft.net/') ? url.replace('http://', 'https://') : url
  } catch {
    return ''
  }
}

/**
 * 拉取账户的在线皮肤贴图地址。
 *
 * - 微软账户走 Mojang 公共会话档案；
 * - 外置账户逐个尝试已添加认证服务器的会话档案（支持 LittleSkin 等）。
 *
 * 全部失败返回空串，调用方回退内置本地皮肤。
 */
export async function fetchOnlineSkinUrl(
  type: string,
  uuid: string,
  authServers: Array<{ url: string }>,
): Promise<string> {
  if (!uuid) return ''
  const urls: string[] = []
  if (type === 'microsoft') {
    urls.push(`${MOJANG_PROFILE}${uuid}`)
  } else if (type === 'third') {
    for (const server of authServers) {
      urls.push(
        `${server.url.replace(/\/+$/, '')}/sessionserver/session/minecraft/profile/${uuid}`,
      )
    }
  }
  for (const url of urls) {
    try {
      const raw = await call<string>('fetch_json', { url })
      const skin = skinUrlFromProfile(raw)
      if (skin) return skin
    } catch {
      /* 该服务器不可用，继续尝试下一台 */
    }
  }
  return ''
}
