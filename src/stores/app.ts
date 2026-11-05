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
import { toast } from '../lib/toast'
import type {
  Announcement,
  AppModuleKey,
  DeviceFlowState,
  DownloadManagerState,
  DownloadTaskState,
  GameInstance,
  InstanceTab,
  LaunchResult,
  ResourceDetailData,
  ResourceKind,
  ResourceProject,
  ResourceQuery,
  ResourceVersion,
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
import { md5 } from '../lib/md5'

/** 页面栈记录：进入详情页之前待返回的位置。 */
export interface PageStackEntry {
  /** 返回时恢复显示的模块 */
  view: AppModuleKey
  sub?: string
}

/** 测试期版本基线（三处版本号统一维护：package.json / tauri.conf.json / 内核 Cargo.toml）。 */
const APP_VERSION_FALLBACK = '0.1.0'

/** PCL 在展示「前置资源」时忽略的两个基础前置（Fabric API / Quilt API）。 */
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
  const pageStack = ref<PageStackEntry[]>([])

  /** 切换一级模块（路由 redirect 会落到该模块的默认分类）。 */
  function setView(v: AppModuleKey) {
    pageStack.value = []
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
    const current: PageStackEntry = { view: view.value, sub: navState.value[view.value] }
    const exists = pageStack.value.some((e) => e.view === current.view)
    if (exists) {
      const idx = pageStack.value.findIndex((e) => e.view === current.view)
      pageStack.value = pageStack.value.slice(idx + 1)
    } else {
      pageStack.value = [current, ...pageStack.value]
    }
    void router.push(subPath(p))
  }

  /** 退出详情页，回到所在模块（保留分类选择）。 */
  function closeSubPage() {
    void router.push(`/${view.value}`)
  }

  /**
   * 返回（顶栏 ← 按钮）：
   *   详情页 → 逐级回退页面栈；模块态 → 回启动页；启动页 → 无操作。
   */
  function pageBack() {
    const [top, ...rest] = pageStack.value
    if (!top) {
      pageStack.value = []
      void router.push('/home')
      return
    }
    pageStack.value = rest
    if (top.sub) navState.value = { ...navState.value, [top.view]: top.sub }
    // 模块页恢复到进入前的分类；无记录则落到默认分类（redirect）
    void router.push(top.view === 'home' || !top.sub ? `/${top.view}` : `/${top.view}/${top.sub}`)
  }

  /** 版本设置页左栏子项切换（同一副页面内换内容）。 */
  function setInstanceTab(tab: InstanceTab) {
    if (route.value.meta.sub === 'instance') {
      void router.replace(`/instance/${route.value.params.instanceId}/${tab}`)
    }
  }

  /* ------------------------------- 全局数据 ------------------------------- */
  const ready = ref(false)
  const initError = ref<string | null>(null)
  const browserMode = ref(!('__TAURI_INTERNALS__' in window))
  const session = ref<Session | null>(null)
  const settings = ref<Settings>({ ...DEFAULT_SETTINGS })
  const instances = ref<GameInstance[]>([])
  const theme = ref<'light' | 'dark'>('light')
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
  const downloadState = ref<DownloadManagerState>({
    tasks: [],
    active: 0,
    done: 0,
    failed: 0,
    pending: 0,
    finished: true,
  })

  /* --------------------------------- 联机 --------------------------------- */
  interface Server {
    id: string
    name: string
    host: string
    port?: number
  }
  const servers = ref<Server[]>([])

  /* ------------------------------ 启动日志 ------------------------------ */
  /** 启动过程日志（任务管理页展示；最多保留 200 条）。 */
  const launchLogs = ref<string[]>([])

  function pushLaunchLog(line: string) {
    launchLogs.value = [...launchLogs.value.slice(-200), line]
  }

  function clearLaunchLogs() {
    launchLogs.value = []
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
  /** 搜索请求序号：切换筛选/翻页时丢弃过期响应。 */
  let resourceSearchToken = 0

  /* ------------------------------- 实例设置 ------------------------------- */
  const instanceSettings = ref<Record<string, Record<string, unknown>>>({})

  /* --------------------------------- 动作 --------------------------------- */

  function applyTheme(t: 'light' | 'dark', persist: boolean) {
    document.documentElement.setAttribute('data-theme', t)
    theme.value = t
    if (persist) void call('kv_set', { key: 'theme', value: t })
  }
  const setTheme = (t: 'light' | 'dark') => applyTheme(t, true)

  async function init() {
    applyTheme(((await kvGet('theme')) === 'dark' ? 'dark' : 'light') as 'light' | 'dark', false)
    initError.value = null
    browserMode.value = !('__TAURI_INTERNALS__' in window)

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

    // 逐段容错：任何一段失败都不应把启动器卡死
    try {
      await loadVersions()
    } catch (e) {
      initError.value = `版本清单加载失败：${(e as Error).message}`
    }
    try {
      await refreshInstances()
    } catch {
      /* 本地失败时静默 */
    }
    try {
      await restoreSession()
    } catch {
      /* 会话读取失败静默 */
    }
    try {
      const savedMode = await kvGet('login-mode')
      if (savedMode === 'official' || savedMode === 'third' || savedMode === 'offline') {
        loginMode.value = savedMode
      }
    } catch {
      /* 登录方式读取失败用默认值 */
    }
    try {
      await loadAccounts()
    } catch {
      /* 账户列表读取失败按空处理 */
    }
    try {
      dataDir.value = await call<string>('get_data_dir')
    } catch {
      /* 数据目录读取失败留空 */
    }
    try {
      await loadAddedFolders()
    } catch {
      /* 文件夹列表读取失败按空处理 */
    }
    try {
      await loadSettings()
    } catch {
      /* 设置读取失败用默认值 */
    }
    try {
      await loadServers()
    } catch {
      /* 静默 */
    }
    try {
      pendingAnnouncements.value = await pullAnnouncements()
    } catch {
      /* 公告拉取失败不影响启动 */
    }
    try {
      const raw = await call<string>('read_local_update')
      updateAvailable.value = raw.trim().length > 0
    } catch {
      /* 静默 */
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
    instances.value = list ?? []
  }

  async function createInstance(name: string, version: string, loader?: string): Promise<GameInstance> {
    const inst = await call<GameInstance>('create_instance', { name, version, loader: loader ?? null })
    instances.value = [...instances.value, inst]
    return inst
  }

  async function deleteInstance(id: string) {
    await call('delete_instance', { id })
    instances.value = instances.value.filter((i) => i.id !== id)
  }

  /** 启动实例（进程拉起属内核 launch 模块，接入前给出明确提示）。 */
  async function launchInstance(id: string): Promise<LaunchResult | null> {
    const inst = instances.value.find((i) => i.id === id)
    if (!inst) return null
    // TODO: 内核 launch 模块就绪后改为 call('launch_instance', { id })
    return { ok: false, error: `启动功能尚未接入内核（${inst.name}）。请等待 aelux-core launch 模块。` }
  }

  /* ------------------------------- 安装版本 ------------------------------- */

  /**
   * 安装版本：版本 JSON → 客户端 jar → 依赖库 → 资源索引 → 资源对象。
   * 进度写入 downloadState，任务管理页实时可见。
   */
  async function installVersion(id: string) {
    if (installing.value) return
    installing.value = id
    installError.value = null
    const tasks: DownloadTaskState[] = []
    const ds = downloadState.value

    const reset = () => {
      ds.tasks = tasks
      ds.done = tasks.filter((t) => t.status === 'done').length
      ds.failed = tasks.filter((t) => t.status === 'failed').length
      ds.pending = tasks.filter((t) => t.status === 'pending').length
      ds.active = tasks.filter((t) => t.status === 'downloading').length
      ds.finished = ds.pending === 0 && ds.active === 0
    }

    const addTask = (t: Omit<DownloadTaskState, 'status'>): DownloadTaskState => {
      const task: DownloadTaskState = { ...t, status: 'pending' }
      tasks.push(task)
      reset()
      return task
    }

    try {
      // 1. 版本 JSON
      const entry = versions.value.find((v) => v.id === id)
      if (!entry) throw new Error('版本不存在')
      const rawJson = await call<string>('fetch_json', { url: entry.url })
      const verJson = JSON.parse(rawJson) as VersionJson

      const tJson = addTask({ id: `${id}-json`, name: `${id}.json`, url: entry.url, received: 0, total: 0 })
      tJson.status = 'downloading'
      await call('write_text', { path: `minecraft/versions/${id}/${id}.json`, content: rawJson })
      tJson.status = 'done'
      reset()

      // 2. 客户端 jar
      const client = verJson.downloads?.client
      if (client) {
        const t = addTask({
          id: `${id}-client`,
          name: `${id}.jar`,
          url: client.url,
          received: 0,
          total: client.size,
        })
        await runTask(t, { url: client.url, dest: `minecraft/versions/${id}/${id}.jar`, sha1: client.sha1 })
        reset()
      }

      // 3. 依赖库（os rules 不匹配的跳过）
      const libItems: Array<{ task: DownloadTaskState; input: TaskInput }> = []
      for (const lib of verJson.libraries ?? []) {
        if (!rulesAllow(lib.rules)) continue
        const artifact = lib.downloads?.artifact
        if (artifact) {
          libItems.push({
            task: addTask({
              id: `lib-${artifact.path}`,
              name: artifact.path.split('/').pop() ?? artifact.path,
              url: artifact.url,
              received: 0,
              total: artifact.size,
            }),
            input: { url: artifact.url, dest: `minecraft/libraries/${artifact.path}`, sha1: artifact.sha1 },
          })
        }
      }
      await runPool(libItems, 8)
      reset()

      // 4. 资源索引 + 资源对象
      if (verJson.assetIndex) {
        const indexId = verJson.assetIndex.id
        const indexRaw = await call<string>('fetch_json', { url: verJson.assetIndex.url })
        await call('write_text', { path: `minecraft/assets/indexes/${indexId}.json`, content: indexRaw })
        const assets = JSON.parse(indexRaw) as { objects: Record<string, { hash: string; size: number }> }
        const assetItems = Object.entries(assets.objects).map(([name, obj]) => {
          const url = `https://resources.download.minecraft.net/${obj.hash.slice(0, 2)}/${obj.hash}`
          return {
            task: addTask({ id: `asset-${obj.hash}`, name, url, received: 0, total: obj.size }),
            input: { url, dest: `minecraft/assets/objects/${obj.hash.slice(0, 2)}/${obj.hash}`, sha1: obj.hash },
          }
        })
        await runPool(assetItems, 16)
        reset()
      }

      if (ds.failed > 0) throw new Error(`${ds.failed} 个文件下载失败，安装未完成`)

      // 5. 登记为实例，主页即可一键启动
      await createInstance(id, id, 'vanilla')
    } catch (e) {
      installError.value = (e as Error).message
    } finally {
      reset()
      installing.value = null
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
    await call('download_file', { url: client.url, dest: path, sha1: client.sha1 })
    return path
  }

  /** 下载服务端 jar 到数据目录 minecraft/servers/<id>/server.jar，返回落盘路径。 */
  async function downloadVersionServer(id: string): Promise<string> {
    const json = await fetchVersionJson(id)
    const server = json.downloads?.server
    if (!server) throw new Error('该版本没有提供服务端下载')
    const dest = `minecraft/servers/${id}/server.jar`
    await call('download_file', { url: server.url, dest, sha1: server.sha1 })
    return dest
  }

  /* ----------------------------- 加载器版本列表 ----------------------------- */

  interface LoaderVersionsState {
    loading: boolean
    loaded: boolean
    versions: string[]
    error: string | null
  }

  /** 加载器版本列表缓存（key = `loader:mcVersion`），PCL 式展开时按需拉取。 */
  const loaderVersions = ref<Record<string, LoaderVersionsState>>({})

  /**
   * 拉取某 MC 版本下某加载器的可用版本列表：
   *   forge / optifine → BMCLAPI；fabric → Fabric meta；neoforge → NeoForged maven。
   */
  async function loadLoaderVersions(loader: string, mcVersion: string) {
    const key = `${loader}:${mcVersion}`
    const st = loaderVersions.value[key]
    if (st?.loading || st?.loaded) return
    loaderVersions.value[key] = { loading: true, loaded: false, versions: [], error: null }
    try {
      let versions: string[] = []
      if (loader === 'forge') {
        const raw = await call<string>('fetch_json', {
          url: `https://bmclapi2.bangbang93.com/forge/minecraft/${mcVersion}`,
        })
        const arr = JSON.parse(raw) as Array<{ version: string }>
        versions = arr.map((b) => b.version).reverse()
      } else if (loader === 'fabric') {
        const raw = await call<string>('fetch_json', {
          url: `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`,
        })
        const arr = JSON.parse(raw) as Array<{ loader: { version: string } }>
        versions = arr.map((e) => e.loader.version)
      } else if (loader === 'quilt') {
        const raw = await call<string>('fetch_json', {
          url: `https://meta.quiltmc.org/v3/versions/loader/${mcVersion}`,
        })
        const arr = JSON.parse(raw) as Array<{ loader?: { version?: string }; version?: string }>
        versions = arr
          .map((e) => e.loader?.version ?? e.version ?? '')
          .filter(Boolean)
      } else if (loader === 'neoforge') {
        const raw = await call<string>('fetch_json', {
          url: 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge',
        })
        const data = JSON.parse(raw) as { versions: string[] }
        // NeoForge 版本号 = MC 次版本号段（1.21.4 → 21.4.x）
        const prefix = mcVersion.split('.').slice(1).join('.')
        versions = data.versions.filter((v) => v.startsWith(prefix)).reverse()
      } else if (loader === 'optifine') {
        const raw = await call<string>('fetch_json', {
          url: `https://bmclapi2.bangbang93.com/optifine/${mcVersion}`,
        })
        const arr = JSON.parse(raw) as Array<{ type: string; patch: string }>
        versions = arr.map((o) => `${o.type} ${o.patch}`).reverse()
      }
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

  /* ------------------------------- 游戏文件夹 ------------------------------- */

  /** 数据根目录（当前文件夹路径的根，init 时读取）。 */
  const dataDir = ref('')

  /** 用户添加的游戏文件夹（落 kv 'game-folders'；当前/官方文件夹为派生态）。 */
  const addedFolders = ref<StoredFolder[]>([])

  async function loadAddedFolders() {
    const raw = await kvGet('game-folders')
    addedFolders.value = raw ? (JSON.parse(raw) as StoredFolder[]) : []
  }

  async function persistAddedFolders() {
    await call('kv_set', { key: 'game-folders', value: JSON.stringify(addedFolders.value) })
  }

  /** 版本选择页的文件夹列表：当前文件夹 + 官方文件夹 + 添加的文件夹。 */
  const gameFolders = computed<StoredFolder[]>(() => [
    {
      id: 'current',
      type: 'current',
      path: dataDir.value ? `${dataDir.value}/.minecraft` : '',
    },
    { id: 'official', type: 'official', path: '' },
    ...addedFolders.value,
  ])

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
      path = window.prompt('输入游戏文件夹路径（预览模式）')
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

  /** 导入整合包（.mrpack）：内核整合包管线接入前提示。 */
  async function importModpack(): Promise<void> {
    if (isTauri) {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const picked = await open({
        multiple: false,
        filters: [{ name: '整合包', extensions: ['mrpack', 'zip'] }],
      })
      if (!picked) return
    }
    toast.info('整合包导入将在内核安装管线就绪后开放')
  }

  interface TaskInput {
    url: string
    dest: string
    sha1?: string
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

  async function runTask(task: DownloadTaskState, input: TaskInput) {
    task.status = 'downloading'
    downloadState.value.active += 1
    try {
      await call('download_file', { url: input.url, dest: input.dest, sha1: input.sha1 ?? null })
      task.status = 'done'
    } catch (e) {
      task.status = 'failed'
      task.error = (e as Error).message
    } finally {
      downloadState.value.active -= 1
      resetCounts()
    }
  }

  function resetCounts() {
    const ds = downloadState.value
    ds.done = ds.tasks.filter((t) => t.status === 'done').length
    ds.failed = ds.tasks.filter((t) => t.status === 'failed').length
  }

  async function runPool(items: Array<{ task: DownloadTaskState; input: TaskInput }>, concurrency: number) {
    let idx = 0
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (idx < items.length) {
        const item = items[idx++]
        await runTask(item.task, item.input)
      }
    })
    await Promise.all(workers)
  }

  /* --------------------------------- 会话 --------------------------------- */

  async function restoreSession() {
    const raw = await kvGet('session')
    session.value = raw ? (JSON.parse(raw) as Session) : null
  }

  /* ------------------------------- 多账户管理 ------------------------------- */

  /** 账户列表（微软 / 离线多账户并存，落 kv 'accounts'）。 */
  const accounts = ref<StoredAccount[]>([])

  async function loadAccounts() {
    const raw = await kvGet('accounts')
    accounts.value = raw ? (JSON.parse(raw) as StoredAccount[]) : []
  }

  async function persistAccounts() {
    await call('kv_set', { key: 'accounts', value: JSON.stringify(accounts.value) })
  }

  /** 把账户设为当前会话并落 kv。 */
  async function applyAccount(acc: StoredAccount) {
    const s: Session = {
      type: acc.type === 'microsoft' ? 'microsoft' : 'offline',
      username: acc.username,
      uuid: acc.uuid,
    }
    session.value = s
    await call('kv_set', { key: 'session', value: JSON.stringify(s) })
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
    const idx = accounts.value.findIndex((x) => x.id === acc.id)
    if (idx >= 0) accounts.value[idx] = acc
    else accounts.value.push(acc)
    setLoginMode('official')
    await applyAccount(acc)
    await persistAccounts()
  }

  /** 切换当前账户（账户页单选）。 */
  async function switchAccount(id: string) {
    const acc = accounts.value.find((a) => a.id === id)
    if (!acc) return
    setLoginMode(acc.type === 'microsoft' ? 'official' : 'offline')
    await applyAccount(acc)
  }

  /** 移除账户；微软账户同时清钥匙串凭证；移除当前账户则登出会话。 */
  async function removeAccount(id: string) {
    const acc = accounts.value.find((a) => a.id === id)
    if (!acc) return
    accounts.value = accounts.value.filter((a) => a.id !== id)
    await persistAccounts()
    if (acc.type === 'microsoft') {
      try {
        await call('auth_logout', { msaId: acc.id })
      } catch {
        /* 钥匙串清理失败不阻断前端移除 */
      }
    }
    if (session.value && session.value.uuid === acc.uuid) {
      session.value = null
      await call('kv_remove', { key: 'session' })
    }
  }

  /** 离线登录：加入 / 更新离线账户并设为当前（多离线账户并存）。 */
  async function loginOffline(username: string) {
    if (!username.trim()) throw new Error('用户名不能为空')
    const uuid = offlineUuid(username.trim())
    const acc: StoredAccount = {
      id: uuid,
      type: 'offline',
      username: username.trim(),
      uuid,
      loggedInAt: String(Math.floor(Date.now() / 1000)),
    }
    const idx = accounts.value.findIndex((x) => x.id === acc.id)
    if (idx >= 0) accounts.value[idx] = acc
    else accounts.value.push(acc)
    setLoginMode('offline')
    await applyAccount(acc)
    await persistAccounts()
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
        schedulePoll(s) // pending：继续按 interval 轮询
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
  }

  async function saveSettings(patch: Partial<Settings>) {
    settings.value = { ...settings.value, ...patch }
    await call('kv_set', { key: 'settings', value: JSON.stringify(settings.value) })
  }

  /* --------------------------------- 联机 --------------------------------- */

  async function loadServers() {
    const raw = await kvGet('servers')
    if (raw) servers.value = JSON.parse(raw) as Server[]
  }

  async function addServer(s: Server) {
    servers.value = [...servers.value, s]
    await call('kv_set', { key: 'servers', value: JSON.stringify(servers.value) })
  }

  async function removeServer(id: string) {
    servers.value = servers.value.filter((x) => x.id !== id)
    await call('kv_set', { key: 'servers', value: JSON.stringify(servers.value) })
  }

  /* ------------------------------- 社区资源 ------------------------------- */

  /** 切换资源类型（PCL 行为：类型切换后清空筛选与翻页）。 */
  function setResourceKind(k: ResourceKind) {
    resourceKind.value = k
    resourceProjects.value = []
    resourceTotal.value = 0
    resourcePage.value = 0
    resourceError.value = null
    resourceQuery.value = { name: '', source: 'all', gameVersion: '', loader: '', category: '' }
  }

  function setResourceQuery(patch: Partial<ResourceQuery>) {
    resourceQuery.value = { ...resourceQuery.value, ...patch }
  }

  /** 重置筛选条件（不触发检索，调用方决定何时搜索）。 */
  function resetResourceFilters() {
    resourceQuery.value = { name: '', source: 'all', gameVersion: '', loader: '', category: '' }
    resourcePage.value = 0
  }

  /** 搜索社区资源（resetPage=true 时回到第一页；翻页传 false）。 */
  async function searchResources(resetPage = true) {
    if (resetPage) resourcePage.value = 0
    const token = ++resourceSearchToken
    resourceError.value = null
    // Modrinth 没有 world 类型（PCL2 也没有世界下载页），页面保留但结果恒为空
    if (resourceKind.value === 'world') {
      resourceProjects.value = []
      resourceTotal.value = 0
      resourceLoading.value = false
      return
    }
    resourceLoading.value = true
    try {
      if (resourceQuery.value.source === 'curseforge') {
        throw new Error('CurseForge 源需要 API key，暂不可用；请使用 Modrinth 源')
      }
      // 光影页的「原版可用 / Iris / OptiFine」在 PCL 里属于加载器，走 loaders facet
      const selected = RESOURCE_CATEGORIES[resourceKind.value].find(
        (item) => item.slug === resourceQuery.value.category,
      )
      const isLoaderCategory = selected?.facet === 'loader'
      const url = buildResourceSearchUrl({
        kind: resourceKind.value,
        name: resourceQuery.value.name,
        gameVersion: resourceQuery.value.gameVersion,
        loader: isLoaderCategory ? selected.slug : resourceQuery.value.loader,
        category: isLoaderCategory ? '' : resourceQuery.value.category,
        page: resourcePage.value,
        pageSize: resourcePageSize,
      })
      const raw = await call<string>('fetch_json', { url })
      if (token !== resourceSearchToken) return
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
      resourceTotal.value = data.total_hits
      resourceProjects.value = data.hits.map((h) => ({
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
      }))
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

  async function loadResourceDetail(projectId: string) {
    resourceDetailLoading.value = true
    resourceDetailData.value = null
    resourceError.value = null
    try {
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

      // 前置资源：只取必填依赖，排除当前项目与 Fabric API / Quilt API（PCL 行为）
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

    const task: DownloadTaskState = {
      id: `resource-${v.id}-${Date.now()}`,
      name: fallbackName,
      url: v.fileUrl,
      received: 0,
      total: 0,
      status: 'pending',
    }
    const ds = downloadState.value
    ds.tasks = [...ds.tasks, task]
    ds.finished = false
    ds.pending = ds.tasks.filter((t) => t.status === 'pending').length
    task.status = 'downloading'
    ds.active += 1
    try {
      await call('download_file', { url: v.fileUrl, dest, sha1: null })
      task.status = 'done'
      return dest
    } catch (e) {
      task.status = 'failed'
      task.error = (e as Error).message
      throw e
    } finally {
      ds.active = Math.max(0, ds.active - 1)
      ds.done = ds.tasks.filter((t) => t.status === 'done').length
      ds.failed = ds.tasks.filter((t) => t.status === 'failed').length
      ds.pending = ds.tasks.filter((t) => t.status === 'pending').length
      ds.finished = ds.pending === 0 && ds.active === 0
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
    downloadState,
    servers,
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
    navState,
    pageStack,
    launchLogs,
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
    closeSubPage,
    pageBack,
    setInstanceTab,
    setTheme,
    pushLaunchLog,
    clearLaunchLogs,
    refreshInstances,
    createInstance,
    deleteInstance,
    launchInstance,
    loadVersions,
    installVersion,
    saveVersionClient,
    downloadVersionServer,
    loaderVersions,
    loadLoaderVersions,
    dataDir,
    gameFolders,
    selectedFolderId,
    selectFolder,
    folderDisplayName,
    addGameFolder,
    removeGameFolder,
    importModpack,
    restoreSession,
    accounts,
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
    loadServers,
    addServer,
    removeServer,
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
function rulesAllow(rules?: Array<{ action: string; os?: { name?: string } }>): boolean {
  if (!rules || rules.length === 0) return true
  const os = mapOs()
  let allowed = false
  for (const rule of rules) {
    if (!rule.os || rule.os.name === os) {
      if (rule.action === 'disallow' && rule.os?.name === os) return false
      allowed = rule.action === 'allow'
    }
  }
  return allowed
}

function mapOs(): string {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('win')) return 'windows'
  if (ua.includes('mac')) return 'osx'
  return 'linux'
}

/** 离线 UUID：MD5("OfflinePlayer:<name>") 转 UUID v3 形式。 */
function offlineUuid(name: string): string {
  const hash = md5(`OfflinePlayer:${name}`)
  const hex = Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-3${hex.slice(13, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
