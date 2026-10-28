import { Card, Button, Badge, Empty } from 'aelux-components'
import { useApp } from '../store'

export function Home() {
  const { instances, session, launchInstance, setView } = useApp()

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
        <Empty title="还没有实例" description="点击下方按钮创建你的第一个游戏实例。" />
      ) : (
        <div className="instance-grid">
          {instances.map((inst) => (
            <Card key={inst.id} title={inst.name} className="instance-card">
              <div className="instance-card__meta">
                <Badge status="info">{inst.version}</Badge>
                {inst.loader && <Badge status="success">{inst.loader}</Badge>}
              </div>
              <p className="instance-card__time">{inst.lastPlayed ?? '从未游玩'}</p>
              <Button variant="primary" block onClick={() => launchInstance(inst.id)}>
                启动
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
