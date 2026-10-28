/**
 * lib-platform 桥接：把 aelux-launcher-lib 的 PlatformAdapter 映射到 Tauri invoke。
 * 这是前端唯一与 Rust 通信的面；业务规则全部在 lib-core（TS）中。
 */
import { invoke } from '@tauri-apps/api/core'
import type { PlatformAdapter, KeyValueStore } from 'aelux-launcher-lib'

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
