import type { ReactNode } from 'react'
import { ListItem } from 'aelux-components'

export interface PclNavItem {
  key: string
  title: string
  /** 右侧小标记（例如资源数量、角标） */
  badge?: ReactNode
  icon?: ReactNode
}

interface Props {
  /** 左栏列表项（对应 PCL 的 PanMainLeft 列表） */
  nav?: PclNavItem[]
  active?: string
  onSelect?: (key: string) => void
  /** 自定义左栏内容，优先于 nav */
  left?: ReactNode
  /** 左栏宽度；PCL 启动页为 300，其余页面较窄 */
  leftWidth?: number
  /** 右栏内容 */
  children?: ReactNode
}

/**
 * PCL 式两栏页面骨架 —— 对应 PCL 的 `PanMain`：
 *   左侧 `PanMainLeft`（列表 / 控制区，Auto 宽度）+ 右侧 `PanMainRight`（内容区，1*）。
 * 页面内容在右栏独立滚动，左栏保持固定。
 */
export function PclPage({ nav, active, onSelect, left, leftWidth = 260, children }: Props) {
  return (
    <div className="pcl-page">
      <aside className="pcl-page__left" style={{ width: leftWidth }}>
        {left ??
          nav?.map((item) => (
            <ListItem
              key={item.key}
              title={item.title}
              icon={item.icon}
              meta={item.badge}
              selected={active === item.key}
              onClick={onSelect ? () => onSelect(item.key) : undefined}
              className="pcl-page__nav-item"
            />
          ))}
      </aside>
      <section className="pcl-page__right">{children}</section>
    </div>
  )
}
