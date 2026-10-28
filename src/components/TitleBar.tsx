import { Button, IconButton, Badge, IconSun, IconMoon } from 'aelux-components'
import { invoke } from '@tauri-apps/api/core'
import { useApp } from '../store'

interface Props {
  updateAvailable?: boolean
}

/**
 * 自定义标题栏：窗口无系统边框（transparent + decorations:false），需自行实现拖拽与窗口控制。
 * 浅色主题（与全局一致，拒绝黑色），右侧含主题切换与窗口按钮。
 */
export function TitleBar({ updateAvailable }: Props) {
  const { theme, setTheme } = useApp()

  return (
    <div className="aelux-titlebar" data-tauri-drag-region>
      <span className="aelux-titlebar__title" data-tauri-drag-region>
        Aelux 启动器
      </span>

      <div className="aelux-titlebar__center">
        {updateAvailable && (
          <Badge status="warning" className="aelux-titlebar__badge">
            更新可用
          </Badge>
        )}
      </div>

      <div className="aelux-titlebar__actions">
        <IconButton
          size="sm"
          variant="ghost"
          label={theme === 'dark' ? '切换到浅色' : '切换到深色'}
          icon={theme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        />
        <Button variant="ghost" size="sm" onClick={() => invoke('minimize_window')} aria-label="最小化">
          —
        </Button>
        <Button variant="ghost" size="sm" onClick={() => invoke('toggle_maximize')} aria-label="最大化">
          ▢
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="aelux-titlebar__close"
          onClick={() => invoke('close_window')}
          aria-label="关闭"
        >
          ×
        </Button>
      </div>
    </div>
  )
}
