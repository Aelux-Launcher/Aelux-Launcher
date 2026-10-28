import { useEffect } from 'react'
import { Button, Dialog, Alert } from 'aelux-components'
import { TitleBar } from './components/TitleBar'
import { useApp, announcements } from './store'
import { Home } from './views/Home'
import { Download } from './views/Download'
import { Multiplayer } from './views/Multiplayer'
import { Settings } from './views/Settings'
import { More } from './views/More'

export function App() {
  const { view, init, pendingAnnouncements, initError, browserMode } = useApp()

  // 后台静默加载：启动器立刻可用，不做「正在初始化…」的全屏等待。
  // 各页面数据到位后自行更新（例如下载页的版本列表有自己的加载态）。
  useEffect(() => {
    void init()
  }, [])

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

          {view === 'home' && <Home />}
          {view === 'download' && <Download />}
          {view === 'multiplayer' && <Multiplayer />}
          {view === 'settings' && <Settings />}
          {view === 'more' && <More />}
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
