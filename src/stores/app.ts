/**
 * 全局状态（Pinia）：Aelux 启动器的「组合根」。
 *
 * 数据与重活全部在 Rust 内核（aelux-core），前端通过 commands 调用；
 * store 负责：页面层级（主页面 / 副页面 / 页面栈）、数据缓存、
 * 用户操作到命令调用的翻译。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { router } from '../router'
import { call, kvGet, isTauri } from '../lib/bridge'
import type { Account, DeviceCodeSession } from '../lib/bindings'
import { readExtras } from '../views/SettingsModel'
import { toast } from '../lib/toast'
import { promptDialog } from '../lib/dialog'
import type {
  Announcement,
  AppModuleKey,
  AuthServer,
  CoreEvent,
  DeviceFlowState,
  DownloadManagerState,
  DownloadTaskState,
  GameInstance,
  InstallResult,
  InstanceTab,
  JavaInstallResult,
  LaunchOutcome,
  LaunchResult,
  LocalContentItem,
  ModUpdate,
  ModpackImportResult,
  ResourceDetailData,
  ResourceKind,
  ResourceProject,
  ResourceQuery,
  ResourceVersion,
  RunningGame,
  Session,
  Settings,
  StoredAccount,
  StoredFolder,
  SubPage,
  VersionEntry,
} from '../lib/types'
import {
  buildResourceDetailUrl,
  buildResourceProjectsUrl,
  buildResourceSearchUrl,
  buildResourceTeamMembersUrl,
  buildResourceVersionsUrl,
  RESOURCE_CATEGORIES,
  RESOURCE_PAGE_SIZE,
} from '../lib/modrinth'
import {
  isCurseForgeProjectId,
  loadCurseForgeDetail,
  searchCurseForge,
} from '../lib/curseforge'

/** 页面栈记录：进入详情页之前待返回的位置。 */
export interface PageStackEntry {
  /** 返回时恢复显示的模块 */
  view: AppModuleKey
  sub?: string
  /** 进入前的完整路由路径（用于从二级页进入任务页后原路返回）。 */
  path?: string
}

/** 测试期版本基线（三处版本号统一维护：package.json / tauri.conf.json / 内核 Cargo.toml）。 */
const APP_VERSION_FALLBACK = '0.1.0'

/** 展示「前置资源」时忽略的两个基础前置（Fabric API / Quilt API）。 */
const IGNORED_DEPENDENCIES = new Set(['P7dR8mSH', 'qvIfYCYJ'])

const DEFAULT_SETTINGS: Settings = {
  memoryMb: 2048,
  javaPath: '',
  instancesDir: '',
  closeOnExit: false,
  autoUpdate: true,
  showConsole: true,
  aiFixMod: false,
}

/** 联机广场里的服务器房间。 */
export interface MultiplayerRoom {
  id: string
  /** 房间名 */
  name: string
  /** 节点标识 */
  nodeId: string
  /** 节点显示名 */
  nodeLabel: string
  /** 节点地址（展示用） */
  host: string
  /** 随机分配端口 */
  port: number
  /** 密码房密码（空 = 公开房） */
  password: string
  /** 是否为当前用户创建（只会有一个） */
  mine: boolean
  /** 退出启动器后是否保留（保留 3 天，再次启动刷新计时） */
  persist: boolean
  /** 创建时间（Unix 毫秒） */
  createdAt: number
  /** 保留到期时间（Unix 毫秒，0 = 不保留） */
  expiresAt: number
}

/** 房间保留时长：3 天。 */
const ROOM_TTL_MS = 3 * 24 * 60 * 60 * 1000

/** 游戏非正常退出时展示的崩溃信息。 */
export interface CrashInfo {
  instanceId: string
  instanceName: string
  exitCode: number
  /** 报告文件路径（空 = 未找到） */
  path: string
  /** 末尾日志片段 */
  content: string
  /** 是否来自游戏 crash-reports */
  fromGame: boolean
}

export const useAppStore = defineStore('app', () => {
  /* 当前路由（模块级 router 单例，避免 store 内 useRoute 的 setup 约束） */
  const route = computed(() => router.currentRoute.value)

  /* ------------------------------- 页面层级 ------------------------------- */
  const view = computed<AppModuleKey>(() => (route.value.meta.module as AppModuleKey | undefined) ?? 'home')

  /**
   * 侧栏应显示的模块分组：
   *   详情页保持来源模块（页面栈记录），其余跟随当前路由。
   */
  const sideModule = computed<AppModuleKey>(() => {
    if (route.value.meta.sub) return pageStack.value[0]?.view ?? 'home'
    return view.value
  })

  /** 顶栏返回按钮可见性：非启动页模块或处于详情页。 */
  const showBack = computed(() => sideModule.value !== 'home' || subPage.value !== null)

  const subPage = computed<SubPage | null>(() => {
    const meta = route.value.meta
    if (meta.sub === 'select') return { kind: 'select' }
    if (meta.sub === 'tasks') return { kind: 'tasks' }
    if (meta.sub === 'instance')
      return {
        kind: 'instance',
        instanceId: String(route.value.params.instanceId ?? ''),
        tab: String(route.value.params.tab ?? 'overall') as InstanceTab,
      }
    if (meta.sub === 'resource')
      return {
        kind: 'resource',
        resourceKind: String(route.value.params.kind ?? 'mod') as ResourceKind,
        projectId: String(route.value.params.projectId ?? ''),
        title: String(route.value.query.title ?? ''),
        gameVersion: String(route.value.query.version ?? '') || undefined,
        loader: String(route.value.query.loader ?? '') || undefined,
      }
    if (meta.sub === 'help')
      return {
        kind: 'help',
        entryId: String(route.value.params.entryId ?? ''),
        title: String(route.value.query.title ?? ''),
      }
    if (meta.sub === 'version')
      return { kind: 'version', versionId: String(route.value.params.versionId ?? '') }
    if (meta.sub === 'accounts') return { kind: 'accounts' }
    return null
  })

  /** 各模块当前选中的分类（切走再切回时保持）。 */
  const navState = ref<Record<AppModuleKey, string>>({
    home: 'default',
    download: 'original',
    settings: 'global',
    more: 'help',
  })
  const PAGE_STACK_KEY = 'aelux:page-stack'

  /** 读取重载前保存的页面栈（失败时按空栈处理）。 */
  function readPageStack(): PageStackEntry[] {
    try {
      const raw = sessionStorage.getItem(PAGE_STACK_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as PageStackEntry[]) : []
    } catch {
      return []
    }
  }

  function persistPageStack() {
    try {
      sessionStorage.setItem(PAGE_STACK_KEY, JSON.stringify(pageStack.value))
    } catch {
      /* sessionStorage 不可用时忽略 */
    }
  }

  const pageStack = ref<PageStackEntry[]>(readPageStack())
  /** 页面内部层级返回（如日志详情 → 日志列表）；返回 true 表示已拦截。 */
  const innerBack = ref<null | (() => boolean)>(null)

  /** 切换一级模块（路由 redirect 会落到该模块的默认分类）。 */
  function setView(v: AppModuleKey) {
    pageStack.value = []
    persistPageStack()
    void router.push(`/${v}`)
  }

  /** 路由跳转包装（供组件使用，保持单一入口）。 */
  function routerPush(to: string) {
    return router.push(to)
  }

  /** 主页面左栏子项切换：只换内容，不动页面栈。 */
  function setNav(v: AppModuleKey, sub: string) {
    navState.value = { ...navState.value, [v]: sub }
  }

  /** 进入副页面：把来处压栈，标题栏切成返回态。 */
  function openSubPage(p: SubPage) {
    const current: PageStackEntry = {
      view: view.value,
      sub: navState.value[view.value],
      path: route.value.fullPath,
    }
    const exists = pageStack.value.some((e) => e.view === current.view)
    if (exists) {
      const idx = pageStack.value.findIndex((e) => e.view === current.view)
      pageStack.value = pageStack.value.slice(idx + 1)
    } else {
      pageStack.value = [current, ...pageStack.value]
    }
    persistPageStack()
    void router.push(subPath(p))
  }

  /** 标题栏下载指示器：打开下载进度页（已在任务页则忽略）。 */
  function openTasksPage() {
    if (route.value.name === 'tasks') return
    openSubPage({ kind: 'tasks' })
  }

  /** 退出详情页，回到所在模块（保留分类选择）。 */
  function closeSubPage() {
    void router.push(`/${view.value}`)
  }

  /**
   * 返回（顶栏 ← 按钮）：
   *   页面内部层级 → 先交给页面自己回退；详情页 → 逐级回退页面栈；
   *   模块态 → 回启动页；启动页 → 无操作。
   */
  function pageBack() {
    if (innerBack.value && innerBack.value()) return
    const [top, ...rest] = pageStack.value
    if (!top) {
      pageStack.value = []
      persistPageStack()
      void router.push('/home')
      return
    }
    pageStack.value = rest
    persistPageStack()
    if (top.sub) navState.value = { ...navState.value, [top.view]: top.sub }
    // 有完整路径（如版本详情）时原路返回，避免二级页回退落到模块首页。
    if (top.path) {
      void router.push(top.path)
      return
    }
    // 模块页恢复到进入前的分类；无记录则落到默认分类（redirect）
    void router.push(top.view === 'home' || !top.sub ? `/${top.view}` : `/${top.view}/${top.sub}`)
  }

  /** 注册页面内部返回处理器（如日志详情）；传 null 解除。 */
  function setInnerBack(fn: (() => boolean) | null) {
    innerBack.value = fn
  }

  /** 版本设置页左栏子项切换（同一副页面内换内容）。 */
  function setInstanceTab(tab: InstanceTab) {
    if (route.value.meta.sub === 'instance') {
      void router.replace(`/instance/${route.value.params.instanceId}/${tab}`)
    }
  }

  /** 版本设置页某个面板的刷新（不跳转，只让面板重新加载数据）。 */
  function reloadInstanceTab(tab: string) {
    instanceReloads.value = {
      ...instanceReloads.value,
      [tab]: (instanceReloads.value[tab] ?? 0) + 1,
    }
  }

  /* ------------------------------- 全局数据 ------------------------------- */
  const ready = ref(false)
  const initError = ref<string | null>(null)
  const browserMode = ref(!('__TAURI_INTERNALS__' in window))
  const session = ref<Session | null>(null)
  const settings = ref<Settings>({ ...DEFAULT_SETTINGS })
  const instances = ref<GameInstance[]>([])
  const theme = ref<'system' | 'light' | 'dark'>('system')
  const pendingAnnouncements = ref<Announcement[]>([])
  const updateAvailable = ref(false)

  /* ------------------------------- 版本信息 ------------------------------- */
  /** 启动器版本：运行时从 Tauri 读取（tauri.conf.json 的 version）；浏览器预览用基线值。 */
  const appVersion = ref(APP_VERSION_FALLBACK)
  /** 内核版本：aelux-core 的 CARGO_PKG_VERSION，经 get_core_version 命令读取。 */
  const coreVersion = ref('preview')

  /* ------------------------------ 版本 / 下载 ----------------------------- */
  const versions = ref<VersionEntry[]>([])
  const versionsLoading = ref(false)
  const versionsError = ref<string | null>(null)
  const installing = ref<string | null>(null)
  const installError = ref<string | null>(null)
  /** 用户是否点了「取消下载」：下载被中止后用于区分「失败」与「已取消」。 */
  const cancelRequested = ref(false)
  const downloadState = ref<DownloadManagerState>({
    tasks: [],
    active: 0,
    done: 0,
    failed: 0,
    pending: 0,
    finished: true,
  })

  /** 启动进度（内核 LaunchProgress 事件；null = 当前没有启动流程）。 */
  const launchProgress = ref<{
    instanceId: string
    stage: string
    message: string
    current: number
    total: number
    done: boolean
    error: string | null
  } | null>(null)

  /** 是否正在启动：标题栏指示器与任务页的显示条件。 */
  const launchActive = computed(() => !!launchProgress.value && !launchProgress.value.done)

  /** 是否有正在进行的下载 / 启动：标题栏下载指示器的显示条件。 */
  const downloadActive = computed(
    () =>
      installing.value !== null ||
      launchActive.value ||
      (downloadState.value.tasks.length > 0 && !downloadState.value.finished),
  )

  /** 正在运行的游戏进程（内核 running_instances 的缓存）。 */
  const runningInstances = ref<RunningGame[]>([])

  /* --------------------------------- 联机 --------------------------------- */
  /** 联机广场房间（自己的房间排在最前）。 */
  const rooms = ref<MultiplayerRoom[]>([])

  /* ------------------------------ 启动日志 ------------------------------ */
  /** 启动过程日志（任务管理页展示；最多保留 200 条）。 */
  const launchLogs = ref<string[]>([])

  function pushLaunchLog(line: string) {
    launchLogs.value = [...launchLogs.value.slice(-200), line]
  }

  function clearLaunchLogs() {
    launchLogs.value = []
  }

  /* ------------------------------ 崩溃报告 ------------------------------ */
  /** 非 0 退出码时加载的崩溃报告（null = 不显示弹窗）。 */
  const crashInfo = ref<CrashInfo | null>(null)

  /** 用户主动结束的实例：这类非 0 退出不算崩溃。 */
  const intentionallyKilled = new Set<string>()

  /** 解析内核退出消息（`游戏进程已退出（实例 xxx，退出码 n）`）。 */
  function parseExitMessage(text: string): { instanceId: string; code: number } | null {
    const m = /游戏进程已退出（实例\s*(.+?)，退出码\s*(-?\d+)）/.exec(text)
    if (!m) return null
    return { instanceId: m[1], code: Number(m[2]) }
  }

  /** 读取崩溃报告并弹窗（优先游戏 crash-reports，回退启动器日志）。 */
  async function loadCrashReport(instanceId: string, exitCode: number) {
    const inst = instances.value.find((i) => i.id === instanceId)
    const base = {
      instanceId,
      instanceName: inst?.name ?? instanceId,
      exitCode,
    }
    try {
      const report = await call<{ path: string; content: string; fromGame: boolean }>(
        'read_crash_report',
        { instanceId },
      )
      crashInfo.value = { ...base, ...report }
    } catch (e) {
      crashInfo.value = {
        ...base,
        path: '',
        content: `读取崩溃报告失败：${(e as Error).message}`,
        fromGame: false,
      }
    }
  }

  function dismissCrash() {
    crashInfo.value = null
  }

  /* ------------------------------- 社区资源 ------------------------------- */
  const resourceKind = ref<ResourceKind>('mod')
  const resourceQuery = ref<ResourceQuery>({
    name: '',
    source: 'all',
    gameVersion: '',
    loader: '',
    category: '',
  })
  const resourceTotal = ref(0)
  const resourcePage = ref(0)
  const resourcePageSize = RESOURCE_PAGE_SIZE
  const resourceProjects = ref<ResourceProject[]>([])
  const resourceLoading = ref(false)
  const resourceError = ref<string | null>(null)
  const resourceDetailData = ref<ResourceDetailData | null>(null)
  const resourceDetailLoading = ref(false)
  /** 搜索结果缓存：切换资源类型 / 来源 / 翻页时复用，避免重复请求。 */
  const resourceCache = new Map<string, { projects: ResourceProject[]; total: number }>()
  const RESOURCE_CACHE_LIMIT = 24
  /** 搜索请求序号：切换筛选/翻页时丢弃过期响应。 */
  let resourceSearchToken = 0

  /* ------------------------------- 实例设置 ------------------------------- */
  const instanceSettings = ref<Record<string, Record<string, unknown>>>({})

  /** 版本设置页的刷新计数：侧栏「刷新」按钮累加，对应面板 watch 后重新加载数据。 */
  const instanceReloads = ref<Record<string, number>>({})

  /* --------------------------------- 动作 --------------------------------- */

  /* 系统主题监听：偏好为「跟随系统」时随系统深浅色实时切换 */
  const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)')

  /** 偏好 → 实际生效的深浅色。 */
  function resolveTheme(t: 'system' | 'light' | 'dark'): 'light' | 'dark' {
    if (t !== 'system') return t
    return systemDarkQuery.matches ? 'dark' : 'light'
  }

  function applyTheme(t: 'system' | 'light' | 'dark', persist: boolean) {
    document.documentElement.setAttribute('data-theme', resolveTheme(t))
    theme.value = t
    if (persist) void call('kv_set', { key: 'theme', value: t })
  }
  const setTheme = (t: 'system' | 'light' | 'dark') => applyTheme(t, true)

  systemDarkQuery.addEventListener('change', () => {
    if (theme.value === 'system') applyTheme('system', false)
  })

  /* --------------------------- 内核事件订阅 --------------------------- */

  /** 重新计算下载状态计数（任务页 / 首页进度共用）。 */
  function recomputeDownloadState() {
    const ds = downloadState.value
    const tasks = ds.tasks
    ds.active = tasks.filter((t) => t.status === 'downloading').length
    ds.done = tasks.filter((t) => t.status === 'done').length
    ds.failed = tasks.filter((t) => t.status === 'failed').length
    ds.pending = tasks.filter((t) => t.status === 'pending').length
    ds.finished = tasks.length > 0 && ds.pending === 0 && ds.active === 0
  }

  /**
   * 登记一条单文件下载任务，返回任务 id。
   * 进度由内核 `DownloadProgress` 事件按同一 id 回填。
   */
  function beginDownloadTask(name: string, url: string): string {
    const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ds = downloadState.value
    ds.tasks = [
      ...ds.tasks,
      { id, name, url, received: 0, total: 0, status: 'downloading' },
    ]
    ds.finished = false
    recomputeDownloadState()
    return id
  }

  /** 按 id 更新任务状态（进度事件会替换任务对象，不能持有旧引用）。 */
  function settleDownloadTask(
    id: string,
    status: 'done' | 'failed',
    error?: string,
  ) {
    const ds = downloadState.value
    ds.tasks = ds.tasks.map((t) => (t.id === id ? { ...t, status, error } : t))
    recomputeDownloadState()
  }

  /** 进度事件合并：100ms 内同 taskId 只保留最新值，避免上万条事件逐条触发 Vue 更新。 */
  type ProgressEvent = Extract<CoreEvent, { type: 'DownloadProgress' }>
  const pendingProgress = new Map<string, ProgressEvent>()
  let progressTimer: ReturnType<typeof setTimeout> | null = null

  function queueDownloadProgress(ev: ProgressEvent) {
    pendingProgress.set(ev.taskId, ev)
    if (progressTimer === null) progressTimer = setTimeout(flushDownloadProgress, 100)
  }

  /** 批量写入任务列表（同 taskId 覆盖，未知则追加）并只重算一次总进度。 */
  function flushDownloadProgress() {
    progressTimer = null
    if (pendingProgress.size === 0) return
    const batch = Array.from(pendingProgress.values())
    pendingProgress.clear()
    const ds = downloadState.value
    const tasks = ds.tasks.slice()
    for (const ev of batch) {
      const idx = tasks.findIndex((t) => t.id === ev.taskId)
      const complete = ev.total > 0 && ev.received >= ev.total
      const next: DownloadTaskState = {
        id: ev.taskId,
        name: ev.name,
        url: '',
        received: ev.received,
        total: ev.total,
        status: complete ? 'done' : 'downloading',
      }
      if (idx >= 0) tasks[idx] = { ...tasks[idx], ...next, url: tasks[idx].url }
      else tasks.push(next)
    }
    downloadState.value = { ...ds, tasks }
    recomputeDownloadState()
  }

  /** 安装结束（成功 / 失败）时统一收尾仍在下载的任务。 */
  function finishDownloadTasks(status: 'done' | 'failed') {
    flushDownloadProgress()
    const ds = downloadState.value
    downloadState.value = {
      ...ds,
      tasks: ds.tasks.map((t) =>
        t.status === 'downloading' || t.status === 'pending' ? { ...t, status } : t,
      ),
    }
    recomputeDownloadState()
  }

  /** 订阅内核事件（下载进度 / 游戏日志 / 提示）。 */
  async function subscribeCoreEvents() {
    if (!isTauri) return
    try {
      const { listen } = await import('@tauri-apps/api/event')
      await listen<CoreEvent>('core-event', (event) => {
        const ev = event.payload
        if (ev.type === 'DownloadProgress') {
          queueDownloadProgress(ev)
        } else if (ev.type === 'LaunchProgress') {
          launchProgress.value = {
            instanceId: ev.instanceId,
            stage: ev.stage,
            message: ev.message,
            current: ev.current,
            total: ev.total,
            done: ev.done,
            error: ev.error ?? null,
          }
          pushLaunchLog(`[启动] ${ev.message}`)
        } else if (ev.type === 'Log') {
          pushLaunchLog(ev.line)
        } else if (ev.type === 'Message') {
          pushLaunchLog(`[${ev.level}] ${ev.text}`)
          if (ev.level === 'error') toast.error(ev.text)
          // 非 0 退出码 → 弹窗展示崩溃日志（用户主动结束进程时跳过）
          const exit = parseExitMessage(ev.text)
          if (exit && exit.code !== 0) {
            if (intentionallyKilled.delete(exit.instanceId)) return
            void loadCrashReport(exit.instanceId, exit.code)
          }
        }
      })
    } catch {
      /* 浏览器预览环境没有 Tauri 事件总线 */
    }
  }

  async function init() {
    // 先判断运行环境：浏览器预览没有内核，后续 kv/命令读取失败时仍要能正确降级。
    browserMode.value = !('__TAURI_INTERNALS__' in window)
    let savedTheme: string | null = null
    try {
      savedTheme = await kvGet('theme')
    } catch {
      /* 浏览器预览环境没有内核 KV */
    }
    applyTheme(
      savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system' ? savedTheme : 'system',
      false,
    )
    initError.value = null

    // 内核事件订阅（下载进度 / 启动日志），失败不影响启动
    void subscribeCoreEvents()

    // 版本信息：启动器版本来自 Tauri 运行时，内核版本来自内核命令
    try {
      const { getVersion } = await import('@tauri-apps/api/app')
      appVersion.value = (await getVersion()) || APP_VERSION_FALLBACK
    } catch {
      /* 浏览器预览环境：保留基线值 */
    }
    try {
      coreVersion.value = await call<string>('get_core_version')
    } catch {
      /* 预览环境无内核 */
    }

    // 逐段容错：任何一段失败都不应把启动器卡死。
    // 关键：本地数据与网络清单并行加载。版本清单是最慢一段（走网络，最坏要等超时），
    // 串行会让账户 / 实例 / 设置全部排在它后面，整页数据要等很久才出来。
    await Promise.allSettled([
      loadVersions(),
      refreshInstances(),
      restoreSession(),
      loadAccounts(),
      loadAuthServers(),
      kvGet('login-mode').then((savedMode) => {
        if (savedMode === 'official' || savedMode === 'third' || savedMode === 'offline') {
          loginMode.value = savedMode
        }
      }),
      call<string>('get_data_dir').then((dir) => {
        dataDir.value = dir
      }),
      call<string | null>('detect_official_minecraft').then((path) => {
        officialFolderPath.value = path ?? ''
      }),
      loadAddedFolders(),
      loadSettings(),
      loadRooms(),
      pullAnnouncements().then((list) => {
        pendingAnnouncements.value = list
      }),
      call<string>('read_local_update').then((raw) => {
        updateAvailable.value = raw.trim().length > 0
      }),
    ])
    if (!officialFolderPath.value && selectedFolderId.value === 'official') {
      selectedFolderId.value = 'current'
    }
    ready.value = true
  }

  async function loadVersions() {
    versionsLoading.value = true
    versionsError.value = null
    try {
      const manifest = await call<{ latest: { release: string; snapshot: string }; versions: VersionEntry[] }>(
        'fetch_minecraft_manifest',
      )
      versions.value = manifest.versions
    } catch (e) {
      versionsError.value = (e as Error).message
    } finally {
      versionsLoading.value = false
    }
  }

  async function refreshInstances() {
    const list = await call<GameInstance[]>('get_instances')
    if (Array.isArray(list)) instances.value = list
  }

  async function createInstance(
    name: string,
    version: string,
    loader?: string,
    loaderVersion?: string,
  ): Promise<GameInstance> {
    const inst = await call<GameInstance>('create_instance', {
      name,
      version,
      loader: loader ?? null,
      loaderVersion: loaderVersion ?? null,
    })
    instances.value = [...instances.value, inst]
    return inst
  }

  async function deleteInstance(id: string) {
    await call('delete_instance', { id })
    instances.value = instances.value.filter((i) => i.id !== id)
  }

  /** 启动实例：内核拉起进程并回传 pid，日志经 core-event 流入任务页。 */
  async function launchInstance(id: string): Promise<LaunchResult | null> {
    const inst = instances.value.find((i) => i.id === id)
    if (!inst) return null
    pushLaunchLog(`正在启动 ${inst.name}…`)
    launchProgress.value = {
      instanceId: id,
      stage: 'prepare',
      message: '准备启动实例',
      current: 0,
      total: 8,
      done: false,
      error: null,
    }
    try {
      const outcome = await call<LaunchOutcome>('launch_instance', { id })
      runningInstances.value = [
        ...runningInstances.value.filter((r) => r.instanceId !== id),
        { instanceId: id, pid: outcome.pid },
      ]
      // 事件丢失时兜底标记完成，避免任务页一直停在“启动中”
      launchProgress.value = {
        ...launchProgress.value!,
        stage: 'spawn',
        message: '游戏进程已启动',
        current: 8,
        done: true,
        error: null,
      }
      // 内核回写游玩时长，刷新列表让首页显示最新状态
      void refreshInstances().catch(() => {})
      return { ok: true, pid: outcome.pid }
    } catch (e) {
      const message = (e as Error).message
      pushLaunchLog(`启动失败：${message}`)
      launchProgress.value = {
        ...launchProgress.value!,
        stage: 'failed',
        message: '启动失败',
        done: true,
        error: message,
      }
      return { ok: false, error: message }
    }
  }

  /** 结束实例进程。 */
  async function killInstance(id: string): Promise<boolean> {
    try {
      const ok = await call<boolean>('kill_instance', { id })
      if (ok) {
        intentionallyKilled.add(id)
        runningInstances.value = runningInstances.value.filter((r) => r.instanceId !== id)
        pushLaunchLog('已请求结束游戏进程')
      }
      return ok
    } catch (e) {
      toast.error(`结束进程失败：${(e as Error).message}`)
      return false
    }
  }

  /** 刷新运行中列表（任务页进入时调用）。 */
  async function refreshRunningInstances() {
    try {
      runningInstances.value = await call<RunningGame[]>('running_instances')
    } catch {
      runningInstances.value = []
    }
  }

  /* ------------------------------- 安装版本 ------------------------------- */

  /**
   * 安装版本（全部交给内核安装器）：
   *   1. 建立实例（记录加载器与加载器版本）
   *   2. `install_instance` 下载版本 JSON / 客户端 / 依赖库 / 资源并解压 natives
   *   3. 可选安装前置 API（Fabric API / QSL）
   * 进度经 `core-event` 实时写入 downloadState，任务管理页可见。
   */
  async function installVersion(
    id: string,
    meta?: {
      name?: string
      loader?: string
      loaderVersion?: string
      modApi?: { api: 'fabric-api' | 'qsl'; version?: string }
    },
  ): Promise<boolean> {
    if (installing.value) return false
    installing.value = id
    installError.value = null
    cancelRequested.value = false
    downloadState.value = {
      tasks: [],
      active: 0,
      done: 0,
      failed: 0,
      pending: 0,
      finished: false,
    }

    try {
      const loader = meta?.loader ?? 'vanilla'
      const inst = await createInstance(
        meta?.name?.trim() || id,
        id,
        loader,
        meta?.loaderVersion,
      )
      await call<InstallResult>('install_instance', { id: inst.id })
      if (meta?.modApi) {
        await call('install_mod_api', {
          instanceId: inst.id,
          api: meta.modApi.api,
          mcVersion: id,
          version: meta.modApi.version ?? null,
        })
      }
      finishDownloadTasks('done')
      await refreshInstances()
      return true
    } catch (e) {
      installError.value = cancelRequested.value ? '下载已取消' : (e as Error).message
      finishDownloadTasks('failed')
      return false
    } finally {
      installing.value = null
    }
  }

  /** 取消当前下载任务：内核检测到取消标记后中止并清理临时文件。 */
  async function cancelDownload() {
    if (!downloadActive.value) return
    cancelRequested.value = true
    try {
      await call('cancel_download')
    } catch (e) {
      toast.error(`取消下载失败：${(e as Error).message}`)
    }
  }

  /** 拉取版本 JSON（含 client / server 下载地址）。 */
  async function fetchVersionJson(id: string): Promise<VersionJson> {
    const entry = versions.value.find((v) => v.id === id)
    if (!entry) throw new Error('版本不存在')
    const raw = await call<string>('fetch_json', { url: entry.url })
    return JSON.parse(raw) as VersionJson
  }

  /**
   * 另存为：选位置保存客户端 jar。
   * 对话框取消返回 null；成功返回保存路径（绝对路径，内核 join 语义下可直接落盘）。
   */
  async function saveVersionClient(id: string): Promise<string | null> {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const path = await save({
      defaultPath: `${id}.jar`,
      filters: [{ name: 'Minecraft 客户端', extensions: ['jar'] }],
    })
    if (!path) return null
    const json = await fetchVersionJson(id)
    const client = json.downloads?.client
    if (!client) throw new Error('该版本没有提供客户端下载')
    const taskId = beginDownloadTask(`${id}.jar`, client.url)
    try {
      await call('download_file', {
        url: client.url,
        dest: path,
        sha1: client.sha1,
        taskId,
        name: `${id}.jar`,
      })
      settleDownloadTask(taskId, 'done')
      return path
    } catch (e) {
      settleDownloadTask(taskId, 'failed', (e as Error).message)
      throw e
    }
  }

  /** 下载服务端 jar 到数据目录 minecraft/servers/<id>/server.jar，返回落盘路径。 */
  async function downloadVersionServer(id: string): Promise<string> {
    const json = await fetchVersionJson(id)
    const server = json.downloads?.server
    if (!server) throw new Error('该版本没有提供服务端下载')
    const dest = `minecraft/servers/${id}/server.jar`
    const taskId = beginDownloadTask(`server-${id}.jar`, server.url)
    try {
      await call('download_file', {
        url: server.url,
        dest,
        sha1: server.sha1,
        taskId,
        name: `server-${id}.jar`,
      })
      settleDownloadTask(taskId, 'done')
      return dest
    } catch (e) {
      settleDownloadTask(taskId, 'failed', (e as Error).message)
      throw e
    }
  }

  /* ----------------------------- 加载器版本列表 ----------------------------- */

  interface LoaderVersionsState {
    loading: boolean
    loaded: boolean
    versions: string[]
    error: string | null
  }

  /** 加载器版本列表缓存（key = `loader:mcVersion`），按需展开时拉取。 */
  const loaderVersions = ref<Record<string, LoaderVersionsState>>({})

  /** 前置 API（Fabric API / QSL）版本列表缓存（key = `api:mcVersion`）。 */
  const modApiVersions = ref<Record<string, LoaderVersionsState>>({})

  /** 拉取加载器版本：来源白名单与解析都在内核，前端只拿字符串列表。 */
  async function loadLoaderVersions(loader: string, mcVersion: string) {
    const key = `${loader}:${mcVersion}`
    const st = loaderVersions.value[key]
    if (st?.loading || st?.loaded) return
    loaderVersions.value[key] = { loading: true, loaded: false, versions: [], error: null }
    try {
      const versions = await call<string[]>('loader_versions', { loader, mcVersion })
      loaderVersions.value[key] = { loading: false, loaded: true, versions, error: null }
    } catch (e) {
      loaderVersions.value[key] = {
        loading: false,
        loaded: false,
        versions: [],
        error: (e as Error).message,
      }
    }
  }

  /** 拉取前置 API 版本（Modrinth 来源由内核负责）。 */
  async function loadModApiVersions(api: string, mcVersion: string) {
    const key = `${api}:${mcVersion}`
    const st = modApiVersions.value[key]
    if (st?.loading || st?.loaded) return
    modApiVersions.value[key] = { loading: true, loaded: false, versions: [], error: null }
    try {
      const versions = await call<string[]>('mod_api_versions', { api, mcVersion })
      modApiVersions.value[key] = { loading: false, loaded: true, versions, error: null }
    } catch (e) {
      modApiVersions.value[key] = {
        loading: false,
        loaded: false,
        versions: [],
        error: (e as Error).message,
      }
    }
  }

  /* ------------------------------- 游戏文件夹 ------------------------------- */

  /** 数据根目录（当前文件夹路径的根，init 时读取）。 */
  const dataDir = ref('')

  /** 官方启动器 .minecraft 路径：检测到才非空，未检测到就不显示官方文件夹卡片。 */
  const officialFolderPath = ref('')

  /** 用户添加的游戏文件夹（落 kv 'game-folders'；当前/官方文件夹为派生态）。 */
  const addedFolders = ref<StoredFolder[]>([])

  async function loadAddedFolders() {
    const raw = await kvGet('game-folders')
    addedFolders.value = raw ? (JSON.parse(raw) as StoredFolder[]) : []
  }

  async function persistAddedFolders() {
    await call('kv_set', { key: 'game-folders', value: JSON.stringify(addedFolders.value) })
  }

  /** 版本选择页的文件夹列表：当前文件夹 + 官方文件夹（仅检测到）+ 添加的文件夹。 */
  const gameFolders = computed<StoredFolder[]>(() => {
    const list: StoredFolder[] = [
      {
        id: 'current',
        type: 'current',
        path: dataDir.value ? `${dataDir.value}/.minecraft` : '',
      },
    ]
    if (officialFolderPath.value) {
      list.push({ id: 'official', type: 'official', path: officialFolderPath.value })
    }
    list.push(...addedFolders.value)
    return list
  })

  /** 版本选择页当前选中的文件夹（决定内容区显示哪个文件夹的实例）。 */
  const selectedFolderId = ref('current')

  function selectFolder(id: string) {
    selectedFolderId.value = id
  }

  /** 文件夹展示名：内置类型用固定名，添加的取路径末段。 */
  function folderDisplayName(f: StoredFolder): string {
    if (f.type === 'current') return '当前文件夹'
    if (f.type === 'official') return '官方文件夹'
    const tail = f.path.split(/[\\/]/).filter(Boolean).pop()
    return tail || f.path || '文件夹'
  }

  /** 添加已有文件夹（Tauri 目录对话框；浏览器预览退化为路径输入）。 */
  async function addGameFolder(): Promise<void> {
    let path: string | null = null
    if (isTauri) {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const picked = await open({ directory: true, multiple: false })
      if (typeof picked === 'string') path = picked
      else if (Array.isArray(picked)) path = picked[0] ?? null
    } else {
      const r = await promptDialog({
        title: '添加已有文件夹',
        message: '预览模式下请手动填写文件夹路径。',
        fields: [{ key: 'path', label: '文件夹路径', placeholder: '例如 D:/Games/.minecraft' }],
        confirmText: '添加',
      })
      path = r?.path.trim() || null
    }
    if (!path) return
    if (addedFolders.value.some((f) => f.path === path)) {
      toast.info('该文件夹已在列表中')
      return
    }
    addedFolders.value = [
      ...addedFolders.value,
      { id: `folder-${Date.now()}`, type: 'added', path },
    ]
    await persistAddedFolders()
  }

  /** 删除已添加的文件夹（当前 / 官方文件夹不可删）。 */
  async function removeGameFolder(id: string) {
    addedFolders.value = addedFolders.value.filter((f) => f.id !== id)
    await persistAddedFolders()
  }

  /** 导入整合包（.mrpack / 自导出 ZIP）：内核创建实例并落盘内容。 */
  async function importModpack(): Promise<GameInstance | null> {
    if (installing.value) return null
    let picked: string | null = null
    if (isTauri) {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({
        multiple: false,
        filters: [{ name: '整合包', extensions: ['mrpack', 'zip'] }],
      })
      if (typeof selected !== 'string' || !selected) return null
      picked = selected
    } else {
      toast.info('浏览器预览环境不支持导入整合包')
      return null
    }

    installing.value = picked
    installError.value = null
    cancelRequested.value = false
    try {
      const result = await call<ModpackImportResult>('import_modpack', {
        source: picked,
        name: null,
      })
      instances.value = [...instances.value, result.instance]
      toast.success(`整合包已导入：${result.instance.name}（${result.files} 个文件）`)
      return result.instance
    } catch (e) {
      installError.value = cancelRequested.value ? '下载已取消' : (e as Error).message
      toast.error(`导入整合包失败：${(e as Error).message}`)
      return null
    } finally {
      installing.value = null
    }
  }

  /* ----------------------------- 资源安装 / 更新 ----------------------------- */

  /** 把 Modrinth 资源直接安装进实例目录（同名覆盖）。 */
  async function installResource(
    instanceId: string,
    kind: string,
    url: string,
    fileName: string,
    sha1?: string | null,
  ): Promise<LocalContentItem | null> {
    try {
      const item = await call<LocalContentItem>('install_resource', {
        instanceId,
        kind,
        url,
        fileName,
        sha1: sha1 ?? null,
      })
      toast.success(`已安装 ${item.name}`)
      const TAB_BY_KIND: Record<string, string> = {
        mods: 'mod',
        resourcepacks: 'resourcepack',
        shaderpacks: 'resourcepack',
        saves: 'world',
        schematics: 'schematic',
      }
      const tab = TAB_BY_KIND[kind]
      if (tab) reloadInstanceTab(tab)
      return item
    } catch (e) {
      toast.error(`安装失败：${(e as Error).message}`)
      return null
    }
  }

  /** 从远端直接安装整合包（Modrinth / CurseForge 下载地址）：内核下载后新建实例。 */
  async function installModpackFromUrl(url: string, name?: string | null): Promise<GameInstance | null> {
    if (installing.value) return null
    installing.value = url
    installError.value = null
    cancelRequested.value = false
    try {
      const result = await call<ModpackImportResult>('import_modpack_url', {
        url,
        name: name ?? null,
      })
      instances.value = [...instances.value, result.instance]
      toast.success(`整合包已安装：${result.instance.name}（${result.files} 个文件）`)
      return result.instance
    } catch (e) {
      installError.value = cancelRequested.value ? '下载已取消' : (e as Error).message
      toast.error(`安装整合包失败：${(e as Error).message}`)
      return null
    } finally {
      installing.value = null
    }
  }

  /** 检查 Mod 更新（Modrinth 哈希反查）。 */
  async function checkModUpdates(instanceId: string): Promise<ModUpdate[]> {
    try {
      return await call<ModUpdate[]>('check_mod_updates', { instanceId })
    } catch (e) {
      toast.error(`检查更新失败：${(e as Error).message}`)
      return []
    }
  }

  /** 应用单条 Mod 更新：下载新文件并删除旧文件。 */
  async function applyModUpdate(instanceId: string, update: ModUpdate): Promise<boolean> {
    try {
      await call('install_resource', {
        instanceId,
        kind: 'mods',
        url: update.downloadUrl,
        fileName: update.newFileName,
        sha1: update.sha1 ?? null,
      })
      if (update.newFileName !== update.fileName) {
        await call('delete_content', {
          instanceId,
          kind: 'mods',
          fileName: update.fileName,
        })
      }
      toast.success(`已更新 ${update.projectTitle} → ${update.latestVersion}`)
      reloadInstanceTab('mod')
      return true
    } catch (e) {
      toast.error(`更新 ${update.projectTitle} 失败：${(e as Error).message}`)
      return false
    }
  }

  /** 导出启动脚本（.bat / .sh），返回落盘路径。 */
  async function exportLaunchScript(instanceId: string): Promise<string | null> {
    try {
      const path = await call<string>('export_launch_script', { id: instanceId })
      toast.success(`启动脚本已导出：${path}`)
      return path
    } catch (e) {
      toast.error(`导出启动脚本失败：${(e as Error).message}`)
      return null
    }
  }

  /** 导出整合包（ZIP 快照），返回落盘路径。 */
  async function exportModpack(instanceId: string): Promise<string | null> {
    try {
      const path = await call<string>('export_modpack', { instanceId })
      toast.success(`整合包已导出：${path}`)
      return path
    } catch (e) {
      toast.error(`导出整合包失败：${(e as Error).message}`)
      return null
    }
  }

  /** 在线安装 Temurin JRE，并写回 javaPath 设置。 */
  async function installJava(major: number): Promise<JavaInstallResult | null> {
    try {
      const result = await call<JavaInstallResult>('install_java', { major })
      await saveSettings({ javaPath: result.runtime.path })
      toast.success(`Java ${major} 已安装：${result.runtime.path}`)
      return result
    } catch (e) {
      toast.error(`安装 Java 失败：${(e as Error).message}`)
      return null
    }
  }

  interface VersionJson {
    downloads?: Record<string, { url: string; size: number; sha1: string }>
    libraries?: Array<{
      name: string
      downloads?: {
        artifact?: { path: string; url: string; size: number; sha1: string }
      }
      rules?: Array<{ action: string; os?: { name?: string } }>
    }>
    assetIndex?: { id: string; url: string; size: number; sha1: string }
  }

  /* --------------------------------- 会话 --------------------------------- */

  async function restoreSession() {
    // 会话真相源在内核（accounts.session.get）
    session.value = await call<Session | null>('account_session_get')
  }

  /* ------------------------------- 多账户管理 ------------------------------- */

  /** 账户列表（微软 / 离线多账户并存；内核 accounts.list）。 */
  const accounts = ref<StoredAccount[]>([])

  async function loadAccounts() {
    // 成功才覆盖：刷新失败时保留旧列表，避免页面被清空。
    const list = await call<StoredAccount[]>('accounts_list')
    if (Array.isArray(list)) accounts.value = list
  }

  /** 把账户设为当前会话（内核 accounts.session.set）。 */
  async function applyAccount(acc: StoredAccount) {
    const s: Session = {
      type: acc.type === 'microsoft' ? 'microsoft' : 'offline',
      username: acc.username,
      uuid: acc.uuid,
    }
    session.value = s
    await call('account_session_set', { session: { type: s.type, username: s.username, uuid: s.uuid } })
  }

  /** 微软账户（内核登录成功）入列并设为当前；重复登录同账户则更新。 */
  async function addMicrosoftAccount(a: Account) {
    const acc: StoredAccount = {
      id: a.msaId,
      type: 'microsoft',
      username: a.username,
      uuid: a.uuid,
      loggedInAt: a.loggedInAt,
    }
    await call('accounts_upsert', { account: acc })
    setLoginMode('official')
    await applyAccount(acc)
    await loadAccounts()
  }

  /** 切换当前账户（账户页单选）。 */
  async function switchAccount(id: string) {
    const acc = accounts.value.find((a) => a.id === id)
    if (!acc) return
    setLoginMode(acc.type === 'microsoft' ? 'official' : 'offline')
    await applyAccount(acc)
  }

  /** 移除账户（内核一并处理当前会话与微软钥匙串凭证）。 */
  async function removeAccount(id: string) {
    if (!accounts.value.some((a) => a.id === id)) return
    await call('accounts_remove', { id })
    await loadAccounts()
    await restoreSession()
  }

  /** 离线登录：内核派生 UUID、入列并设为当前（多离线账户并存）。 */
  async function loginOffline(username: string) {
    if (!username.trim()) throw new Error('用户名不能为空')
    const acc = await call<StoredAccount>('account_login_offline', { username })
    setLoginMode('offline')
    session.value = { type: 'offline', username: acc.username, uuid: acc.uuid }
    await loadAccounts()
  }

  /* --------------------------- 外置登录服务器 --------------------------- */

  /** 已添加的认证服务器（真相源在内核 authservers.list）。 */
  const authServers = ref<AuthServer[]>([])

  async function loadAuthServers() {
    const list = await call<AuthServer[]>('auth_servers_list')
    if (Array.isArray(list)) authServers.value = list
  }

  /** 应用内刷新账户相关数据；失败的段落保留旧值，不重载页面。 */
  const refreshingAccountState = ref(false)

  async function refreshAccountState(): Promise<string[]> {
    if (refreshingAccountState.value) return []
    refreshingAccountState.value = true
    try {
      const results = await Promise.allSettled([
        loadAccounts(),
        restoreSession(),
        loadAuthServers(),
        refreshInstances(),
        refreshRunningInstances(),
      ])
      return results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)))
    } finally {
      refreshingAccountState.value = false
    }
  }

  /** 添加认证服务器（内核负责地址去重与名称回退域名）。 */
  async function addAuthServer(name: string, url: string): Promise<AuthServer> {
    const srv = await call<AuthServer>('auth_server_add', { name, url })
    authServers.value = [...authServers.value, srv]
    return srv
  }

  /** 删除认证服务器（调用方负责二次确认）。 */
  async function removeAuthServer(id: string) {
    await call('auth_server_remove', { id })
    authServers.value = authServers.value.filter((s) => s.id !== id)
  }

  /* ----------------------------- 微软设备码登录 ----------------------------- */

  /** 设备码流 UI 状态机：starting → waiting →(轮询)→ success / error。 */
  const deviceFlow = ref<DeviceFlowState>({ status: 'idle', userCode: '', verificationUri: '', error: '' })

  let pollTimer: number | null = null

  function stopPolling() {
    if (pollTimer !== null) {
      window.clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  /** 发起微软登录：拿设备码 → 自动打开验证页 → 按 interval 轮询。 */
  async function startMicrosoftLogin() {
    stopPolling()
    deviceFlow.value = { status: 'starting', userCode: '', verificationUri: '', error: '' }
    try {
      const s = await call<DeviceCodeSession>('auth_start_device_flow')
      deviceFlow.value = {
        status: 'waiting',
        userCode: s.userCode,
        verificationUri: s.verificationUri,
        error: '',
      }
      void call('open_external', { url: s.verificationUri }).catch(() => {})
      schedulePoll(s)
    } catch (e) {
      deviceFlow.value = { status: 'error', userCode: '', verificationUri: '', error: (e as Error).message }
    }
  }

  function schedulePoll(s: DeviceCodeSession) {
    pollTimer = window.setTimeout(() => void pollOnce(s), Math.max(1000, s.interval * 1000))
  }

  async function pollOnce(s: DeviceCodeSession) {
    try {
      const a = await call<Account>('auth_poll_device_flow', { session: s })
      await addMicrosoftAccount(a)
      deviceFlow.value = { ...deviceFlow.value, status: 'success' }
    } catch (e) {
      const msg = (e as Error).message
      if (msg.includes('等待') || msg.includes('稍候')) {
        // slow_down 按 RFC 8628 拉长轮询间隔（每次 +5 秒），避免被服务端持续限流
        const next: DeviceCodeSession = msg.includes('稍候')
          ? { ...s, interval: Math.min(60, s.interval + 5) }
          : s
        schedulePoll(next) // pending：继续按 interval 轮询
      } else {
        deviceFlow.value = { ...deviceFlow.value, status: 'error', error: msg }
      }
    }
  }

  /** 关闭登录弹窗：停止轮询并复位状态。 */
  function cancelMicrosoftLogin() {
    stopPolling()
    deviceFlow.value = { status: 'idle', userCode: '', verificationUri: '', error: '' }
  }

  /* ------------------------------- 登录方式 ------------------------------- */

  /** 登录方式偏好：启动页展示与登录按钮依据（会话存在时展示跟随会话）。 */
  const loginMode = ref<'official' | 'third' | 'offline'>('official')

  /** 更新登录方式偏好并持久化（登录动作 / 设置页调用）。 */
  function setLoginMode(m: 'official' | 'third' | 'offline') {
    loginMode.value = m
    void call('kv_set', { key: 'login-mode', value: m })
  }

  async function logout() {
    session.value = null
    await call('kv_remove', { key: 'session' })
  }

  /* --------------------------------- 设置 --------------------------------- */

  async function loadSettings() {
    const raw = await kvGet('settings')
    settings.value = raw
      ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
      : { ...DEFAULT_SETTINGS }
    // 启动时把界面设置回写内核配置，保证内存 / Java 路径与界面一致
    await saveSettings({})
  }

  /**
   * 保存设置：界面层写 kv（供各页面读取），同时把启动相关字段同步到内核
   * `data/config/launcher.json` —— 启动器读取的是内核配置，不写这里会不生效。
   */
  async function saveSettings(patch: Partial<Settings>) {
    settings.value = { ...settings.value, ...patch }
    const next = settings.value
    // 缓存目录 / 窗口偏好 / 并发线程都存在界面层扩展字段里（SettingsExtras）。
    const extras = readExtras(next)
    const cacheDir =
      extras.cacheFolderMode === 'custom' ? (extras.cacheFolderPath ?? '').trim() : ''
    const gameFullscreen = extras.windowSize === 'fullscreen'
    await Promise.all([
      call('kv_set', { key: 'settings', value: JSON.stringify(next) }),
      call('save_config', {
        config: {
          theme: 'light',
          language: 'zh-CN',
          javaPath: next.javaPath,
          memoryMinMb: Math.min(512, Math.max(128, next.memoryMb)),
          memoryMaxMb: Math.max(512, next.memoryMb),
          jvmArgs: [],
          gameArgs: [],
          gameWidth: 854,
          gameHeight: 480,
          gameFullscreen,
          downloadConcurrency: extras.maxParallel,
          fileSource: extras.fileSource,
          versionSource: extras.versionSource,
          hideOnLaunch: false,
          cacheDir,
        },
      }).catch(() => {
        /* 预览环境没有 save_config */
      }),
    ])
  }

  /* --------------------------------- 联机 --------------------------------- */

  /** 读取联机广场房间，并按规则清理过期房间。 */
  async function loadRooms() {
    const raw = await kvGet('multiplayer-rooms')
    const list: MultiplayerRoom[] = raw ? (JSON.parse(raw) as MultiplayerRoom[]) : []
    const now = Date.now()
    const kept: MultiplayerRoom[] = []
    let mineSeen = false
    for (const r of list) {
      // 其他用户的房间（未来由服务端同步）直接保留
      if (!r.mine) {
        kept.push(r)
        continue
      }
      // 只允许一个自己的房间
      if (mineSeen) continue
      // 未开启「退出不消失」：重启启动器即销毁
      if (!r.persist) continue
      // 超过 3 天未启动：销毁
      if (!r.expiresAt || r.expiresAt <= now) continue
      mineSeen = true
      // 仍在保留期内：重新从头计算 3 天
      kept.push({ ...r, expiresAt: now + ROOM_TTL_MS })
    }
    rooms.value = kept
    if (kept.length !== list.length) await saveRooms()
  }

  /** 保存房间列表。 */
  async function saveRooms() {
    await call('kv_set', { key: 'multiplayer-rooms', value: JSON.stringify(rooms.value) })
  }

  /** 创建自己的房间（只能有一个，保存后进入广场最前面）。 */
  async function createRoom(input: {
    name: string
    nodeId: string
    nodeLabel: string
    host: string
    port: number
    password: string
    persist: boolean
  }) {
    if (rooms.value.some((r) => r.mine)) throw new Error('只能创建一个服务器')
    const now = Date.now()
    const room: MultiplayerRoom = {
      id: `room-${now}`,
      name: input.name,
      nodeId: input.nodeId,
      nodeLabel: input.nodeLabel,
      host: input.host,
      port: input.port,
      password: input.password,
      mine: true,
      persist: input.persist,
      createdAt: now,
      expiresAt: input.persist ? now + ROOM_TTL_MS : 0,
    }
    rooms.value = [room, ...rooms.value.filter((r) => !r.mine)]
    await saveRooms()
  }

  /** 删除房间。 */
  async function removeRoom(id: string) {
    rooms.value = rooms.value.filter((r) => r.id !== id)
    await saveRooms()
  }

  /** 设置自己的房间是否在退出启动器后保留（3 天）。 */
  async function setRoomPersist(id: string, persist: boolean) {
    rooms.value = rooms.value.map((r) =>
      r.id === id && r.mine
        ? { ...r, persist, expiresAt: persist ? Date.now() + ROOM_TTL_MS : 0 }
        : r,
    )
    await saveRooms()
  }

  /* ------------------------------- 社区资源 ------------------------------- */

  /** 切换资源类型：保留来源与筛选，只清空分类并回到第一页，便于命中缓存。 */
  function setResourceKind(k: ResourceKind) {
    if (resourceKind.value === k) return
    resourceKind.value = k
    resourceProjects.value = []
    resourceTotal.value = 0
    resourcePage.value = 0
    resourceError.value = null
    resourceQuery.value = { ...resourceQuery.value, category: '' }
  }

  function setResourceQuery(patch: Partial<ResourceQuery>) {
    resourceQuery.value = { ...resourceQuery.value, ...patch }
  }

  /** 重置筛选条件（不触发检索，调用方决定何时搜索）。 */
  function resetResourceFilters() {
    resourceQuery.value = { name: '', source: 'all', gameVersion: '', loader: '', category: '' }
    resourcePage.value = 0
  }

  /** 搜索社区资源（resetPage=true 时回到第一页；翻页传 false；force=true 跳过缓存）。 */
  async function searchResources(resetPage = true, force = false) {
    if (resetPage) resourcePage.value = 0
    const token = ++resourceSearchToken
    resourceError.value = null
    const source = resourceQuery.value.source
    // Modrinth 没有 world 项目类型；选择 Modrinth 时直接返回空结果。
    if (resourceKind.value === 'world' && source === 'modrinth') {
      resourceProjects.value = []
      resourceTotal.value = 0
      resourceLoading.value = false
      return
    }
    resourceLoading.value = true

    // 光影页的「原版可用 / Iris / OptiFine」属于加载器，走 loaders facet
    const selected = RESOURCE_CATEGORIES[resourceKind.value].find(
      (item) => item.slug === resourceQuery.value.category,
    )
    const isLoaderCategory = selected?.facet === 'loader'
    const loaderFilter = isLoaderCategory ? selected.slug : resourceQuery.value.loader
    const categoryFilter = isLoaderCategory ? '' : resourceQuery.value.category

    // 同一组筛选条件命中缓存时直接还原，不再发起网络请求
    const cacheKey = [
      resourceKind.value,
      source,
      resourceQuery.value.name,
      resourceQuery.value.gameVersion,
      loaderFilter,
      categoryFilter,
      resourcePage.value,
    ].join('\u0001')
    if (!force) {
      const cached = resourceCache.get(cacheKey)
      if (cached) {
        resourceProjects.value = cached.projects
        resourceTotal.value = cached.total
        resourceLoading.value = false
        return
      }
    }

    /** Modrinth 单页结果。 */
    async function fetchModrinthPage(): Promise<{ total: number; projects: ResourceProject[] }> {
      if (resourceKind.value === 'world') return { total: 0, projects: [] }
      const url = buildResourceSearchUrl({
        kind: resourceKind.value,
        name: resourceQuery.value.name,
        gameVersion: resourceQuery.value.gameVersion,
        loader: loaderFilter,
        category: categoryFilter,
        page: resourcePage.value,
        pageSize: resourcePageSize,
      })
      const raw = await call<string>('fetch_json', { url })
      const data = JSON.parse(raw) as {
        total_hits: number
        hits: Array<{
          project_id: string
          slug: string
          title: string
          description: string
          categories: string[]
          display_categories: string[]
          downloads: number
          icon_url?: string
          date_modified: string
          author: string
          project_type?: string
          versions?: string[]
        }>
      }
      return {
        total: data.total_hits,
        projects: data.hits.map((h) => ({
          projectId: h.project_id,
          slug: h.slug,
          title: h.title,
          description: h.description,
          categories: h.categories,
          displayCategories: h.display_categories,
          downloads: h.downloads,
          iconUrl: h.icon_url ?? '',
          dateModified: h.date_modified,
          author: h.author,
          projectType: h.project_type,
          source: 'modrinth' as const,
          suffix: `.${resourceKind.value === 'mod' ? 'jar' : 'zip'}`,
          versions: h.versions ?? [],
        })),
      }
    }

    const cfParams = {
      kind: resourceKind.value,
      name: resourceQuery.value.name,
      gameVersion: resourceQuery.value.gameVersion,
      loader: loaderFilter,
      page: resourcePage.value,
      pageSize: resourcePageSize,
    }

    try {
      if (source === 'curseforge') {
        const result = await searchCurseForge(cfParams)
        if (token !== resourceSearchToken) return
        resourceTotal.value = result.total
        resourceProjects.value = result.projects
      } else if (source === 'all') {
        // 聚合模式：两个源并行；单源失败不影响另一个源
        const [mr, cf] = await Promise.allSettled([
          fetchModrinthPage(),
          searchCurseForge(cfParams),
        ])
        if (token !== resourceSearchToken) return
        const projects: ResourceProject[] = []
        let total = 0
        if (mr.status === 'fulfilled') {
          projects.push(...mr.value.projects)
          total += mr.value.total
        }
        if (cf.status === 'fulfilled') {
          projects.push(...cf.value.projects)
          total += cf.value.total
        }
        if (mr.status === 'rejected' && cf.status === 'rejected') {
          throw mr.reason instanceof Error ? mr.reason : new Error(String(mr.reason))
        }
        // 世界只有 CurseForge 能提供，Modrinth 的空结果不能掩盖 CurseForge 的真实错误
        // （例如未配置 API Key），否则会误报「没有找到相关资源」。
        if (resourceKind.value === 'world' && cf.status === 'rejected') {
          throw cf.reason instanceof Error ? cf.reason : new Error(String(cf.reason))
        }
        resourceProjects.value = projects.sort((a, b) => b.downloads - a.downloads)
        resourceTotal.value = total
      } else {
        const result = await fetchModrinthPage()
        if (token !== resourceSearchToken) return
        resourceTotal.value = result.total
        resourceProjects.value = result.projects
      }
      resourceCache.set(cacheKey, {
        projects: resourceProjects.value,
        total: resourceTotal.value,
      })
      if (resourceCache.size > RESOURCE_CACHE_LIMIT) {
        const oldest = resourceCache.keys().next().value
        if (oldest !== undefined) resourceCache.delete(oldest)
      }
    } catch (e) {
      if (token !== resourceSearchToken) return
      resourceError.value = (e as Error).message
    } finally {
      if (token === resourceSearchToken) resourceLoading.value = false
    }
  }

  /** 翻页：页码从 0 开始。 */
  function setResourcePage(page: number) {
    const next = Math.max(0, page)
    if (next === resourcePage.value) return
    resourcePage.value = next
    void searchResources(false)
  }

  async function loadResourceDetail(
    projectId: string,
    kind: ResourceKind = resourceKind.value,
  ) {
    resourceDetailLoading.value = true
    resourceDetailData.value = null
    resourceError.value = null
    try {
      // CurseForge：项目信息、描述、文件、必填依赖全部由 CurseForge 模块组装
      if (isCurseForgeProjectId(projectId)) {
        resourceDetailData.value = await loadCurseForgeDetail(projectId, kind)
        return
      }
      const raw = await call<string>('fetch_json', { url: buildResourceDetailUrl(projectId) })
      const p = JSON.parse(raw) as {
        id: string
        slug: string
        title: string
        description: string
        categories: string[]
        display_categories: string[]
        downloads: number
        icon_url?: string
        date_modified: string
        body: string
        team?: string
        project_type?: string
        /** 预览数据 / 兼容字段（正式接口没有作者名，走团队接口） */
        author?: { username?: string }
      }
      // 版本列表与团队成员并行请求；团队接口失败不影响主流程（作者名可缺省）。
      const [rawVersions, rawMembers] = await Promise.all([
        call<string>('fetch_json', { url: buildResourceVersionsUrl(projectId) }),
        p.team
          ? call<string>('fetch_json', { url: buildResourceTeamMembersUrl(p.team) }).catch(() => null)
          : Promise.resolve(null),
      ])
      let author: string | undefined
      if (rawMembers) {
        try {
          const members = JSON.parse(rawMembers) as Array<{
            user?: { username?: string }
            role?: string
            accepted?: boolean
          }>
          const active = members.filter((m) => m.accepted !== false)
          const owner =
            active.find((m) => (m.role ?? '').toLowerCase() === 'owner') ?? active[0] ?? members[0]
          author = owner?.user?.username
        } catch {
          author = undefined
        }
      }
      const vs = JSON.parse(rawVersions) as Array<{
        id: string
        name: string
        version_number: string
        version_type?: string
        game_versions: string[]
        loaders: string[]
        date_published: string
        downloads: number
        files: Array<{ url: string; filename: string; primary: boolean }>
        dependencies?: Array<{
          project_id: string | null
          version_id: string | null
          dependency_type: string
        }>
      }>
      const versions: ResourceVersion[] = vs.map((v) => {
        const file = v.files.find((f) => f.primary) ?? v.files[0]
        return {
          id: v.id,
          name: v.name,
          versionNumber: v.version_number,
          gameVersions: v.game_versions,
          loaders: v.loaders,
          datePublished: v.date_published,
          downloads: v.downloads,
          fileUrl: file?.url ?? '',
          fileName: file?.filename ?? '',
          primary: file?.primary ?? false,
          releaseType: v.version_type,
          dependencies: (v.dependencies ?? []).map((d) => ({
            projectId: d.project_id,
            versionId: d.version_id,
            type: d.dependency_type,
          })),
        }
      })

      // 前置资源：只取必填依赖，排除当前项目与 Fabric API / Quilt API
      const requiredIds: string[] = []
      for (const v of vs) {
        for (const d of v.dependencies ?? []) {
          if (d.dependency_type !== 'required' || !d.project_id) continue
          if (d.project_id === projectId || IGNORED_DEPENDENCIES.has(d.project_id)) continue
          if (!requiredIds.includes(d.project_id)) requiredIds.push(d.project_id)
        }
      }
      let dependencies: ResourceProject[] = []
      if (requiredIds.length > 0) {
        try {
          const rawDeps = await call<string>('fetch_json', {
            url: buildResourceProjectsUrl(requiredIds),
          })
          const parsed = JSON.parse(rawDeps) as Array<{
            id: string
            slug: string
            title: string
            description: string
            categories: string[]
            display_categories: string[]
            downloads: number
            icon_url?: string
            date_modified: string
            project_type?: string
          }>
          const byId = new Map(parsed.map((d) => [d.id, d]))
          dependencies = requiredIds.flatMap((id) => {
            const d = byId.get(id)
            if (!d) return []
            return [
              {
                projectId: d.id,
                slug: d.slug,
                title: d.title,
                description: d.description,
                categories: d.categories,
                displayCategories: d.display_categories,
                downloads: d.downloads,
                iconUrl: d.icon_url ?? '',
                dateModified: d.date_modified,
                projectType: d.project_type,
                source: 'modrinth' as const,
              },
            ]
          })
        } catch {
          dependencies = []
        }
      }

      // 版本行只统计「已解析的必填前置」，未解析到的依赖不计数。
      const resolvedIds = new Set(dependencies.map((d) => d.projectId))
      for (const v of versions) {
        v.dependencies = (v.dependencies ?? []).filter(
          (d) => d.type === 'required' && d.projectId && resolvedIds.has(d.projectId),
        )
      }
      // 按项目 ID 排序展示前置资源。
      dependencies = [...dependencies].sort((a, b) => a.projectId.localeCompare(b.projectId))

      resourceDetailData.value = {
        project: {
          projectId: p.id,
          slug: p.slug,
          title: p.title,
          description: p.description,
          categories: p.categories,
          displayCategories: p.display_categories,
          downloads: p.downloads,
          iconUrl: p.icon_url ?? '',
          dateModified: p.date_modified,
          author: p.author?.username ?? author,
          projectType: p.project_type,
          source: 'modrinth',
        },
        body: p.body,
        versions,
        dependencies,
      }
    } catch (e) {
      resourceError.value = (e as Error).message
    } finally {
      resourceDetailLoading.value = false
    }
  }

  /**
   * 下载资源版本文件：Tauri 下弹出保存对话框，浏览器预览落到模拟路径。
   * 取消返回 null；成功返回保存路径。下载任务在任务管理页可见。
   */
  async function saveResourceFile(v: ResourceVersion, label = '资源文件'): Promise<string | null> {
    if (!v.fileUrl) throw new Error('该版本没有可下载文件')
    const fallbackName = v.fileName || `${v.versionNumber || v.id}.jar`
    let dest: string
    if (isTauri) {
      const { save } = await import('@tauri-apps/plugin-dialog')
      const ext = fallbackName.includes('.') ? fallbackName.split('.').pop() ?? 'jar' : 'jar'
      const picked = await save({
        defaultPath: fallbackName,
        filters: [{ name: label, extensions: [ext] }],
      })
      if (!picked) return null
      dest = picked
    } else {
      dest = `preview/resources/${fallbackName}`
    }

    const taskId = beginDownloadTask(fallbackName, v.fileUrl)
    try {
      await call('download_file', {
        url: v.fileUrl,
        dest,
        sha1: null,
        taskId,
        name: fallbackName,
      })
      settleDownloadTask(taskId, 'done')
      return dest
    } catch (e) {
      settleDownloadTask(taskId, 'failed', (e as Error).message)
      throw e
    }
  }

  /* ------------------------------- 实例设置 ------------------------------- */

  async function loadInstanceSettings(instanceId: string) {
    const raw = await kvGet(`instance-settings:${instanceId}`)
    instanceSettings.value = {
      ...instanceSettings.value,
      [instanceId]: raw ? (JSON.parse(raw) as Record<string, unknown>) : {},
    }
  }

  async function updateInstanceSettings(instanceId: string, patch: Record<string, unknown>) {
    const cur = instanceSettings.value[instanceId] ?? {}
    const next = { ...cur, ...patch }
    instanceSettings.value = { ...instanceSettings.value, [instanceId]: next }
    await call('kv_set', { key: `instance-settings:${instanceId}`, value: JSON.stringify(next) })
  }

  /* --------------------------------- 公告 --------------------------------- */

  async function pullAnnouncements(): Promise<Announcement[]> {
    const raw = await call<string>('read_bundled_announcements')
    const all = JSON.parse(raw || '[]') as Announcement[]
    const shown = new Set(JSON.parse((await kvGet('shown-announcements')) ?? '[]') as string[])
    return all.filter((a) => !shown.has(a.id))
  }

  async function markAnnouncementShown(id: string) {
    const raw = await kvGet('shown-announcements')
    const shown = JSON.parse(raw ?? '[]') as string[]
    shown.push(id)
    await call('kv_set', { key: 'shown-announcements', value: JSON.stringify(shown) })
    pendingAnnouncements.value = pendingAnnouncements.value.filter((a) => a.id !== id)
  }

  return {
    /* state */
    ready,
    initError,
    browserMode,
    session,
    settings,
    instances,
    theme,
    pendingAnnouncements,
    updateAvailable,
    versions,
    versionsLoading,
    versionsError,
    installing,
    installError,
    cancelRequested,
    launchProgress,
    launchActive,
    downloadState,
    downloadActive,
    rooms,
    resourceKind,
    resourceQuery,
    resourceTotal,
    resourcePage,
    resourcePageSize,
    resourceProjects,
    resourceLoading,
    resourceError,
    resourceDetailData,
    resourceDetailLoading,
    instanceSettings,
    instanceReloads,
    navState,
    pageStack,
    launchLogs,
    crashInfo,
    /* computed */
    view,
    sideModule,
    showBack,
    subPage,
    route,
    appVersion,
    coreVersion,
    /* actions */
    init,
    setView,
    routerPush,
    setNav,
    openSubPage,
    openTasksPage,
    closeSubPage,
    pageBack,
    setInnerBack,
    setInstanceTab,
    reloadInstanceTab,
    setTheme,
    pushLaunchLog,
    clearLaunchLogs,
    loadCrashReport,
    dismissCrash,
    refreshInstances,
    createInstance,
    deleteInstance,
    launchInstance,
    killInstance,
    runningInstances,
    refreshRunningInstances,
    loadVersions,
    installVersion,
    cancelDownload,
    saveVersionClient,
    downloadVersionServer,
    loaderVersions,
    loadLoaderVersions,
    modApiVersions,
    loadModApiVersions,
    dataDir,
    gameFolders,
    selectedFolderId,
    selectFolder,
    folderDisplayName,
    addGameFolder,
    removeGameFolder,
    importModpack,
    installModpackFromUrl,
    installResource,
    checkModUpdates,
    applyModUpdate,
    exportLaunchScript,
    exportModpack,
    installJava,
    restoreSession,
    accounts,
    loadAccounts,
    authServers,
    loadAuthServers,
    refreshingAccountState,
    refreshAccountState,
    addAuthServer,
    removeAuthServer,
    deviceFlow,
    startMicrosoftLogin,
    cancelMicrosoftLogin,
    switchAccount,
    removeAccount,
    loginMode,
    setLoginMode,
    loginOffline,
    logout,
    loadSettings,
    saveSettings,
    loadRooms,
    createRoom,
    removeRoom,
    setRoomPersist,
    setResourceKind,
    setResourceQuery,
    resetResourceFilters,
    searchResources,
    setResourcePage,
    loadResourceDetail,
    saveResourceFile,
    loadInstanceSettings,
    updateInstanceSettings,
    markAnnouncementShown,
  }
})

/* ------------------------------- 帮助函数 ------------------------------- */

/** 副页面 → 路由路径。 */
function subPath(p: SubPage): string {
  switch (p.kind) {
    case 'select':
      return '/select'
    case 'tasks':
      return '/tasks'
    case 'instance':
      return `/instance/${p.instanceId}/${p.tab}`
    case 'resource': {
      const query = new URLSearchParams({ title: p.title })
      if (p.gameVersion) query.set('version', p.gameVersion)
      if (p.loader) query.set('loader', p.loader)
      return `/resource/${p.resourceKind}/${p.projectId}?${query.toString()}`
    }
    case 'help':
      return `/help/${p.entryId}?title=${encodeURIComponent(p.title)}`
    case 'version':
      return `/version/${p.versionId}`
    case 'accounts':
      return '/accounts'
  }
}

/** MC os rules 求值（仅当前平台是否允许）。 */

