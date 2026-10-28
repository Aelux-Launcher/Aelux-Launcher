import { IconButton, IconSun, IconMoon, IconPlay, IconDownload, IconExternal, IconSettings, IconGrid } from 'aelux-components'
import { invoke } from '@tauri-apps/api/core'
import { useApp } from '../store'

type ViewKey = 'home' | 'download' | 'multiplayer' | 'settings' | 'more'

/** PCL 顶栏导航项：启动 / 下载 / 联机 / 设置 / 更多（对应 PCL 的 BtnTitleSelect0-4）。 */
const TABS: { key: ViewKey; label: string; icon: React.ReactNode }[] = [
  { key: 'home', label: '启动', icon: <IconPlay size={15} /> },
  { key: 'download', label: '下载', icon: <IconDownload size={15} /> },
  { key: 'multiplayer', label: '联机', icon: <IconExternal size={15} /> },
  { key: 'settings', label: '设置', icon: <IconSettings size={15} /> },
  { key: 'more', label: '更多', icon: <IconGrid size={15} /> },
]

/**
 * 顶部标题栏 —— 照搬 PCL（FormMain.xaml / PanTitle）：
 *   高 48px、蓝色渐变；左侧品牌 Logo；中间为水平导航标签（启动/下载/联机/设置/更多）；
 *   右侧为窗口控制。窗口无系统边框（transparent + decorations:false），需自行实现拖拽。
 */
export function TitleBar() {
  const { view, setView, theme, setTheme, updateAvailable, browserMode } = useApp()

  return (
    <div className="aelux-titlebar" data-tauri-drag-region>
      <div className="aelux-titlebar__brand" data-tauri-drag-region>
        <img className="aelux-titlebar__logo" src="/aelux-icon.png" alt="Aelux" />
        <span className="aelux-titlebar__name" data-tauri-drag-region>
          Aelux
        </span>
        {browserMode && (
          <span className="aelux-titlebar__preview" title="未检测到 Tauri 运行时，当前为浏览器预览模式">
            预览
          </span>
        )}
      </div>

      <nav className="aelux-titlebar__nav" role="tablist" aria-label="主导航">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={view === t.key}
            className={`aelux-titlebar__tab${view === t.key ? ' is-active' : ''}`}
            onClick={() => setView(t.key)}
          >
            <span className="aelux-titlebar__tab-icon" aria-hidden="true">
              {t.icon}
            </span>
            <span className="aelux-titlebar__tab-label">{t.label}</span>
          </button>
        ))}
      </nav>

      <div className="aelux-titlebar__actions">
        {updateAvailable && <span className="aelux-titlebar__badge">有更新</span>}
        <IconButton
          size="sm"
          variant="ghost"
          label={theme === 'dark' ? '切换到浅色' : '切换到深色'}
          icon={theme === 'dark' ? <IconSun size={15} /> : <IconMoon size={15} />}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        />
        <button
          type="button"
          className="aelux-titlebar__win"
          aria-label="最小化"
          onClick={() => invoke('minimize_window')}
        >
          ─
        </button>
        <button
          type="button"
          className="aelux-titlebar__win"
          aria-label="最大化"
          onClick={() => invoke('toggle_maximize')}
        >
          ▢
        </button>
        <button
          type="button"
          className="aelux-titlebar__win aelux-titlebar__win--close"
          aria-label="关闭"
          onClick={() => invoke('close_window')}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
