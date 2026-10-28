import { useEffect, useRef, useState } from 'react'
import { Button, Dialog, Alert } from 'aelux-components'
import { TitleBar } from './components/TitleBar'
import { useApp, announcements } from './store'
import { Home } from './views/Home'
import { Download } from './views/Download'
import { Multiplayer } from './views/Multiplayer'
import { Settings } from './views/Settings'
import { More } from './views/More'

type ViewKey = 'home' | 'download' | 'multiplayer' | 'settings' | 'more'

export function App() {
  const { view, init, pendingAnnouncements, initError, browserMode } = useApp()

  // 启动器立刻可用：init() 在后台静默跑，各页面用自己的局部加载态。
  useEffect(() => {
    void init()
  }, [])

  // 页面切换动画（PCL MyPageLeft.TriggerShowAnimation / TriggerHideAnimation）：
  // 旧页 110ms 缩放淡出 → 新页 400ms 回弹缩放淡入。
  const [shown, setShown] = useState<ViewKey>(view)
  const [leaving, setLeaving] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (view === shown) return
    setLeaving(true)
    timer.current = window.setTimeout(() => {
      setShown(view)
      setLeaving(false)
    }, 110)
    return () => window.clearTimeout(timer.current)
  }, [view, shown])

  const current = pendingAnnouncements[0]

  return (
    <div className="aelux-app">
      <TitleBar />

      <div className="aelux-body">
        <main className="aelux-content">
          {initError && (
            <Alert
              type="warning"
              title="部分平台能力不可用"
              description={initError}
              className="aelux-init-alert"
            >
              <Button variant="ghost" size="sm" onClick={() => init()}>
                重试
              </Button>
            </Alert>
          )}
          {browserMode && (
            <Alert
              type="info"
              title="浏览器预览模式"
              description="未检测到 Tauri 运行时，版本清单、下载与启动均为模拟实现；界面布局与桌面端一致。"
              className="aelux-init-alert"
            />
          )}

          <div className={`pcl-stage${leaving ? ' pcl-stage--leave' : ' pcl-stage--enter'}`} key={shown}>
            {shown === 'home' && <Home />}
            {shown === 'download' && <Download />}
            {shown === 'multiplayer' && <Multiplayer />}
            {shown === 'settings' && <Settings />}
            {shown === 'more' && <More />}
          </div>
        </main>
      </div>

      <Dialog
        open={!!current}
        title={current?.title ?? ''}
        onClose={() => current && announcements.markShown(current.id)}
      >
        <p>{current?.body}</p>
        <Button variant="primary" onClick={() => current && announcements.markShown(current.id)}>
          知道了
        </Button>
      </Dialog>
    </div>
  )
}
