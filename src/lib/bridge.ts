/**
 * lib-platform 桥接：把 aelux-launcher-lib 的 PlatformAdapter 映射到 Tauri invoke。
 * 这是前端唯一与 Rust 通信的面；业务规则全部在 lib-core（TS）中。
 *
 * 另外提供「浏览器预览适配器」：
 *   桌面端跑在 Tauri 里，平台能力全部走 invoke；
 *   但在浏览器里用 `npm run dev` 预览时没有 Tauri IPC，invoke 会直接抛错，
 *   导致启动器永远卡在「正在初始化」。
 *   因此这里按运行环境二选一：Tauri 用真适配器，浏览器用本地模拟适配器
 *   （localStorage + 内置版本清单 + 模拟下载进度），保证界面始终可用。
 */
import { invoke } from '@tauri-apps/api/core'
import type { PlatformAdapter, KeyValueStore } from 'aelux-launcher-lib'

/** 是否运行在 Tauri 容器内。 */
export const isTauri =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in (window as unknown as Record<string, unknown>)

const storage: KeyValueStore = {
  get: (key) => invoke<string | null>('kv_get', { key }),
  set: (key, value) => invoke('kv_set', { key, value }),
  remove: (key) => invoke('kv_remove', { key }),
}

export const tauriAdapter: PlatformAdapter = {
  invoke: (command, args) => invoke(command, args ?? {}),
  storage,
  openExternal: (url) => invoke('open_external', { url }),
  downloadFile: (url, dest, opts) =>
    invoke<string>('download_file', {
      url,
      dest,
      sha256: opts?.checksum?.algo === 'sha256' ? opts.checksum.value : null,
    }),
  // 游戏进程由 launch_minecraft 命令拉起，这里不单独 spawn
  spawn: async () => {
    throw new Error('游戏进程请使用 launch_minecraft 命令拉起')
  },
  detectJava: async () => null,
  readText: (path) => invoke<string | null>('read_text', { path }),
  writeText: (path, content) => invoke('write_text', { path, content }),
  readBundledAnnouncements: () => invoke('read_bundled_announcements'),
  readLocalUpdate: () => invoke('read_local_update'),
  log: (level, message) => console[level](`[aelux] ${message}`),
}

/* ======================= 浏览器预览适配器 ======================= */

const LS_PREFIX = 'aelux.preview.'

const previewStorage: KeyValueStore = {
  get: async (key) => localStorage.getItem(LS_PREFIX + key),
  set: async (key, value) => {
    localStorage.setItem(LS_PREFIX + key, value)
  },
  remove: async (key) => {
    localStorage.removeItem(LS_PREFIX + key)
  },
}

/** 预览用的内置版本清单（贴近真实 MC 版本号，便于观察界面）。 */
const PREVIEW_VERSIONS = [
  { id: '1.21.4', type: 'release', releaseTime: '2024-12-19T12:00:00+00:00' },
  { id: '1.21.3', type: 'release', releaseTime: '2024-10-22T12:00:00+00:00' },
  { id: '1.21.1', type: 'release', releaseTime: '2024-08-08T12:00:00+00:00' },
  { id: '1.21', type: 'release', releaseTime: '2024-06-13T12:00:00+00:00' },
  { id: '1.20.6', type: 'release', releaseTime: '2024-04-29T12:00:00+00:00' },
  { id: '1.20.4', type: 'release', releaseTime: '2024-03-25T12:00:00+00:00' },
  { id: '1.20.2', type: 'release', releaseTime: '2023-12-21T12:00:00+00:00' },
  { id: '1.20.1', type: 'release', releaseTime: '2023-06-12T12:00:00+00:00' },
  { id: '1.19.4', type: 'release', releaseTime: '2023-03-14T12:00:00+00:00' },
  { id: '1.19.2', type: 'release', releaseTime: '2022-08-19T12:00:00+00:00' },
  { id: '1.18.2', type: 'release', releaseTime: '2022-02-28T12:00:00+00:00' },
  { id: '1.16.5', type: 'release', releaseTime: '2020-12-16T12:00:00+00:00' },
  { id: '1.12.2', type: 'release', releaseTime: '2019-02-07T12:00:00+00:00' },
  { id: '1.7.10', type: 'release', releaseTime: '2014-06-17T12:00:00+00:00' },
  { id: '24w03a', type: 'snapshot', releaseTime: '2024-01-10T12:00:00+00:00' },
  { id: '24w02a', type: 'snapshot', releaseTime: '2024-01-03T12:00:00+00:00' },
].map((v) => ({ ...v, url: `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json#${v.id}` }))

/** 模拟下载：按 tick 推进进度，便于观察 TaskList / ProgressDialog。 */
async function fakeDownload(
  url: string,
  dest: string,
  opts?: { onProgress?: (r: number, t: number) => void },
) {
  const total = 6 * 1024 * 1024
  for (let received = 0; received <= total; received += total / 12) {
    await new Promise((r) => setTimeout(r, 120))
    opts?.onProgress?.(received, total)
  }
  console.info(`[aelux preview] 已模拟下载 ${url} → ${dest}`)
  return dest
}

export const previewAdapter: PlatformAdapter = {
  invoke: async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    switch (command) {
      case 'get_data_dir':
        return '/preview/.aelux' as T
      case 'fetch_minecraft_manifest':
        return {
          latest: { release: '1.21.4', snapshot: '24w03a' },
          versions: PREVIEW_VERSIONS,
        } as T
      case 'fetch_json':
        return JSON.stringify({ id: 'preview', downloads: {} }) as T
      case 'list_jres':
        return [{ path: '/usr/bin/java', major: 21, version: '21.0.3' }] as T
      case 'get_os_info':
        return { name: 'windows', version: '10.0.19045', arch: 'x86_64' } as T
      case 'launch_minecraft':
        return 0 as T
      case 'get_instances':
        return [] as T
      case 'create_instance':
        return {
          id: String(Date.now()),
          name: (args?.name as string) ?? 'preview',
          version: (args?.version as string) ?? '1.21.4',
          loader: null,
        } as T
      case 'delete_instance':
        return null as T
      default:
        return null as T
    }
  },
  storage: previewStorage,
  openExternal: async (url) => {
    window.open(url, '_blank', 'noopener')
  },
  downloadFile: (url, dest, opts) => fakeDownload(url, dest, opts),
  spawn: async () => 0,
  detectJava: async () => ({ path: '/usr/bin/java', version: '21.0.3' }),
  readText: async () => null,
  writeText: async () => {},
  readBundledAnnouncements: async () => [],
  readLocalUpdate: async () => null,
  log: (level, message) => console[level](`[aelux preview] ${message}`),
}

/** 当前生效的平台适配器。 */
export const platform: PlatformAdapter = isTauri ? tauriAdapter : previewAdapter
