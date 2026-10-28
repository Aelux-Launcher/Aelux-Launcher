import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Badge,
  Empty,
  Input,
  TaskList,
  ProgressDialog,
  toast,
  IconDownload,
  IconRefresh,
  IconSearch,
  IconPackage,
  type TaskItem,
} from 'aelux-components'
import { useApp } from '../store'
import { PclPage } from '../components/PclPage'

type Filter = 'all' | 'release' | 'snapshot'

/** 下载页左栏的资源类型，对应 PCL `PageDownloadLeft` 的 ItemXXX 列表。 */
const RESOURCE_TABS = [
  { key: 'vanilla', title: '原版游戏' },
  { key: 'mod', title: 'Mod' },
  { key: 'pack', title: '整合包' },
  { key: 'datapack', title: '数据包' },
  { key: 'resourcepack', title: '资源包' },
  { key: 'shader', title: '光影包' },
]

function statusOf(s: string): TaskItem['status'] {
  if (s === 'canceled') return 'error'
  return s as TaskItem['status']
}

/**
 * 下载页 —— 对应 PCL 的 `PageDownload`（PageDownloadLeft + PageDownloadInstall）：
 *   左栏：资源类型列表（原版游戏 / Mod / 整合包 / 数据包 / 资源包 / 光影包）
 *   右栏：版本列表 + 搜索筛选 + 下载任务
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
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  // 安装开始时自动打开进度框；installing 变回 null（完成/失败）时关闭
  useEffect(() => {
    if (installing) setDialogOpen(true)
    else setDialogOpen(false)
  }, [installing])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return versions.filter((v) => {
      if (filter !== 'all' && v.type !== filter) return false
      if (q && !v.id.toLowerCase().includes(q)) return false
      return true
    })
  }, [versions, filter, query])

  const tasks: TaskItem[] = useMemo(
    () =>
      (downloadState?.tasks ?? []).map((t) => {
        const pct = t.total > 0 ? Math.round((t.received / t.total) * 100) : undefined
        return {
          id: t.id,
          title: t.id.replace(/^vjson:|vjar:/, ''),
          description: t.dest,
          status: statusOf(t.status),
          progress: pct,
        }
      }),
    [downloadState],
  )

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

  const nav = RESOURCE_TABS.map((t) => ({
    ...t,
    badge: t.key === 'vanilla' ? versions.length || undefined : undefined,
  }))

  return (
    <PclPage nav={nav} active={resource} onSelect={setResource} leftWidth={220}>
      {resource !== 'vanilla' ? (
        <Empty
          title={`${RESOURCE_TABS.find((t) => t.key === resource)?.title} 尚未开放`}
          description="该资源类型将在后续版本接入（对应设计文档 Phase 2：Modrinth / CurseForge / ModPack）。"
          icon={<IconPackage size={44} />}
        />
      ) : (
        <>
          <div className="pcl-section__head">
            <h3>原版游戏</h3>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<IconRefresh size={15} />}
              loading={versionsLoading}
              onClick={() => loadVersions()}
            >
              刷新列表
            </Button>
          </div>

          <div className="dl-toolbar">
            <div className="dl-seg">
              {(['all', 'release', 'snapshot'] as Filter[]).map((f) => (
                <button
                  key={f}
                  className={`dl-seg__btn${filter === f ? ' is-active' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? '全部' : f === 'release' ? '正式版' : '快照'}
                </button>
              ))}
            </div>
            <div className="dl-toolbar__spacer" />
            <Input
              placeholder="搜索版本号…"
              value={query}
              onChange={(e: any) => setQuery(e.target.value)}
              prefix={<IconSearch size={15} />}
              wrapperClassName="dl-search"
            />
          </div>

          {versionsError && (
            <div className="dl-error">
              加载版本清单失败：{versionsError}
              <Button variant="secondary" size="sm" onClick={() => loadVersions()}>
                重试
              </Button>
            </div>
          )}

          {versionsLoading && versions.length === 0 ? (
            <Empty title="加载中" description="正在从版本清单源拉取可下载版本…" />
          ) : filtered.length === 0 ? (
            <Empty title="没有匹配的版本" description="换个筛选条件或清空搜索试试。" />
          ) : (
            <div className="version-list">
              {filtered.map((v) => (
                <div
                  key={v.id}
                  className={`version-row version-row--${
                    v.type === 'release' ? 'release' : v.type === 'snapshot' ? 'snapshot' : 'other'
                  }`}
                >
                  <div>
                    <div className="version-row__id">{v.id}</div>
                    <div className="version-row__time">
                      {v.releaseTime ? v.releaseTime.slice(0, 10) : ''}
                    </div>
                  </div>
                  <div className="version-row__spacer" />
                  <Badge
                    status={v.type === 'release' ? 'success' : v.type === 'snapshot' ? 'warning' : 'info'}
                  >
                    {v.type}
                  </Badge>
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<IconDownload size={15} />}
                    loading={installing === v.id}
                    disabled={installing !== null}
                    onClick={() => handleInstall(v.id)}
                  >
                    安装
                  </Button>
                </div>
              ))}
            </div>
          )}

          {tasks.length > 0 && (
            <div className="pcl-section">
              <div className="pcl-section__head">
                <h3>下载任务</h3>
                <span className="pcl-section__count">{tasks.length} 项</span>
              </div>
              <TaskList items={tasks} />
            </div>
          )}

          {installError && <p className="dl-error">安装出错：{installError}</p>}
        </>
      )}

      <ProgressDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={installing ? `正在安装 ${installing}` : '安装完成'}
        description="下载版本 JSON 与客户端 jar，完成后自动登记为实例。"
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
        details={<TaskList items={tasks} maxHeight={180} />}
        cancellable={false}
        showClose
        closeOnEsc
      />
    </PclPage>
  )
}
