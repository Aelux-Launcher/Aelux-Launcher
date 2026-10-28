import type { ReactNode } from 'react'
import { cx } from 'aelux-components'
import { AlxNavItem } from './AlxNavItem'

export interface AlxNavEntry {
  key: string
  title: string
  /** 左侧图标 */
  icon?: ReactNode
  /** 分组标题，显示在该项上方（12px，60% 不透明度） */
  group?: string
  /** 右侧操作区 */
  trailing?: ReactNode
}

interface Props {
  /** 左栏导航项 */
  nav?: AlxNavEntry[]
  active?: string
  onSelect?: (key: string) => void
  /** 自定义左栏内容（优先于 nav） */
  left?: ReactNode
  /** 左栏宽度 */
  leftWidth?: number
  /** 右栏内容 */
  children?: ReactNode
  className?: string
}

/**
 * 两栏页面骨架：
 *   左栏（白底 + 列表项，进入时逐项滑入）
 *   右栏（浅蓝渐变底 + 白色卡片）
 */
export function AlxPage({ nav, active, onSelect, left, leftWidth = 190, children, className }: Props) {
  return (
    <div className={cx('alx-page', className)}>
      <aside className="alx-page__left" style={{ width: leftWidth }}>
        {left ?? (
          <div className="alx-nav">
            {nav?.map((item) => (
              <div key={item.key}>
                {item.group && <div className="alx-nav-group">{item.group}</div>}
                <AlxNavItem
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
      <section className="alx-page__right">{children}</section>
    </div>
  )
}
