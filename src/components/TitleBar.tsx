import { IconPlay, IconDownload, IconExternal, IconSettings, IconGrid, IconChevronLeft } from 'aelux-components'
import { invoke } from '@tauri-apps/api/core'
import { useApp } from '../store'

export type ViewKey = 'home' | 'download' | 'multiplayer' | 'settings' | 'more'

/** 顶栏导航：启动 / 下载 / 联机 / 设置 / 更多 */
const TABS: { key: ViewKey; label: string; icon: React.ReactNode }[] = [
  { key: 'home', label: '启动', icon: <IconPlay size={15} /> },
  { key: 'download', label: '下载', icon: <IconDownload size={15} /> },
  { key: 'multiplayer', label: '联机', icon: <IconExternal size={15} /> },
  { key: 'settings', label: '设置', icon: <IconSettings size={15} /> },
  { key: 'more', label: '更多', icon: <IconGrid size={15} /> },
]

/**
 * 顶部标题栏（高 48px）：
 *   左侧 Logo + 文字（17px 白）；中间居中水平胶囊标签组；
 *   右侧最小化 + 关闭（28×28 圆形按钮）。
 *   处于子页时，改为「返回箭头 + 子页名」并隐藏顶部标签。
 */
export function TitleBar({
  subTitle,
  onBack,
}: {
  /** 子页标题；给出时显示返回栏 */
  subTitle?: string
  /** 返回回调 */
  onBack?: () => void
}) {
  const { view, setView, browserMode } = useApp()

  if (subTitle) {
    return (
      <div className="aelux-titlebar" data-tauri-drag-region>
        <div className="aelux-subbar">
          <button
            type="button"
            className="aelux-subbar__back"
            aria-label="返回"
            onClick={onBack}
          >
            <IconChevronLeft size={16} />
          </button>
          <span>{subTitle}</span>
        </div>
      </div>
    )
  }

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
            className={`alx-tab${view === t.key ? ' is-active' : ''}`}
            onClick={() => setView(t.key)}
          >
            <span className="alx-tab__icon" aria-hidden="true">
              {t.icon}
            </span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <div className="aelux-titlebar__actions">
        <button
          type="button"
          className="aelux-titlebar__win"
          aria-label="最小化"
          onClick={() => invoke('minimize_window')}
        >
          <svg width="13" height="13" viewBox="0 0 15 15" aria-hidden="true">
            <path d="M0,0 h15 v2 h-15 v-2 Z" fill="currentColor" />
          </svg>
        </button>
        <button
          type="button"
          className="aelux-titlebar__win aelux-titlebar__win--close"
          aria-label="关闭"
          onClick={() => invoke('close_window')}
        >
          <svg width="13" height="13" viewBox="0 0 20 20" aria-hidden="true">
            <path
              d="M2,0 L0,2 8,10 0,18 2,20 10,12 18,20 20,18 12,10 20,2 18,0 10,8 Z"
              fill="currentColor"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
