/**
 * 全局状态（Zustand）：Aelux 启动器的「组合根（composition root）」。
 *
 * 这里是「核心(lib-core) 如何接入 启动器(app)」的唯一答案：
 *   1. 所有 lib-core 模块都用同一个 platform（PlatformAdapter）构造 ——
 *      adapter 是 lib-core 与 Tauri/Rust 之间的唯一边界，业务规则全在 TS 层。
 *   2. store 把「用户操作」翻译成「对 lib-core 的调用」，再把结果交给视图渲染。
 *   3. 需要真实系统能力（下载、进程、文件）的命令，由 adapter → Tauri invoke 落到 Rust。
 *
 * platform 在 Tauri 环境下指向真适配器；在浏览器预览时指向模拟适配器，
 * 避免无 IPC 时启动器卡在「正在初始化」。
 *
 * 参考 HMCL 的三层：Rust/Boot（平台）· lib-core（HMCLCore 等价，纯逻辑）· app（HMCL UI 等价）。
 */
import { create } from 'zustand'
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
  type DownloadTaskInput,
  type LaunchResult,
} from 'aelux-launcher-lib'
import { platform, isTauri } from './lib/bridge'

export { platform, isTauri }

/* ----------------------------- lib-core 实例 ----------------------------- */
const APP_VERSION = '0.1.0'
const UPDATE_URL = 'https://update.aelux.app/latest.json' // TODO: 替换为真实更新源
const TELEMETRY_URL = 'https://api.aelux.app/telemetry'

// 平台无关模块：直接以 adapter 构造。
export const auth = new Auth({ platform })
export const modrinth = new ModrinthClient(platform)
export const updater = new Updater(platform, APP_VERSION, UPDATE_URL)
export const announcements = new Announcements(platform)
export const telemetry = new Telemetry(platform, TELEMETRY_URL)
export const ai = new AiInject(platform)
export const launch = new Launch(platform, ai)

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
  /** 初始化过程中的错误（用于界面提示，不再卡在 loading） */
  initError: string | null
  /** 浏览器预览模式（无 Tauri 运行时，平台能力为模拟实现） */
  browserMode: boolean
  session: Session | null
  settings: Settings
  instances: GameInstance[]
  view: 'home' | 'download' | 'multiplayer' | 'settings' | 'more'
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
  launchInstance: (id: string) => Promise<LaunchResult | null>
  loadVersions: () => Promise<void>
  installVersion: (id: string) => Promise<void>
  resolveJava: (versionId: string) => Promise<{ jre: { path: string; major: number } | null; needsDownload: boolean; downloadUrl?: string } | null>
  loadServers: () => Promise<void>
  addServer: (s: Server) => Promise<void>
  removeServer: (id: string) => Promise<void>
}

/**
 * 主题持久化：
 *   `aelux-theme-choice` 只在用户主动切换时写入，因此它代表「用户的选择」。
 *   早前版本曾把默认值 'dark' 也写进了 `aelux-theme`，导致用户一打开就是黑色，
 *   这里改为只认 `aelux-theme-choice`，没有记录时一律用浅色。
 */
const THEME_CHOICE_KEY = 'aelux-theme-choice'

function initialTheme(): 'light' | 'dark' {
  const saved = localStorage.getItem(THEME_CHOICE_KEY)
  return saved === 'dark' ? 'dark' : 'light'
}

function applyTheme(t: 'light' | 'dark', persist: boolean) {
  document.documentElement.setAttribute('data-theme', t)
  if (persist) localStorage.setItem(THEME_CHOICE_KEY, t)
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  initError: null,
  browserMode: !isTauri,
  session: null,
  settings: SettingsSchema.parse({}),
  instances: [],
  // 默认浅色主题（PCL2 风：冰蓝主色 + 灰白表面，不用黑色）
  view: 'home',
  pendingAnnouncements: [],
  updateAvailable: false,
  theme: initialTheme(),

  versions: [],
  versionsLoading: false,
  versionsError: null,
  installing: null,
  installError: null,
  downloadState: null,

  servers: [],

  init: async () => {
    applyTheme(get().theme, false)
    set({ initError: null, browserMode: !isTauri })

    // 逐段容错：任何一段失败都不应把启动器卡死在「正在初始化」。
    // 最终一定置 ready，失败信息进 initError 供界面提示。
    const fail = (e: unknown) => (e as Error)?.message ?? String(e)

    try {
      // 解析运行期路径，构造依赖路径的 lib-core 模块。
      DATA_DIR = await platform.invoke<string>('get_data_dir')
      const mc = `${DATA_DIR}/.aelux/minecraft`
      const versionsDir = `${mc}/versions`
      versionRepo = new VersionRepository({
        manifestProvider: () => platform.invoke('fetch_minecraft_manifest'),
        fetchVersionJson: (url: string) =>
          platform.invoke<string>('fetch_json', { url }).then((s) => JSON.parse(s)),
        fetchJson: (url: string) =>
          platform.invoke<string>('fetch_json', { url }).then((s) => JSON.parse(s)),
        osProvider: async () => {
          try {
            return await platform.invoke<
              { name: string; version: string; arch: string }
            >('get_os_info')
          } catch {
            return { name: 'windows', version: '10.0', arch: 'x86_64' }
          }
        },
        metaRoot: versionsDir,
        gameRoot: versionsDir,
        assetsRoot: mc,
      })
      downloadManager = new DownloadManager(platform, 8, 3)
      java = new JavaManager(platform)
      downloadManager.subscribe((s) => set({ downloadState: s }))
    } catch (e) {
      set({ initError: `本地数据目录不可用：${fail(e)}` })
    }

    try {
      const session = await auth.restore()
      set({ session })
    } catch (e) {
      set({ initError: `读取本地会话失败：${fail(e)}` })
    }

    try {
      const pending = await announcements.pull()
      set({ pendingAnnouncements: pending })
    } catch {
      /* 公告拉取失败不影响启动 */
    }

    try {
      const info = await updater.check()
      set({ updateAvailable: !!info })
    } catch {
      /* 更新检查失败不影响启动 */
    }

    await get().loadVersions()
    await get().refreshInstances()
    await get().loadServers()

    try {
      telemetry.record('start', { version: APP_VERSION })
    } catch {
      /* 遥测失败静默 */
    }

    set({ ready: true })
  },

  setView: (view) => set({ view }),
  setTheme: (theme) => {
    applyTheme(theme, true)
    set({ theme })
  },

  refreshInstances: async () => {
    try {
      const list = await platform.invoke<GameInstance[]>('get_instances')
      set({ instances: list })
    } catch {
      /* 后台/本地失败时静默 */
    }
  },

  createInstance: async (name, version, loader) => {
    // Rust 命令参数名为 loader（Tauri v2 将 camelCase→snake_case，故这里传 loader）
    const inst = await platform.invoke<GameInstance>('create_instance', {
      name,
      version,
      loader: loader ?? null,
    })
    set((s) => ({ instances: [...s.instances, inst] }))
    return inst
  },

  deleteInstance: async (id) => {
    await platform.invoke('delete_instance', { id })
    set((s) => ({ instances: s.instances.filter((i) => i.id !== id) }))
  },

  launchInstance: async (id) => {
    const inst = get().instances.find((i) => i.id === id)
    if (!inst) return null
    telemetry.record('launch', { version: inst.version, loader: inst.loader })
    // 启动前先为版本解析 Java（精确 → 向前兼容 → 需要下载）。
    let javaPath = get().settings.javaPath
    if (java) {
      const r = await java.resolveFor(inst.version)
      if (r.jre?.path) javaPath = r.jre.path
    }
    return launch.run({
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

      // 完整安装计划：版本 JSON + 客户端 jar + 依赖库 + 资源索引 + 资源对象 + 原生库。
      // 少了依赖库 classpath 不全、少了资源对象材质/音效全丢，游戏都起不来。
      const tasks: DownloadTaskInput[] = [
        plan.versionJson,
        ...(plan.clientJar ? [plan.clientJar] : []),
        ...plan.libraries,
        ...(plan.assetsIndex ? [plan.assetsIndex] : []),
        ...plan.assets,
        ...plan.natives,
      ]
      downloadManager.enqueue(tasks)
      await downloadManager.whenIdle()

      const state = downloadManager.getState()
      if (state.failed > 0) {
        throw new Error(`${state.failed} 个文件下载失败，安装未完成`)
      }

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
    const raw = await platform.storage.get('servers')
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
    await platform.storage.set('servers', JSON.stringify(next))
  },

  removeServer: async (id) => {
    const next = get().servers.filter((x) => x.id !== id)
    set({ servers: next })
    await platform.storage.set('servers', JSON.stringify(next))
  },
}))
