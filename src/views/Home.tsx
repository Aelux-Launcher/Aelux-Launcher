import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Badge,
  ListItem,
  Select,
  Radio,
  Progress,
  Empty,
  toast,
  IconPlay,
  IconSettings,
  IconUser,
  IconDownload,
  IconTrash,
  type SelectOption,
} from 'aelux-components'
import { useApp } from '../store'
import { PclPage } from '../components/PclPage'

type LoginType = 'microsoft' | 'offline' | 'third'

/**
 * 启动页 —— 对应 PCL 的 `PageLaunch`（PageLaunchLeft + PageLaunchRight）：
 *   左栏 300px：版本选择 / 版本设置 → 登录方式 → 巨大启动按钮 → 版本号 → 启动进度
 *   右栏：提示条 → 实例列表 → 启动日志
 */
export function Home() {
  const { instances, session, launchInstance, setView, deleteInstance } = useApp()

  const [selectedId, setSelectedId] = useState<string>('')
  const [loginType, setLoginType] = useState<LoginType>('offline')
  const [launching, setLaunching] = useState(false)
  const [logs, setLogs] = useState<string[]>([])

  // 默认选中第一个实例
  useEffect(() => {
    if (!selectedId && instances.length > 0) setSelectedId(instances[0].id)
  }, [instances, selectedId])

  const selected = useMemo(
    () => instances.find((i) => i.id === selectedId) ?? instances[0] ?? null,
    [instances, selectedId],
  )

  const versionOptions: SelectOption[] = useMemo(
    () =>
      instances.map((i) => ({
        value: i.id,
        label: `${i.name} · ${i.version}${i.loader ? `（${i.loader}）` : ''}`,
      })),
    [instances],
  )

  function log(line: string) {
    setLogs((prev) => [...prev.slice(-60), line])
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
          <div className="pcl-launch__row">
            <Button
              variant="secondary"
              size="sm"
              block
              onClick={() => setView('download')}
              leftIcon={<IconDownload size={15} />}
            >
              版本选择
            </Button>
            <Button
              variant="secondary"
              size="sm"
              block
              onClick={() => setView('settings')}
              leftIcon={<IconSettings size={15} />}
            >
              版本设置
            </Button>
          </div>

          <div className="pcl-launch__login">
            <span className="pcl-launch__login-icon" aria-hidden="true">
              <IconUser size={15} />
            </span>
            <Radio
              size="sm"
              label="正版"
              name="aelux-login"
              checked={loginType === 'microsoft'}
              onChange={() => setLoginType('microsoft')}
            />
            <Radio
              size="sm"
              label="离线"
              name="aelux-login"
              checked={loginType === 'offline'}
              onChange={() => setLoginType('offline')}
            />
            <Radio
              size="sm"
              label="统一通行证"
              name="aelux-login"
              checked={loginType === 'third'}
              onChange={() => setLoginType('third')}
            />
          </div>

          <button type="button" className="pcl-launch__btn" disabled={launching} onClick={handleLaunch}>
            <span className="pcl-launch__btn-title">{launching ? '正在启动…' : '启动游戏'}</span>
            <span className="pcl-launch__btn-sub">
              {selected ? selected.version : '尚未安装任何版本'}
            </span>
          </button>

          {instances.length > 0 && (
            <Select
              size="sm"
              block
              options={versionOptions}
              value={selected?.id}
              onValueChange={setSelectedId}
              className="pcl-launch__select"
            />
          )}

          {launching && (
            <div className="pcl-launch__progress">
              <Progress value={60} variant="primary" />
              <span className="pcl-launch__progress-text">当前步骤：正在启动游戏</span>
            </div>
          )}
        </div>
      }
    >
      <div className="pcl-hint">
        <span className="pcl-hint__title">提示</span>
        <span className="pcl-hint__text">
          {session
            ? `当前以 ${session.username} 登录。版本可在「下载」页安装，安装完成后回到此处一键启动。`
            : '尚未登录。离线登录即可完全本地游玩；正版登录需要联网校验。'}
        </span>
      </div>

      <div className="pcl-section">
        <div className="pcl-section__head">
          <h3>游戏实例</h3>
          <span className="pcl-section__count">{instances.length} 个</span>
        </div>

        {instances.length === 0 ? (
          <Empty
            title="还没有实例"
            description="到「下载」页安装一个 Minecraft 版本后，这里会出现可一键启动的实例。"
            action={
              <Button variant="primary" leftIcon={<IconDownload size={16} />} onClick={() => setView('download')}>
                去下载游戏
              </Button>
            }
          />
        ) : (
          <div className="pcl-instance-list">
            {instances.map((inst) => (
              <ListItem
                key={inst.id}
                icon={<span className="pcl-instance-list__badge">{inst.version.slice(0, 2)}</span>}
                title={inst.name}
                description={`${inst.version}${inst.loader ? ` · ${inst.loader}` : ''} · ${inst.lastPlayed ?? '从未游玩'}`}
                meta={selected?.id === inst.id ? <Badge status="success">当前</Badge> : undefined}
                trailing={
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={<IconPlay size={14} />}
                      onClick={() => {
                        setSelectedId(inst.id)
                        void handleLaunch()
                      }}
                    >
                      启动
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="删除实例"
                      onClick={() => deleteInstance(inst.id)}
                    >
                      <IconTrash size={14} />
                    </Button>
                  </>
                }
                selected={selected?.id === inst.id}
                onClick={() => setSelectedId(inst.id)}
                className="pcl-instance-list__row"
              />
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
