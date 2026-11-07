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

/** 调用后端命令。非 Tauri 环境直接报错，避免静默使用假数据。 */
export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) {
    throw new Error('当前为浏览器预览环境，未连接启动器内核；请使用桌面端运行')
  }
  return invoke<T>(command, args ?? {})
}

/** 读取内核 KV。 */
export async function kvGet(key: string): Promise<string | null> {
  return call<string | null>('kv_get', { key })
}
