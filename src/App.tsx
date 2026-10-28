import { useEffect } from 'react'
import { Card, Button, Badge, Dialog } from 'aelux-components'
import { TitleBar } from './components/TitleBar'
import { useApp, announcements } from './store'
import { Home } from './views/Home'
import { Login } from './views/Login'
import { Settings } from './views/Settings'
import { Mods } from './views/Mods'

const NAV: { key: 'home' | 'login' | 'mods' | 'settings'; label: string }[] = [
  { key: 'home', label: '主页' },
  { key: 'login', label: '账号' },
  { key: 'mods', label: '模组' },
  { key: 'settings', label: '设置' },
]

export function App() {
  const { ready, view, setView, init, pendingAnnouncements, updateAvailable, theme, setTheme } = useApp()

  useEffect(() => {
    void init()
  }, [])

  const current = pendingAnnouncements[0]

  return (
    <div className="aelux-app">
      <TitleBar
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        updateAvailable={updateAvailable}
      />

      <div className="aelux-body">
        <aside className="aelux-sidebar">
          {NAV.map((n) => (
            <Button
              key={n.key}
              variant={view === n.key ? 'primary' : 'ghost'}
              block
              onClick={() => setView(n.key)}
            >
              {n.label}
            </Button>
          ))}
        </aside>

        <main className="aelux-content">
          {!ready ? (
            <Card title="加载中">正在初始化本地数据…</Card>
          ) : (
            <>
              {view === 'home' && <Home />}
              {view === 'login' && <Login />}
              {view === 'mods' && <Mods />}
              {view === 'settings' && <Settings />}
            </>
          )}
        </main>
      </div>

      <Dialog open={!!current} title={current?.title ?? ''} onClose={() => current && announcements.markShown(current.id)}>
        <p>{current?.body}</p>
        <Button variant="primary" onClick={() => current && announcements.markShown(current.id)}>
          知道了
        </Button>
      </Dialog>

      {updateAvailable && (
        <Badge status="warning" className="aelux-update-badge">
          有新版本可用
        </Badge>
      )}
    </div>
  )
}
