import { useMemo } from 'react'
import { IconDownload, IconRefresh, IconTrash, IconExternal } from 'aelux-components'
import { useApp } from '../store'
import { AlxPage } from '../components/AlxPage'
import { AlxCard } from '../components/AlxCard'
import { AlxButton, AlxIconButton, AlxListItem } from '../components/AlxControls'
import { AlxBlockIcon } from '../components/AlxBlockIcon'

/**
 * 任务管理（副页面）。
 *
 * 对应上游实现里的 `PageSpeedLeft` / `PageSpeedRight`：
 * 上游此处还是占位状态（内容被注释掉），但**层级与形态已定** ——
 * 左栏列出「游戏加速」分类，右栏列出进行中的下载任务。
 *
 * 任务数据来自 store 的 `downloadState`（DownloadManager 的状态快照），
 * 业务逻辑全在 lib-core 的 DownloadManager 里，这里只做展示。
 */
export function TaskManager() {
  const { downloadState } = useApp()

  const tasks = useMemo(() => downloadState?.tasks ?? [], [downloadState])

  const running = tasks.filter((t) => t.status === 'running')
  const pending = tasks.filter((t) => t.status === 'pending')
  const done = tasks.filter((t) => t.status === 'done')
  const failed = tasks.filter((t) => t.status === 'failed')

  /** 把字节数转成人话 */
  function human(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    let v = bytes
    let i = 0
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024
      i++
    }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
  }

  const left = (
    <div className="alx-nav">
      <div>
        <div className="alx-nav-group">游戏加速</div>
        <AlxListItem
          title={`进行中 (${running.length})`}
          icon={<IconDownload size={17} />}
          selected
        />
      </div>
      <div>
        <div className="alx-nav-group">其他</div>
        <AlxListItem title={`等待中 (${pending.length})`} icon={<IconRefresh size={17} />} />
        <AlxListItem title={`已完成 (${done.length})`} icon={<IconExternal size={17} />} />
        <AlxListItem title={`失败 (${failed.length})`} icon={<IconTrash size={17} />} />
      </div>
    </div>
  )

  return (
    <AlxPage left={left} leftWidth={190}>
      {tasks.length === 0 ? (
        <AlxCard title="当前没有进行中的任务">
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              padding: '28px 12px',
              fontSize: 13,
              color: 'var(--alx-1)',
              opacity: 0.7,
              textAlign: 'center',
            }}
          >
            <div>下载游戏版本或社区资源时，任务会显示在这里。</div>
          </div>
        </AlxCard>
      ) : (
        <>
          {running.length > 0 && (
            <AlxCard title={`进行中 (${running.length})`}>
              {running.map((t) => {
                const pct =
                  t.total > 0 ? Math.min(100, Math.round((t.received / t.total) * 100)) : 0
                return (
                  <div key={t.id} style={{ marginBottom: 14 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>{t.name}</span>
                      <span
                        style={{
                          fontSize: 13,
                          color: 'var(--alx-3)',
                          fontWeight: 600,
                        }}
                      >
                        {pct}%
                      </span>
                    </div>
                    {/* 进度条：4px 高、圆角 2，已完成部分主蓝 */}
                    <div
                      style={{
                        height: 4,
                        borderRadius: 2,
                        background: 'var(--alx-6)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: 'var(--alx-3)',
                          transition: 'width 200ms linear',
                        }}
                      />
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginTop: 4,
                        fontSize: 12,
                        color: 'var(--alx-gray-4)',
                      }}
                    >
                      <span>{human(t.received)} / {human(t.total)}</span>
                      <span>{t.speed > 0 ? `${human(t.speed)}/s` : '等待中'}</span>
                    </div>
                  </div>
                )
              })}
            </AlxCard>
          )}

          {pending.length > 0 && (
            <AlxCard title={`等待中 (${pending.length})`}>
              {pending.map((t) => (
                <AlxListItem
                  key={t.id}
                  icon={<AlxBlockIcon size={32} />}
                  title={t.name}
                  info="等待中 = 排队中"
                />
              ))}
            </AlxCard>
          )}

          {failed.length > 0 && (
            <AlxCard title={`失败 (${failed.length})`}>
              {failed.map((t) => (
                <AlxListItem
                  key={t.id}
                  icon={<AlxBlockIcon size={32} />}
                  title={t.name}
                  info={t.error ?? '下载失败'}
                  actions={
                    <AlxIconButton label="重试">
                      <IconRefresh size={14} />
                    </AlxIconButton>
                  }
                />
              ))}
            </AlxCard>
          )}
        </>
      )}

      {tasks.length > 0 && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <AlxButton onClick={() => useApp.getState().setView('download')}>
            前往下载页
          </AlxButton>
        </div>
      )}
    </AlxPage>
  )
}
