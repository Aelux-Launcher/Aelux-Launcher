import { useEffect, useMemo, useState } from 'react'
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
  type TaskItem,
} from 'aelux-components'
import { useApp } from '../store'
import { PclPage } from '../components/PclPage'
import { PclCard } from '../components/PclCard'
import { McBlockIcon } from '../components/McBlockIcon'

/** 下载页左栏的资源类型，对应 PCL `PageDownloadLeft` 的 ItemXXX 列表。 */
const RESOURCE_TABS = [
  { key: 'vanilla', title: '原版游戏', icon: <IconPackage size={17} /> },
  { key: 'mod', title: 'Mod', icon: <IconGrid size={17} />, group: '社区资源' },
  { key: 'pack', title: '整合包', icon: <IconFolder size={17} /> },
  { key: 'datapack', title: '数据包', icon: <IconCode size={17} /> },
  { key: 'resourcepack', title: '资源包', icon: <IconLayout size={17} /> },
  { key: 'shader', title: '光影包', icon: <IconStar size={17} /> },
]

function statusOf(s: string): TaskItem['status'] {
  if (s === 'canceled') return 'error'
  return s as TaskItem['status']
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

/** 一次安装会产生数千个资源文件，列表只展示进行中的前若干条。 */
const MAX_VISIBLE_TASKS = 40

/**
 * 下载页 —— 复刻 PCL 的 `PageDownload`：
 *   左栏：资源类型列表（原版游戏 + 社区资源分组）
 *   右栏：「最新版本」卡片 + 「正式版 / 快照」可折叠卡片，条目为方块图标 + 版本 + 日期
 */
export function Download() {
  const {
    versions,
    versionsLoading,
    versionsError,
    loadVersions,
    installVersion,
    installing,
    installError,
    downloadState,
  } = useApp()

  const [resource, setResource] = useState('vanilla')
  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    if (installing) setDialogOpen(true)
    else setDialogOpen(false)
  }, [installing])

  const releases = useMemo(
    () => versions.filter((v) => v.type === 'release' && v.id.includes(query.trim())),
    [versions, query],
  )
  const snapshots = useMemo(
    () => versions.filter((v) => v.type === 'snapshot' && v.id.includes(query.trim())),
    [versions, query],
  )
  const latest = releases[0] ?? null

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

  async function handleInstall(id: string) {
    try {
      await installVersion(id)
      toast.success(`已安装 ${id}，可在「启动」页一键启动`)
    } catch (e) {
      toast.error(`安装失败：${(e as Error).message}`)
    }
  }

  function VersionRow({ id, date, desc }: { id: string; date: string; desc?: string }) {
    return (
      <div className="pcl-ver">
        <McBlockIcon size={32} className="pcl-ver__icon" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pcl-ver__id">{id}</div>
          <div className="pcl-ver__desc">{desc ?? date}</div>
        </div>
        <button
          type="button"
          className="pcl-btn"
          disabled={installing !== null}
          onClick={() => handleInstall(id)}
        >
          <IconDownload size={13} />
          {installing === id ? '安装中' : '下载'}
        </button>
      </div>
    )
  }

  return (
    <PclPage nav={RESOURCE_TABS} active={resource} onSelect={setResource} leftWidth={190}>
      {resource !== 'vanilla' ? (
        <PclCard title={RESOURCE_TABS.find((t) => t.key === resource)?.title}>
          <div className="pcl-empty">
            <p>该资源类型将在后续版本接入（对应设计文档 Phase 2：Modrinth / CurseForge / ModPack）。</p>
          </div>
        </PclCard>
      ) : (
        <>
          <div className="pcl-search">
            <IconSearch size={16} />
            <input
              placeholder="搜索版本号…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              type="button"
              className="pcl-btn"
              style={{ height: 26, padding: '0 10px' }}
              disabled={versionsLoading}
              onClick={() => loadVersions()}
            >
              <IconRefresh size={13} />
              刷新
            </button>
          </div>

          {versionsError && (
            <div className="pcl-hint" style={{ borderColor: '#f09595', background: '#fcebeb' }}>
              加载版本清单失败：{versionsError}
            </div>
          )}

          {versionsLoading && versions.length === 0 ? (
            <PclCard title="加载中">
              <div className="pcl-empty">
                <p>正在从版本清单源拉取可下载版本…</p>
              </div>
            </PclCard>
          ) : (
            <>
              <PclCard title="最新版本" className="pcl-card--accent">
                {latest ? (
                  <VersionRow
                    id={latest.id}
                    date={latest.releaseTime.slice(0, 10)}
                    desc={`最新正式版，发布于 ${latest.releaseTime.replace('T', ' ').slice(0, 16)}`}
                  />
                ) : (
                  <div className="pcl-empty">
                    <p>暂无版本数据</p>
                  </div>
                )}
                {snapshots[0] && (
                  <VersionRow
                    id={snapshots[0].id}
                    date={snapshots[0].releaseTime.slice(0, 10)}
                    desc={`最新预览版，发布于 ${snapshots[0].releaseTime.replace('T', ' ').slice(0, 16)}`}
                  />
                )}
              </PclCard>

              <PclCard title="正式版" collapsible defaultOpen>
                {releases.length === 0 ? (
                  <div className="pcl-empty">
                    <p>没有匹配的版本</p>
                  </div>
                ) : (
                  releases.map((v) => (
                    <VersionRow key={v.id} id={v.id} date={v.releaseTime.replace('T', ' ').slice(0, 16)} />
                  ))
                )}
              </PclCard>

              {snapshots.length > 0 && (
                <PclCard title="快照版" collapsible defaultOpen={false}>
                  {snapshots.map((v) => (
                    <VersionRow key={v.id} id={v.id} date={v.releaseTime.replace('T', ' ').slice(0, 16)} />
                  ))}
                </PclCard>
              )}
            </>
          )}

          {tasks.length > 0 && (
            <PclCard
              title="下载任务"
              extra={
                <span className="pcl-section__count">
                  {tasks.length} 项 · 完成 {downloadState?.completed ?? 0} · 失败{' '}
                  {downloadState?.failed ?? 0}
                </span>
              }
            >
              <TaskList items={visibleTasks} maxHeight={300} />
              {tasks.length > visibleTasks.length && (
                <p className="pcl-section__count" style={{ marginTop: 8 }}>
                  仅显示前 {visibleTasks.length} 项，其余 {tasks.length - visibleTasks.length} 项已排队。
                </p>
              )}
            </PclCard>
          )}

          {installError && (
            <div className="pcl-hint" style={{ borderColor: '#f09595', background: '#fcebeb' }}>
              安装出错：{installError}
            </div>
          )}
        </>
      )}

      <ProgressDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
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
    </PclPage>
  )
}
