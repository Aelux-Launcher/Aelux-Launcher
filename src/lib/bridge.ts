/**
 * 平台桥接：前端与 Rust 的唯一通信面。
 *
 * - Tauri 环境：全部走 invoke（命令层见 src-tauri/src/commands.rs，
 *   TS 绑定由 tauri-specta 生成到 src/lib/bindings.ts）。
 * - 浏览器预览（npm run dev:web）：无 IPC，走本地模拟实现，
 *   保证 UI 布局预览始终可用。
 */
import { invoke } from '@tauri-apps/api/core'

/** 是否运行在 Tauri 容器内。 */
export const isTauri: boolean =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in (window as unknown as Record<string, unknown>)

/** 调用后端命令（浏览器模式下落到模拟实现）。 */
export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) return invoke<T>(command, args ?? {})
  return mockCall<T>(command, args)
}

/* ======================= 浏览器预览模拟 ======================= */

const LS_PREFIX = 'aelux.preview.'

const PREVIEW_VERSIONS = [
  '1.21.4', '1.21.3', '1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.2', '1.20.1',
  '1.19.4', '1.19.2', '1.18.2', '1.16.5', '1.12.2', '1.7.10',
].map((id) => ({
  id,
  kind: id.startsWith('2') ? 'snapshot' : 'release',
  url: `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json#${id}`,
  time: '2026-01-01T00:00:00+00:00',
  releaseTime: '2026-01-01T00:00:00+00:00',
  sha1: null,
}))

const previewInstances: unknown[] = [
  {
    id: 'preview-1',
    name: '1.21.4 原版',
    version: '1.21.4',
    loader: 'vanilla',
    loaderVersion: null,
    icon: null,
    createdAt: '2026-01-01T00:00:00Z',
    lastPlayedAt: '2026-01-02T00:00:00Z',
    playtimeSecs: 3600,
  },
  {
    id: 'preview-2',
    name: '1.20.1 Fabric',
    version: '1.20.1',
    loader: 'fabric',
    loaderVersion: '0.16.0',
    icon: null,
    createdAt: '2025-12-01T00:00:00Z',
    lastPlayedAt: null,
    playtimeSecs: 0,
  },
]

async function mockCall<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  switch (command) {
    case 'get_data_dir':
      return '/preview/.aelux' as T
    case 'get_core_version':
      return 'preview' as T
    case 'get_os_info':
      return { name: 'windows', version: '10.0.19045', arch: 'x86_64' } as T
    case 'fetch_minecraft_manifest':
      return {
        latest: { release: '1.21.4', snapshot: '25w14a' },
        versions: PREVIEW_VERSIONS,
      } as T
    case 'fetch_json':
      return JSON.stringify({ preview: true }) as T
    case 'download_file':
      await new Promise((r) => setTimeout(r, 600))
      return `/preview/${String(args?.dest ?? '')}` as T
    case 'get_instances':
      return previewInstances.slice() as T
    case 'create_instance':
      return {
        id: `preview-${Date.now()}`,
        name: String(args?.name ?? 'preview'),
        version: String(args?.version ?? '1.21.4'),
        loader: String(args?.loader ?? 'vanilla'),
        loaderVersion: null,
        icon: null,
        createdAt: new Date().toISOString(),
        lastPlayedAt: null,
        playtimeSecs: 0,
      } as T
    case 'delete_instance':
    case 'kv_set':
    case 'kv_remove':
    case 'save_config':
    case 'write_text':
    case 'minimize_window':
    case 'close_window':
    case 'open_external':
    case 'open_folder_in_explorer':
      if (command === 'open_external') window.open(String(args?.url ?? ''), '_blank', 'noopener')
      if (command === 'kv_set') localStorage.setItem(LS_PREFIX + String(args?.key), String(args?.value))
      if (command === 'kv_remove') localStorage.removeItem(LS_PREFIX + String(args?.key))
      return null as T
    case 'get_config':
      return {
        theme: 'light',
        language: 'zh-CN',
        javaPath: '',
        memoryMinMb: 512,
        memoryMaxMb: 4096,
        jvmArgs: [],
        gameArgs: [],
        gameWidth: 854,
        gameHeight: 480,
        downloadConcurrency: 8,
        hideOnLaunch: false,
      } as T
    case 'read_bundled_announcements':
      return '[]' as T
    case 'read_local_update':
      return '' as T
    default:
      console.warn(`[aelux preview] 未模拟的命令: ${command}`)
      return null as T
  }
}

/** 读取 kv（浏览器模式落 localStorage，与 mockCall 的写入对称）。 */
export async function kvGet(key: string): Promise<string | null> {
  if (isTauri) return call<string | null>('kv_get', { key })
  return localStorage.getItem(LS_PREFIX + key)
}
