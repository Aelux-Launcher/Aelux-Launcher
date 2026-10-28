import { Button, Badge } from 'aelux-components'
import { invoke } from '@tauri-apps/api/core'

interface Props {
  onToggleTheme: () => void
  updateAvailable?: boolean
}

/** 自定义标题栏：窗口无系统边框（transparent + decorations:false），需自行实现拖拽与窗口控制。 */
export function TitleBar({ onToggleTheme, updateAvailable }: Props) {
  return (
    <div className="aelux-titlebar" data-tauri-drag-region>
      <span className="aelux-titlebar__title" data-tauri-drag-region>
        Aelux Launcher
      </span>

      <div className="aelux-titlebar__center">
        {updateAvailable && (
          <Badge status="warning" className="aelux-titlebar__badge">
            更新
          </Badge>
        )}
      </div>

      <div className="aelux-titlebar__actions">
        <Button variant="ghost" size="sm" onClick={onToggleTheme} aria-label="切换主题">
          ◐
        </Button>
        <Button variant="ghost" size="sm" onClick={() => invoke('minimize_window')} aria-label="最小化">
          —
        </Button>
        <Button variant="ghost" size="sm" onClick={() => invoke('toggle_maximize')} aria-label="最大化">
          ▢
        </Button>
        <Button variant="ghost" size="sm" onClick={() => invoke('close_window')} aria-label="关闭">
          ×
        </Button>
      </div>
    </div>
  )
}
