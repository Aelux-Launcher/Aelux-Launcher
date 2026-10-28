/**
 * 全局状态（Zustand）：组合 lib-core 各模块，向上驱动 UI。
 * 壳层只做编排：把用户操作转成对 lib 的调用，把 lib 返回的数据交给组件渲染。
 */
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import {
  Auth,
  ModrinthClient,
  Updater,
  Announcements,
  Telemetry,
  AiInject,
  Launch,
  SettingsSchema,
  type Session,
  type Announcement,
  type Settings,
  type GameInstance,
} from 'aelux-launcher-lib'
import { tauriAdapter } from './lib/bridge'

export { tauriAdapter }

const APP_VERSION = '0.1.0'
const UPDATE_URL = 'https://update.aelux.app/latest.json' // TODO: 替换为真实更新源
const TELEMETRY_URL = 'https://api.aelux.app/telemetry'

export const auth = new Auth({ platform: tauriAdapter })
export const modrinth = new ModrinthClient(tauriAdapter)
export const updater = new Updater(tauriAdapter, APP_VERSION, UPDATE_URL)
export const announcements = new Announcements(tauriAdapter)
export const telemetry = new Telemetry(tauriAdapter, TELEMETRY_URL)
export const ai = new AiInject(tauriAdapter)
export const launch = new Launch(tauriAdapter, ai)

interface AppState {
  ready: boolean
  session: Session | null
  settings: Settings
  instances: GameInstance[]
  view: 'home' | 'login' | 'mods' | 'settings'
  pendingAnnouncements: Announcement[]
  updateAvailable: boolean
  theme: 'light' | 'dark'
  init: () => Promise<void>
  setView: (v: AppState['view']) => void
  setTheme: (t: 'light' | 'dark') => void
  refreshInstances: () => Promise<void>
  launchInstance: (id: string) => Promise<void>
}

function applyTheme(t: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', t)
  localStorage.setItem('aelux-theme', t)
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  session: null,
  settings: SettingsSchema.parse({}),
  instances: [],
  view: 'home',
  pendingAnnouncements: [],
  updateAvailable: false,
  theme: (localStorage.getItem('aelux-theme') as 'light' | 'dark') || 'dark',

  init: async () => {
    applyTheme(get().theme)
    const session = await auth.restore()
    set({ session })
    const pending = await announcements.pull()
    set({ pendingAnnouncements: pending })
    const info = await updater.check()
    set({ updateAvailable: !!info })
    await get().refreshInstances()
    telemetry.record('start', { version: APP_VERSION })
    set({ ready: true })
  },

  setView: (view) => set({ view }),
  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },

  refreshInstances: async () => {
    try {
      const list = await invoke<GameInstance[]>('get_instances')
      set({ instances: list })
    } catch {
      /* 后台/本地失败时静默 */
    }
  },

  launchInstance: async (id) => {
    const inst = get().instances.find((i) => i.id === id)
    if (!inst) return
    telemetry.record('launch', { version: inst.version, loader: inst.loader })
    await launch.run({
      instance: inst,
      session: get().session,
      settings: get().settings,
      modsDir: `instances/${id}/mods`,
    })
  },
}))
