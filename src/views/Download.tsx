import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  TaskList,
  ProgressDialog,
  toast,
  IconDownload,
  IconRefresh,
  IconPackage,
  IconSearch,
  IconGrid,
  IconStar,
  IconFolder,
  IconCode,
  IconLayout,
  IconChevronRight,
  IconChevronLeft,
  IconInfo,
  IconExternal,
  type TaskItem,
} from 'aelux-components'
import type { ResourceKind, ResourceQuery } from 'aelux-launcher-lib'
import { useApp, platform } from '../store'
import { AlxPage, type AlxNavEntry } from '../components/AlxPage'
import { AlxCard } from '../components/AlxCard'
import { AlxBlockIcon } from '../components/AlxBlockIcon'
import {
  AlxButton,
  AlxFloatButton,
  AlxIconButton,
  AlxInput,
  AlxListItem,
  AlxSelect,
} from '../components/AlxControls'
import { ResourcePager, ResourceRow } from './ResourceList'

/**
 * 下载页（对齐上游启动器的下载页形态）：
 *   左栏：原版游戏 + 社区资源分组（每项带刷新按钮）
 *   右栏 · 原版游戏：版本号输入行 → 加载器列表 → 加载器版本列表 → 「开始下载」
 *   右栏 · 社区资源：搜索卡片 → 结果卡片 → 分页卡片
 *
 * 加载器版本树由版本清单拼装（界面形态对齐用），真实的加载器仓库接入后替换此处即可。
 */

/** 社区资源类型 → 中文名 */
const KIND_TITLE: Record<ResourceKind, string> = {
  mod: 'Mod',
  pack: '整合包',
  datapack: '数据包',
  resourcepack: '资源包',
  shader: '光影包',
}

/** 社区资源类型 → 搜索页图标 */
const KIND_ICON: Record<ResourceKind, ReactNode> = {
  mod: <IconGrid size={17} />,
  pack: <IconFolder size={17} />,
  datapack: <IconCode size={17} />,
  resourcepack: <IconLayout size={17} />,
  shader: <IconStar size={17} />,
}

/** 来源下拉 */
const SOURCE_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'modrinth', label: 'Modrinth' },
  { value: 'curseforge', label: 'CurseForge' },
]

/** 游戏版本下拉 */
const VERSION_OPTIONS = [
  { value: '', label: '全部' },
  { value: '1.21', label: '1.21' },
  { value: '1.20', label: '1.20' },
  { value: '1.19', label: '1.19' },
  { value: '1.18', label: '1.18' },
  { value: '1.16', label: '1.16' },
  { value: '1.12', label: '1.12' },
  { value: '1.7', label: '1.7' },
]

/** 资源类型下拉（值为 Modrinth 的分类标识） */
const CATEGORY_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'technology', label: '技术' },
  { value: 'gameplay', label: '游戏机制' },
  { value: 'optimization', label: '优化' },
  { value: 'decoration', label: '装饰' },
  { value: 'animation', label: '动画' },
  { value: 'sound', label: '音效' },
  { value: 'texture', label: '材质' },
  { value: 'save', label: '存档' },
  { value: 'modpack', label: '整合包' },
]

/** 每页条数（与 lib 查询默认页大小一致） */
const PAGE_SIZE = 20

/** 加载器定义（版本号由版本清单拼装，真实接入后由加载器仓库提供） */
interface LoaderDef {
  key: string
  name: string
  home: string
  versions: string[]
}

const LOADERS: LoaderDef[] = [
  {
    key: 'forge',
    name: 'Forge',
    home: 'https://maven.minecraftforge.net/',
    versions: ['66.1.0', '66.0.4', '66.0.2', '65.1.4', '65.0.9'],
  },
  {
    key: 'neoforge',
    name: 'NeoForge',
    home: 'https://maven.neoforged.net/',
    versions: ['21.1.77', '21.1.32', '20.6.119', '20.4.190'],
  },
  {
    key: 'fabric',
    name: 'Fabric',
    home: 'https://fabricmc.net/',
    versions: ['0.116.0+1.21.4', '0.115.6+1.21.3', '0.114.0+1.21.1'],
  },
  {
    key: 'optifine',
    name: 'OptiFine',
    home: 'https://www.optifine.net/',
    versions: ['1.21.4_HD_U_I7', '1.21.3_HD_U_I6'],
  },
  {
    key: 'quilt',
    name: 'Quilt',
    home: 'https://quiltmc.org/',
    versions: ['0.24.0+1.21.4', '0.23.1+1.21.3'],
  },
]

/** ISO 时间 → `2026/10/21 19:05` */
function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 任务 id → 可读标题 */
function taskTitle(id: string): string {
  if (id.startsWith('vjson:')) return `版本信息 ${id.slice(6)}`
  if (id.startsWith('vjar:')) return `客户端 jar ${id.slice(5)}`
  if (id.startsWith('lib:')) return `依赖 ${id.slice(4)}`
  if (id.startsWith('aindex:')) return '资源索引'
  if (id.startsWith('asset:')) {
    const p = id.slice(6)
    return p.split('/').pop() ?? p
  }
  if (id.startsWith('native:')) return `原生库 ${id.slice(7)}`
  return id
}

function statusOf(s: string): TaskItem['status'] {
  if (s === 'canceled') return 'error'
  return s as TaskItem['status']
}

/** 一次安装会产生数千个资源文件，列表只展示进行中的前若干条 */
const MAX_VISIBLE_TASKS = 40

export function Download() {
  const {
    versions,
    versionsLoading,
    versionsError,
    installVersion,
    installing,
    installError,
    downloadState,
    resourceKind,
    resourceQuery,
    resourceProjects,
    resourceTotal,
    resourceLoading,
    resourceError,
    setResourceKind,
    setResourceQuery,
    searchResources,
    openSubPage,
  } = useApp()

  const [tab, setTab] = useState<string>('vanilla')
  const [versionId, setVersionId] = useState('')
  const [versionSearch, setVersionSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const releases = useMemo(() => versions.filter((v) => v.type === 'release'), [versions])
  const latest = releases[0] ?? versions[0] ?? null

  // 版本清单到达后，默认选中最新正式版。
  useEffect(() => {
    if (!versionId && latest) setVersionId(latest.id)
  }, [latest, versionId])

  /** 加载器版本树：版本号取自加载器定义，发布时间与适配版本由版本清单拼装 */
  const loaderTree = useMemo(() => {
    const base = releases.length > 0 ? releases : versions
    return LOADERS.map((def) => ({
      ...def,
      items: def.versions.map((label, i) => {
        const entry = base.length > 0 ? base[i % base.length] : undefined
        return {
          label,
          time: entry ? formatTime(entry.releaseTime) : '',
          mc: entry?.id ?? '',
        }
      }),
    }))
  }, [releases, versions])

  const search = versionSearch.trim().toLowerCase()
  const visibleLoaders = useMemo(
    () =>
      loaderTree.filter(
        (def) =>
          search.length === 0 ||
          def.name.toLowerCase().includes(search) ||
          def.items.some((it) => it.label.toLowerCase().includes(search)),
      ),
    [loaderTree, search],
  )

  const expandedLoader = useMemo(
    () => loaderTree.find((def) => def.key === expanded) ?? null,
    [loaderTree, expanded],
  )

  /** 当前选中版本是否有可用的加载器版本 */
  function loaderAvailable(def: (typeof loaderTree)[number]): boolean {
    return def.items.some((it) => it.mc === versionId)
  }

  /** 切到上一个（更旧的）正式版 */
  function olderVersion() {
    if (releases.length === 0) return
    const idx = releases.findIndex((v) => v.id === versionId)
    const next = releases[Math.min(releases.length - 1, Math.max(0, (idx < 0 ? 0 : idx) + 1))]
    setVersionId(next.id)
  }

  async function handleInstall(id: string) {
    if (!id) {
      toast.warning('请先选择要安装的版本')
      return
    }
    await installVersion(id)
    const err = useApp.getState().installError
    if (err) {
      toast.error(`安装失败：${err}`)
    } else {
      toast.success(`已安装 ${id}，可在「启动」页一键启动`)
    }
  }

  /** 社区资源检索（带页码） */
  async function runSearch(nextPage: number) {
    setPage(nextPage)
    setResourceQuery({ page: nextPage, size: PAGE_SIZE })
    await searchResources()
  }

  /** 切换左栏条目 */
  function selectTab(key: string) {
    setTab(key)
    if (key === 'vanilla') return
    setResourceKind(key as ResourceKind)
    void runSearch(1)
  }

  /** 刷新某个社区资源分类（同时切到该分类） */
  function refreshResource(kind: ResourceKind) {
    setTab(kind)
    setResourceKind(kind)
    void runSearch(page)
  }

  function openResource(project: { id: string; title: string }) {
    openSubPage({
      kind: 'resource',
      resourceKind: resourceKind,
      projectId: project.id,
      title: project.title,
    })
  }

  function resetConditions() {
    setResourceQuery({
      keyword: '',
      gameVersion: undefined,
      source: 'all',
      categories: [],
    })
    void runSearch(1)
  }

  const nav: AlxNavEntry[] = [
    { key: 'vanilla', title: '原版游戏', icon: <IconPackage size={17} /> },
    ...(Object.keys(KIND_TITLE) as ResourceKind[]).map((kind, i) => ({
      key: kind,
      title: KIND_TITLE[kind],
      icon: KIND_ICON[kind],
      group: i === 0 ? '社区资源' : undefined,
      trailing: (
        <span onClick={(e) => e.stopPropagation()}>
          <AlxIconButton label="刷新" onClick={() => refreshResource(kind)}>
            <IconRefresh size={13} />
          </AlxIconButton>
        </span>
      ),
    })),
  ]

  const tasks: TaskItem[] = useMemo(
    () =>
      (downloadState?.tasks ?? []).map((t) => {
        const pct = t.total > 0 ? Math.round((t.received / t.total) * 100) : undefined
        return {
          id: t.id,
          title: taskTitle(t.id),
          description: t.dest,
          status: statusOf(t.status),
          progress: pct,
        }
      }),
    [downloadState],
  )

  const visibleTasks = useMemo(() => {
    const running = tasks.filter((t) => t.status === 'running' || t.status === 'pending')
    const others = tasks.filter((t) => t.status !== 'running' && t.status !== 'pending')
    return [...running, ...others].slice(0, MAX_VISIBLE_TASKS)
  }, [tasks])

  const totalBytes = downloadState?.tasks.reduce((a, t) => a + (t.total || 0), 0) ?? 0
  const recvBytes = downloadState?.tasks.reduce((a, t) => a + (t.received || 0), 0) ?? 0
  const overall =
    totalBytes > 0
      ? Math.min(100, Math.round((recvBytes / totalBytes) * 100))
      : downloadState && downloadState.active > 0
        ? undefined
        : 100

  const labelStyle = {
    fontSize: 13,
    color: 'var(--alx-1)',
    textAlign: 'right' as const,
    whiteSpace: 'nowrap' as const,
  }

  return (
    <AlxPage nav={nav} active={tab} onSelect={selectTab} leftWidth={190}>
      {tab === 'vanilla' ? (
        <>
          {/* ------------- 版本号输入行 ------------- */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 15,
            }}
          >
            <AlxInput
              value={versionId}
              onChange={setVersionId}
              placeholder="版本号"
              style={{ width: 150 }}
            />
            <AlxIconButton label="上一个版本" onClick={olderVersion}>
              <IconChevronLeft size={15} />
            </AlxIconButton>
            <AlxBlockIcon size={32} />
            <AlxInput
              value={versionSearch}
              onChange={setVersionSearch}
              prefix={<IconSearch size={14} />}
              placeholder="搜索版本号或加载器"
              style={{ flex: 1, minWidth: 0 }}
            />
          </div>

          {versionsError && (
            <div className="alx-hint alx-hint--red">加载版本清单失败：{versionsError}</div>
          )}

          {versionsLoading && versions.length === 0 ? (
            <AlxCard title="加载中">
              <div className="alx-empty">
                <p>正在从版本清单源拉取可下载版本…</p>
              </div>
            </AlxCard>
          ) : (
            <>
              {/* ------------- 加载器列表 ------------- */}
              <AlxCard title="加载器">
                {visibleLoaders.length === 0 ? (
                  <div className="alx-empty">
                    <p>没有匹配的加载器</p>
                  </div>
                ) : (
                  visibleLoaders.map((def) => (
                    <div
                      key={def.key}
                      style={{
                        borderRadius: 3,
                        boxShadow:
                          expanded === def.key ? 'inset 0 0 0 1px var(--alx-3)' : undefined,
                      }}
                    >
                      {/* 加载器条目：名称 + 副文本在左，箭头紧跟其后。
                          不用 AlxListItem 的 actions 区 —— 那里会把箭头推到行尾，
                          与参考实现「名称 ›」的紧凑排布不一致。 */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setExpanded(expanded === def.key ? null : def.key)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setExpanded(expanded === def.key ? null : def.key)
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          height: 42,
                          padding: '0 4px',
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ minWidth: 0 }}>
                          <span
                            style={{
                              display: 'block',
                              fontSize: 14,
                              color: 'var(--alx-1)',
                            }}
                          >
                            {def.name}
                          </span>
                          <span
                            style={{
                              display: 'block',
                              fontSize: 12,
                              opacity: 0.6,
                              marginTop: 1,
                            }}
                          >
                            {loaderAvailable(def) ? '可以添加' : '无'}
                          </span>
                        </span>
                        <span
                          style={{
                            display: 'inline-flex',
                            color: 'var(--alx-4)',
                            transform:
                              expanded === def.key ? 'rotate(90deg)' : undefined,
                            transition: 'transform 200ms',
                          }}
                        >
                          <IconChevronRight size={14} />
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </AlxCard>

              {/* ------------- 加载器版本列表 ------------- */}
              {expandedLoader && (
                <AlxCard title={expandedLoader.name}>
                  {expandedLoader.items
                    .map((it, i) => ({ it, i }))
                    .filter(
                      ({ it }) =>
                        search.length === 0 || it.label.toLowerCase().includes(search),
                    )
                    .map(({ it, i }) => (
                      <AlxListItem
                        key={it.label}
                        icon={<AlxBlockIcon size={32} />}
                        title={it.label}
                        info={
                          it.time
                            ? `${i === 0 ? '最新版，' : ''}发布于 ${it.time}`
                            : '暂无发布时间'
                        }
                        actions={
                          <>
                            <AlxIconButton
                              label="下载"
                              onClick={() => {
                                if (!it.mc) {
                                  toast.warning('该加载器版本暂无可用的原版版本')
                                  return
                                }
                                toast.info(`正在下载 ${it.label} 所需的原版 ${it.mc}`)
                                void handleInstall(it.mc)
                              }}
                            >
                              <IconDownload size={14} />
                            </AlxIconButton>
                            <AlxIconButton label="版本信息">
                              <IconInfo size={14} />
                            </AlxIconButton>
                            <AlxIconButton
                              label="打开项目主页"
                              onClick={() => void platform.openExternal(expandedLoader.home)}
                            >
                              <IconExternal size={14} />
                            </AlxIconButton>
                          </>
                        }
                      />
                    ))}
                </AlxCard>
              )}

              {/* ------------- 下载任务 ------------- */}
              {tasks.length > 0 && (
                <AlxCard
                  title="下载任务"
                  extra={
                    <span style={{ fontSize: 12, opacity: 0.6 }}>
                      {tasks.length} 项 · 完成 {downloadState?.completed ?? 0} · 失败{' '}
                      {downloadState?.failed ?? 0}
                    </span>
                  }
                >
                  <TaskList items={visibleTasks} maxHeight={300} />
                </AlxCard>
              )}

              {installError && (
                <div className="alx-hint alx-hint--red">安装出错：{installError}</div>
              )}
            </>
          )}

          {/* ------------- 开始下载 ------------- */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
            <AlxFloatButton
              leftIcon={<IconDownload size={18} />}
              onClick={() => void handleInstall(versionId)}
            >
              开始下载
            </AlxFloatButton>
          </div>
        </>
      ) : (
        <>
          {/* ------------- 搜索卡片 ------------- */}
          <AlxCard title={`搜索 ${KIND_TITLE[resourceKind]}`}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'auto minmax(0, 1.3fr) minmax(0, 1.2fr) auto minmax(0, 1fr)',
                gap: '10px 12px',
                alignItems: 'center',
              }}
            >
              <span style={labelStyle}>名称</span>
              <AlxInput
                value={resourceQuery.keyword ?? ''}
                onChange={(v) => setResourceQuery({ keyword: v })}
                placeholder="资源名称"
                style={{ gridColumn: 'span 2' }}
              />
              <span style={labelStyle}>来源</span>
              <AlxSelect
                value={resourceQuery.source ?? 'all'}
                options={SOURCE_OPTIONS}
                onChange={(v) =>
                  setResourceQuery({ source: v as NonNullable<ResourceQuery['source']> })
                }
              />

              <span style={labelStyle}>版本</span>
              <AlxSelect
                value={resourceQuery.gameVersion ?? ''}
                options={VERSION_OPTIONS}
                onChange={(v) => setResourceQuery({ gameVersion: v || undefined })}
                style={{ gridColumn: 'span 2' }}
              />
              <span style={labelStyle}>类型</span>
              <AlxSelect
                value={resourceQuery.categories?.[0] ?? ''}
                options={CATEGORY_OPTIONS}
                onChange={(v) => setResourceQuery({ categories: v ? [v] : [] })}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <AlxButton highlight onClick={() => void runSearch(1)}>
                搜索
              </AlxButton>
              <AlxButton onClick={resetConditions}>重置条件</AlxButton>
              {resourceKind === 'pack' && (
                <AlxButton
                  onClick={() =>
                    toast.info('整合包安装需要选择一个 .mrpack 文件，本版本暂未接入文件选择。')
                  }
                >
                  安装已有整合包
                </AlxButton>
              )}
            </div>
          </AlxCard>

          {/* ------------- 结果卡片 ------------- */}
          <AlxCard headless padding="tight">
            {resourceLoading ? (
              <div className="alx-empty">
                <p>正在搜索社区资源…</p>
              </div>
            ) : resourceProjects.length === 0 ? (
              <div className="alx-empty">
                <p>暂时无法连接到社区资源源，请检查网络后重试</p>
                {resourceError && (
                  <p style={{ fontSize: 12, marginTop: 6 }}>错误详情：{resourceError}</p>
                )}
              </div>
            ) : (
              resourceProjects.map((project) => (
                <ResourceRow key={project.id} project={project} onOpen={openResource} />
              ))
            )}
          </AlxCard>

          {/* ------------- 分页卡片 ------------- */}
          {resourceProjects.length > 0 && (
            <AlxCard padding="tight">
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <ResourcePager
                  page={page}
                  total={resourceTotal}
                  size={PAGE_SIZE}
                  onChange={(p) => void runSearch(p)}
                />
              </div>
            </AlxCard>
          )}
        </>
      )}

      <ProgressDialog
        open={installing !== null}
        onClose={() => undefined}
        title={installing ? `正在安装 ${installing}` : '安装完成'}
        description="下载版本 JSON、客户端 jar、依赖库、资源与原生库，完成后自动登记为实例。"
        progress={overall}
        statusText={
          downloadState
            ? `进行中 ${downloadState.active} · 完成 ${downloadState.completed} · 失败 ${downloadState.failed}`
            : undefined
        }
        stats={[
          { label: '已下载', value: `${(recvBytes / 1048576).toFixed(1)} MB` },
          { label: '总大小', value: `${(totalBytes / 1048576).toFixed(1)} MB` },
        ]}
        details={<TaskList items={visibleTasks} maxHeight={180} />}
        cancellable={false}
        showClose
        closeOnEsc
      />
    </AlxPage>
  )
}
