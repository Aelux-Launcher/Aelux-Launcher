import type { ReactNode } from 'react'
import { cx } from 'aelux-components'

interface Props {
  title: string
  /** 左侧图标 */
  icon?: ReactNode
  selected?: boolean
  onClick?: () => void
  /** 右侧操作区 */
  trailing?: ReactNode
}

/**
 * 左栏导航项（单选型）：
 *   高 36、左侧 6px 选中条（ColorBrush3）、图标 16px、
 *   选中文字转 #1370f3、未选中 #343d4a、悬停底色 #e0eafd。
 */
export function AlxNavItem({ title, icon, selected, onClick, trailing }: Props) {
  return (
    <button
      type="button"
      className={cx('alx-nav-item', selected && 'is-active')}
      aria-current={selected ? 'true' : undefined}
      onClick={onClick}
    >
      <span className="alx-nav-item__check" aria-hidden="true" />
      {icon && <span className="alx-nav-item__logo">{icon}</span>}
      <span className="alx-nav-item__title">{title}</span>
      {trailing}
    </button>
  )
}
