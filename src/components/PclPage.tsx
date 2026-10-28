import type { ReactNode } from 'react'
import { cx } from 'aelux-components'
import { PclNavItem } from './PclNavItem'

export interface PclNavEntry {
  key: string
  title: string
  /** 左侧图标 */
  icon?: ReactNode
  /** 分组标题，显示在该项上方（PCL 的 Opacity=0.6 灰字） */
  group?: string
  /** 右侧操作区 */
  trailing?: ReactNode
}

interface Props {
  /** 左栏导航项 */
  nav?: PclNavEntry[]
  active?: string
  onSelect?: (key: string) => void
  /** 自定义左栏内容（优先于 nav） */
  left?: ReactNode
  /** 左栏宽度；PCL 各页在 170~210 之间 */
  leftWidth?: number
  /** 右栏内容 */
  children?: ReactNode
  className?: string
}

/**
 * PCL 式两栏页面 —— 对应 PCL 的 `PanMain`：
 *   左栏 `MyPageLeft`（白底 + 列表项，进入时逐项滑入）
 *   右栏 `MyPageRight`（浅蓝渐变底 + 白色卡片）
 */
export function PclPage({ nav, active, onSelect, left, leftWidth = 190, children, className }: Props) {
  return (
    <div className={cx('pcl-page', className)}>
      <aside className="pcl-page__left" style={{ width: leftWidth }}>
        {left ?? (
          <div className="pcl-nav pcl-stagger">
            {nav?.map((item) => (
              <div key={item.key}>
                {item.group && <div className="pcl-nav-group">{item.group}</div>}
                <PclNavItem
                  title={item.title}
                  icon={item.icon}
                  trailing={item.trailing}
                  selected={active === item.key}
                  onClick={onSelect ? () => onSelect(item.key) : undefined}
                />
              </div>
            ))}
          </div>
        )}
      </aside>
      <section className="pcl-page__right">{children}</section>
    </div>
  )
}
