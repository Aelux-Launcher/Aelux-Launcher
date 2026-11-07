/**
 * 平台桥接：前端与 Rust 的唯一通信面。
 *
 * 只连接真实后端（Tauri IPC），不再提供浏览器预览假数据。
 * 所有业务数据来自内核：真实账户、真实实例、真实本地文件与真实网络 API。
 */
import { invoke } from '@tauri-apps/api/core'

/** 是否运行在 Tauri 容器内。 */
export const isTauri: boolean =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in (window as unknown as Record<string, unknown>)

/**
 * 内核错误 → 可读文本。
 *
 * Tauri 命令签名为 `Result<T, String>`，IPC 拒绝值是**字符串**而非 Error；
 * 直接取 `.message` 会得到 undefined，调用方再对它做判断就会抛 TypeError
 * （设备码轮询因此中断，界面永远停在「等待授权」）。
 */
function errorText(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object') {
    const message = (e as { message?: unknown }).message
    if (typeof message === 'string') return message
    try {
      return JSON.stringify(e)
    } catch {
      /* 循环引用等无法序列化时走兜底 */
    }
  }
  return String(e)
}

/** 调用后端命令。非 Tauri 环境直接报错，避免静默使用假数据。 */
export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) {
    throw new Error('当前为浏览器预览环境，未连接启动器内核；请使用桌面端运行')
  }
  try {
    return await invoke<T>(command, args ?? {})
  } catch (e) {
    throw new Error(errorText(e))
  }
}

/** 读取内核 KV。 */
export async function kvGet(key: string): Promise<string | null> {
  return call<string | null>('kv_get', { key })
}
