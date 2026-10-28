import { useEffect } from 'react'
import {
  SidebarNav,
  Card,
  Button,
  Badge,
  Dialog,
  IconGrid,
  IconDownload,
  IconUser,
  IconPackage,
  IconExternal,
  IconSettings,
} from 'aelux-components'
import { TitleBar } from './components/TitleBar'
import { useApp, announcements } from './store'
import { Home } from './views/Home'
import { Download } from './views/Download'
import { Account } from './views/Account'
import { Mods } from './views/Mods'
import { Multiplayer } from './views/Multiplayer'
import { Settings } from './views/Settings'

type ViewKey = 'home' | 'download' | 'account' | 'mods' | 'multiplayer' | 'settings'

const NAV_GROUPS = [
  {
    key: 'game',
    label: '游戏',
    items: [
      { key: 'home', label: '主页', icon: <IconGrid size={18} /> },
      { key: 'download', label: '下载', icon: <IconDownload size={18} /> },
      { key: 'mods', label: '模组', icon: <IconPackage size={18} /> },
      { key: 'multiplayer', label: '联机', icon: <IconExternal size={18} /> },
    ],
  },
  {
    key: 'sys',
    label: '账户与设置',
    items: [
      { key: 'account', label: '账号', icon: <IconUser size={18} /> },
      { key: 'settings', label: '设置', icon: <IconSettings size={18} /> },
    ],
  },
]

export function App() {
  const { ready, view, setView, init, pendingAnnouncements, updateAvailable } = useApp()

  useEffect(() => {
    void init()
  }, [])

  const current = pendingAnnouncements[0]

  return (
    <div className="aelux-app">
      <TitleBar updateAvailable={updateAvailable} />

      <div className="aelux-body">
        <SidebarNav
          groups={NAV_GROUPS}
          value={view}
          onValueChange={(k) => setView(k as ViewKey)}
          header={
            <div className="aelux-brand">
              <span className="aelux-brand__logo">A</span>
              <div>
                <div className="aelux-brand__name">Aelux</div>
                <div className="aelux-brand__sub">启动器</div>
              </div>
            </div>
          }
        />

        <main className="aelux-content">
          {!ready ? (
            <Card title="加载中">
              <p>正在初始化本地数据与版本清单…</p>
            </Card>
          ) : (
            <>
              {view === 'home' && <Home />}
              {view === 'download' && <Download />}
              {view === 'account' && <Account />}
              {view === 'mods' && <Mods />}
              {view === 'multiplayer' && <Multiplayer />}
              {view === 'settings' && <Settings />}
            </>
          )}
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

      {updateAvailable && (
        <Badge status="warning" className="aelux-update-badge">
          有新版本可用
        </Badge>
      )}
    </div>
  )
}
