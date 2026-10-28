import { useState } from 'react'
import type { ReactNode } from 'react'
import { IconChevronDown } from 'aelux-components'
import { cx } from 'aelux-components'

interface Props {
  /** 卡片标题（粗体 13px，左对齐） */
  title?: ReactNode
  /** 标题右侧内容 */
  extra?: ReactNode
  /** 可折叠 */
  collapsible?: boolean
  /** 初始是否展开 */
  defaultOpen?: boolean
  /** 无标题（只有内容） */
  headless?: boolean
  /** 内容区样式：默认（让开标题 25px）、紧凑、无边距 */
  padding?: 'default' | 'tight' | 'flush'
  children?: ReactNode
  className?: string
  onClickTitle?: () => void
}

/**
 * 卡片（对应上游实现的 Card 控件）：
 *   圆角 5、底 rgba(255,255,255,.961)、阴影 0.07 透明度
 *   （悬停 0.4 且转蓝 #4890f5，90ms）
 *   标题粗体 13px 靠左（悬停转深蓝 #0b5bcb）、右侧可折叠箭头（250ms 旋转）。
 *   折叠态高度 40。
 */
export function AlxCard({
  title,
  extra,
  collapsible,
  defaultOpen = true,
  headless,
  padding = 'default',
  children,
  className,
  onClickTitle,
}: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const expanded = !collapsible || open

  const body = expanded ? (
    <div
      className={cx(
        'alx-card__body',
        padding === 'tight' && 'alx-card__body--tight',
        padding === 'flush' && 'alx-card__body--flush',
      )}
    >
      {children}
    </div>
  ) : null

  // 标题可点击（折叠卡片）：整行标题是一个按钮
  if (onClickTitle) {
    return (
      <section className={cx('alx-card', className)}>
        <button
          type="button"
          className="alx-card__title alx-card__title--button"
          aria-expanded={open}
          onClick={onClickTitle}
        >
          <span>{title}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {extra}
            {collapsible && (
              <span
                className={cx('alx-card__toggle', open && 'is-open')}
                aria-hidden="true"
                onClick={(e) => {
                  e.stopPropagation()
                  setOpen(!open)
                }}
              >
                <IconChevronDown size={15} />
              </span>
            )}
          </span>
        </button>
        {body}
      </section>
    )
  }

  return (
    <section className={cx('alx-card', className)}>
      {!headless && (title != null || extra != null || collapsible) && (
        <div className="alx-card__title">
          <span>{title}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {extra}
            {collapsible && (
              <button
                type="button"
                className={cx('alx-card__toggle', open && 'is-open')}
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
      {body}
    </section>
  )
}
