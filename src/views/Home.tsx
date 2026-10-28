import { Card, Button, Badge, Empty, toast, IconPlay, IconDownload } from 'aelux-components'
import { useApp } from '../store'

export function Home() {
  const { instances, session, launchInstance, setView } = useApp()

  async function handleLaunch(id: string, name: string) {
    const r = await launchInstance(id)
    if (!r) {
      toast.error('实例不存在')
      return
    }
    if (r.ok) toast.success(`${name} 已启动${r.pid ? `（pid ${r.pid}）` : ''}`)
    else toast.error(`启动失败：${r.error ?? '未知错误'}`)
  }

  return (
    <div className="view">
      <div className="view__header">
        <h2>游戏实例</h2>
        {!session && (
          <Button variant="secondary" size="sm" onClick={() => setView('account')}>
            未登录 · 去登录
          </Button>
        )}
      </div>

      {instances.length === 0 ? (
        <Empty
          title="还没有实例"
          description="先到「下载」页安装一个 Minecraft 版本，安装完成后会自动登记为实例。"
          action={
            <Button variant="primary" leftIcon={<IconDownload size={16} />} onClick={() => setView('download')}>
              去下载游戏
            </Button>
          }
        />
      ) : (
        <div className="instance-grid">
          {instances.map((inst) => (
            <Card key={inst.id} title={inst.name} className="instance-card">
              <div className="instance-card__meta">
                <Badge status="info">{inst.version}</Badge>
                {inst.loader && <Badge status="success">{inst.loader}</Badge>}
              </div>
              <p className="instance-card__time">{inst.lastPlayed ?? '从未游玩'}</p>
              <Button
                variant="primary"
                block
                leftIcon={<IconPlay size={16} />}
                onClick={() => handleLaunch(inst.id, inst.name)}
              >
                启动
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
