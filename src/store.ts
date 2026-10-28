/**
 * 全局状态（Zustand）：Aelux 启动器的「组合根（composition root）」。
 *
 * 这里是「核心(lib-core) 如何接入 启动器(app)」的唯一答案：
 *   1. 所有 lib-core 模块都用同一个 tauriAdapter（PlatformAdapter）构造 ——
 *      adapter 是 lib-core 与 Tauri/Rust 之间的唯一边界，业务规则全在 TS 层。
 *   2. store 把「用户操作」翻译成「对 lib-core 的调用」，再把结果交给视图渲染。
 *   3. 需要真实系统能力（下载、进程、文件）的命令，由 adapter → Tauri invoke 落到 Rust。
 *
 * 参考 HMCL 的三层：Rust/Boot（平台）· lib-core（HMCLCore 等价，纯逻辑）· app（HMCL UI 等价）。
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
  VersionRepository,
  DownloadManager,
  JavaManager,
  SettingsSchema,
  type Session,
  type Announcement,
  type Settings,
  type GameInstance,
  type McVersionEntry,
  type DownloadManagerState,
} from 'aelux-launcher-lib'
import { tauriAdapter } from './lib/bridge'

export { tauriAdapter }

/* ----------------------------- lib-core 实例 ----------------------------- */
const APP_VERSION = '0.1.0'
const UPDATE_URL = 'https://update.aelux.app/latest.json' // TODO: 替换为真实更新源
const TELEMETRY_URL = 'https://api.aelux.app/telemetry'

// 平台无关模块：直接以 adapter 构造。
export const auth = new Auth({ platform: tauriAdapter })
export const modrinth = new ModrinthClient(tauriAdapter)
export const updater = new Updater(tauriAdapter, APP_VERSION, UPDATE_URL)
export const announcements = new Announcements(tauriAdapter)
export const telemetry = new Telemetry(tauriAdapter, TELEMETRY_URL)
export const ai = new AiInject(tauriAdapter)
export const launch = new Launch(tauriAdapter, ai)

// 依赖运行期路径（app data 目录）的模块：在 init() 中根据实际目录构造。
let versionRepo: VersionRepository | null = null
let downloadManager: DownloadManager | null = null
let java: JavaManager | null = null
let DATA_DIR = ''

/* ------------------------------- 类型 ----------------------------------- */
export interface Server {
  id: string
  name: string
  host: string
  port?: number
}

/* ------------------------------- store ----------------------------------- */
interface AppState {
  ready: boolean
  session: Session | null
  settings: Settings
  instances: GameInstance[]
  view: 'home' | 'download' | 'account' | 'mods' | 'multiplayer' | 'settings'
  pendingAnnouncements: Announcement[]
  updateAvailable: boolean
  theme: 'light' | 'dark'

  // 版本 / 下载
  versions: McVersionEntry[]
  versionsLoading: boolean
  versionsError: string | null
  installing: string | null
  installError: string | null
  downloadState: DownloadManagerState | null

  // 联机
  servers: Server[]

  /* actions */
  init: () => Promise<void>
  setView: (v: AppState['view']) => void
  setTheme: (t: 'light' | 'dark') => void
  refreshInstances: () => Promise<void>
  createInstance: (name: string, version: string, loader?: string) => Promise<GameInstance>
  deleteInstance: (id: string) => Promise<void>
  launchInstance: (id: string) => Promise<void>
  loadVersions: () => Promise<void>
  installVersion: (id: string) => Promise<void>
  resolveJava: (versionId: string) => Promise<{ jre: { path: string; major: number } | null; needsDownload: boolean; downloadUrl?: string } | null>
  loadServers: () => Promise<void>
  addServer: (s: Server) => Promise<void>
  removeServer: (id: string) => Promise<void>
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
  // 默认浅色主题（PCL2 风：冰蓝主色 + 灰白表面，不用黑色）
  view: 'home',
  pendingAnnouncements: [],
  updateAvailable: false,
  theme: (localStorage.getItem('aelux-theme') as 'light' | 'dark') || 'light',

  versions: [],
  versionsLoading: false,
  versionsError: null,
  installing: null,
  installError: null,
  downloadState: null,

  servers: [],

  init: async () => {
    applyTheme(get().theme)

    // 解析运行期路径，构造依赖路径的 lib-core 模块。
    DATA_DIR = await invoke<string>('get_data_dir')
    const mc = `${DATA_DIR}/.aelux/minecraft`
    const versionsDir = `${mc}/versions`
    versionRepo = new VersionRepository({
      manifestProvider: () => invoke('fetch_minecraft_manifest'),
      fetchVersionJson: (url: string) => invoke<string>('fetch_json', { url }).then((s) => JSON.parse(s)),
      metaRoot: versionsDir,
      gameRoot: versionsDir,
    })
    downloadManager = new DownloadManager(tauriAdapter, 8, 3)
    java = new JavaManager(tauriAdapter)
    downloadManager.subscribe((s) => set({ downloadState: s }))

    const session = await auth.restore()
    set({ session })
    const pending = await announcements.pull()
    set({ pendingAnnouncements: pending })
    const info = await updater.check()
    set({ updateAvailable: !!info })

    await get().loadVersions()
    await get().refreshInstances()
    await get().loadServers()

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

  createInstance: async (name, version, loader) => {
    // Rust 命令参数名为 loader（Tauri v2 将 camelCase→snake_case，故这里传 loader）
    const inst = await invoke<GameInstance>('create_instance', {
      name,
      version,
      loader: loader ?? null,
    })
    set((s) => ({ instances: [...s.instances, inst] }))
    return inst
  },

  deleteInstance: async (id) => {
    await invoke('delete_instance', { id })
    set((s) => ({ instances: s.instances.filter((i) => i.id !== id) }))
  },

  launchInstance: async (id) => {
    const inst = get().instances.find((i) => i.id === id)
    if (!inst) return
    telemetry.record('launch', { version: inst.version, loader: inst.loader })
    // 启动前先为版本解析 Java（精确 → 向前兼容 → 需要下载）。
    let javaPath = get().settings.javaPath
    if (java) {
      const r = await java.resolveFor(inst.version)
      if (r.jre?.path) javaPath = r.jre.path
    }
    await launch.run({
      instance: inst,
      session: get().session,
      settings: { ...get().settings, javaPath },
      modsDir: `${DATA_DIR}/.aelux/instances/${id}/mods`,
    })
  },

  loadVersions: async () => {
    if (!versionRepo) return
    set({ versionsLoading: true, versionsError: null })
    try {
      const list = await versionRepo.list()
      set({ versions: list })
    } catch (e) {
      set({ versionsError: (e as Error).message })
    } finally {
      set({ versionsLoading: false })
    }
  },

  installVersion: async (id) => {
    if (!versionRepo || !downloadManager) return
    set({ installing: id, installError: null })
    try {
      const plan = await versionRepo.planInstall(id)
      if (!plan) throw new Error('无法生成安装计划')
      const tasks = [plan.versionJson, plan.clientJar].filter(Boolean) as Parameters<
        DownloadManager['enqueue']
      >[0]
      downloadManager.enqueue(tasks)
      await downloadManager.whenIdle()
      // 安装完成 → 登记为实例，主页即可一键启动。
      await get().createInstance(id, id)
      telemetry.record('install', { version: id })
    } catch (e) {
      set({ installError: (e as Error).message })
    } finally {
      set({ installing: null })
    }
  },

  resolveJava: async (versionId) => {
    if (!java) return null
    return java.resolveFor(versionId)
  },

  loadServers: async () => {
    const raw = await tauriAdapter.storage.get('servers')
    if (raw) {
      try {
        set({ servers: JSON.parse(raw) })
      } catch {
        /* 忽略损坏数据 */
      }
    }
  },

  addServer: async (s) => {
    const next = [...get().servers, s]
    set({ servers: next })
    await tauriAdapter.storage.set('servers', JSON.stringify(next))
  },

  removeServer: async (id) => {
    const next = get().servers.filter((x) => x.id !== id)
    set({ servers: next })
    await tauriAdapter.storage.set('servers', JSON.stringify(next))
  },
}))
