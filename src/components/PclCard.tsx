import { useState } from 'react'
import type { ReactNode } from 'react'
import { IconChevronDown } from 'aelux-components'
import { cx } from 'aelux-components'

interface Props {
  /** 卡片标题（PCL MyCard 主标题，粗体 13px） */
  title?: ReactNode
  /** 标题右侧内容 */
  extra?: ReactNode
  /** 可折叠 */
  collapsible?: boolean
  /** 初始是否展开 */
  defaultOpen?: boolean
  /** 去掉内边距（用于整块列表） */
  flush?: boolean
  children?: ReactNode
  className?: string
}

/**
 * 卡片 —— 复刻 PCL 的 `MyCard`：
 *   圆角 5、背景 rgba(255,255,255,.96)、阴影 0.07 透明度（悬停 0.4 且转蓝 #4890f5）、
 *   标题粗体 13px 靠左（悬停转深蓝 #0b5bcb）、右侧可折叠箭头。
 */
export function PclCard({
  title,
  extra,
  collapsible,
  defaultOpen = true,
  flush,
  children,
  className,
}: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const expanded = !collapsible || open

  return (
    <section className={cx('pcl-card', className)}>
      {(title != null || extra != null || collapsible) && (
        <div className="pcl-card__title">
          <span>{title}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {extra}
            {collapsible && (
              <button
                type="button"
                className={cx('pcl-card__toggle', open && 'is-open')}
                aria-label={open ? '收起' : '展开'}
                aria-expanded={open}
                onClick={() => setOpen(!open)}
              >
                <IconChevronDown size={15} />
              </button>
            )}
          </span>
        </div>
      )}
      {expanded && (
        <div className={cx('pcl-card__body', flush && 'pcl-card__body--flush')}>
          {children}
        </div>
      )}
    </section>
  )
}
