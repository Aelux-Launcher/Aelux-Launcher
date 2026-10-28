import type { ReactNode } from 'react'
import { cx } from 'aelux-components'

interface Props {
  title: string
  /** 副文本（12px / 60% 透明），显示在标题下方 */
  info?: string
  /** 左侧图标 */
  icon?: ReactNode
  selected?: boolean
  onClick?: () => void
  /** 右侧操作区 */
  trailing?: ReactNode
}

/**
 * 左栏导航项（对应上游实现的单选型列表项）：
 *   高 36、左侧 5px 选中条（圆角 2、主蓝 #1370f3，上下内缩 6px）、
 *   图标 24px、标题 14px。
 *   选中文字转 #1370f3（高 < 40 的规格）、未选中 #343d4a。
 *
 * 根元素用 div 而非 button：右侧操作区（trailing）常常是按钮，
 * button 套 button 是无效 HTML，浏览器会拆分标签导致点击与样式异常。
 */
export function AlxNavItem({ title, info, icon, selected, onClick, trailing }: Props) {
  return (
    <div
      className={cx('alx-nav-item', selected && 'is-active')}
      role="button"
      tabIndex={0}
      aria-current={selected ? 'true' : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.()
        }
      }}
    >
      <span className="alx-nav-item__check" aria-hidden="true" />
      {icon && <span className="alx-nav-item__logo">{icon}</span>}
      <span className="alx-nav-item__title">
        {title}
        {info && <span className="alx-nav-item__info">{info}</span>}
      </span>
      {trailing}
    </div>
  )
}
