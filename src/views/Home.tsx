import { useEffect, useMemo, useState } from 'react'
import { Badge, Progress, toast, IconUser, IconTrash, IconPlay } from 'aelux-components'
import { useApp } from '../store'
import { PclPage } from '../components/PclPage'

/**
 * 启动页 —— 复刻 PCL 的 `PageLaunch`（PageLaunchLeft 控制列 + PageLaunchRight 日志区）：
 *   左栏（白底）：账号登录入口 → 头像 / 昵称 / 邮箱 → 启动游戏（描边双行）→ 版本选择 / 版本设置
 *   右栏（浅蓝渐变）：提示条 + 实例列表 + 启动日志
 */
export function Home() {
  const { instances, session, launchInstance, setView, deleteInstance } = useApp()

  const [selectedId, setSelectedId] = useState('')
  const [launching, setLaunching] = useState(false)
  const [logs, setLogs] = useState<string[]>([])

  useEffect(() => {
    if (!selectedId && instances.length > 0) setSelectedId(instances[0].id)
  }, [instances, selectedId])

  const selected = useMemo(
    () => instances.find((i) => i.id === selectedId) ?? instances[0] ?? null,
    [instances, selectedId],
  )

  function log(line: string) {
    setLogs((prev) => [...prev.slice(-80), line])
  }

  async function handleLaunch() {
    if (!selected) {
      toast.warning('还没有可启动的实例，请先到「下载」页安装一个版本')
      setView('download')
      return
    }
    setLaunching(true)
    log(`准备启动 ${selected.name}（${selected.version}）…`)
    try {
      const r = await launchInstance(selected.id)
      if (r?.ok) {
        log(`已启动游戏${r.pid ? `（pid ${r.pid}）` : ''}`)
        toast.success(`${selected.name} 已启动`)
      } else {
        log(`启动失败：${r?.error ?? '未知错误'}`)
        toast.error(`启动失败：${r?.error ?? '未知错误'}`)
      }
    } catch (e) {
      log(`启动异常：${(e as Error).message}`)
      toast.error(`启动异常：${(e as Error).message}`)
    } finally {
      setLaunching(false)
    }
  }

  return (
    <PclPage
      leftWidth={300}
      left={
        <div className="pcl-launch">
          <button type="button" className="pcl-launch__account" onClick={() => setView('more')}>
            <IconUser size={15} />
            {session ? `${session.username} 切换账号` : '离线登录'}
          </button>

          <div className="pcl-launch__avatar" aria-hidden="true" />
          <div className="pcl-launch__name">{session?.username ?? '未登录'}</div>
          <div className="pcl-launch__mail">
            {session?.type === 'offline' ? '离线会话 · 本地游玩' : session ? '已登录' : '点击上方登录'}
          </div>

          <div className="pcl-launch__spacer" />

          {launching && (
            <div style={{ width: '100%', marginBottom: 10 }}>
              <Progress value={60} variant="primary" />
            </div>
          )}

          <button type="button" className="pcl-launch__btn" disabled={launching} onClick={handleLaunch}>
            <span className="pcl-launch__btn-title">{launching ? '正在启动…' : '启动游戏'}</span>
            <span className="pcl-launch__btn-sub">
              {selected ? `[${selected.loader ?? '原版'}]${selected.name}` : '尚未安装任何版本'}
            </span>
          </button>

          <div className="pcl-launch__row">
            <button type="button" className="pcl-btn" onClick={() => setView('download')}>
              版本选择
            </button>
            <button type="button" className="pcl-btn" onClick={() => setView('settings')}>
              版本设置
            </button>
          </div>
        </div>
      }
    >
      <div className="pcl-hint">
        <IconUser size={15} />
        <span>
          {session
            ? `当前以 ${session.username} 登录。到「下载」页安装版本后，回到这里一键启动。`
            : '尚未登录。离线登录即可完全本地游玩；正版登录需要联网校验。'}
        </span>
      </div>

      <div className="pcl-section">
        <div className="pcl-section__head">
          <h3>游戏实例</h3>
          <span className="pcl-section__count">{instances.length} 个</span>
        </div>

        {instances.length === 0 ? (
          <div className="pcl-empty">
            <p>还没有实例。到「下载」页安装一个 Minecraft 版本后，这里会出现可一键启动的实例。</p>
            <button type="button" className="pcl-btn" onClick={() => setView('download')}>
              去下载游戏
            </button>
          </div>
        ) : (
          <div className="pcl-instances">
            {instances.map((inst) => (
              <div key={inst.id} className="pcl-instance">
                <div className="pcl-instance__main">
                  <div className="pcl-instance__name">
                    {inst.name}
                    {inst.loader && <Badge status="info">{inst.loader}</Badge>}
                  </div>
                  <div className="pcl-instance__desc">
                    {inst.version} · {inst.lastPlayed ?? '从未游玩'}
                  </div>
                </div>
                <button
                  type="button"
                  className="pcl-btn pcl-btn--primary"
                  onClick={() => {
                    setSelectedId(inst.id)
                    void handleLaunch()
                  }}
                >
                  <IconPlay size={13} />
                  启动
                </button>
                <button
                  type="button"
                  className="pcl-btn"
                  aria-label="删除实例"
                  onClick={() => deleteInstance(inst.id)}
                >
                  <IconTrash size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pcl-section">
        <div className="pcl-section__head">
          <h3>启动日志</h3>
        </div>
        <div className="pcl-log">
          {logs.length === 0 ? (
            <span className="pcl-log__empty">暂无日志，启动游戏后这里会显示启动过程。</span>
          ) : (
            logs.map((l, i) => (
              <div key={i} className="pcl-log__line">
                {l}
              </div>
            ))
          )}
        </div>
      </div>
    </PclPage>
  )
}
