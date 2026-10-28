import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { cx } from 'aelux-components'

/* ============================================================================
 * 一组与上游启动器控件规格一一对应的基础控件。
 *
 * 规格（全部来自逐项核对的源码研究）：
 *   按钮      圆角 3 · 边框 1px · 文字色 = 边框色 · 悬停转主蓝 · 按下缩放 .955
 *   输入框    高 28 · 圆角 3 · 边框 #96c0f9 · 聚焦转 #1370f3
 *   下拉      高 28 · 圆角 3 · 箭头 15px · 展开箭头旋转 180°
 *   单选      外圈 18px 圆 · 内点 9px
 *   复选      外框 18px 圆角 3 · 对勾 12px
 *   滑块      轨道 4px · 圆点 10px · 悬停放大 1.3
 *   提示条    左边框 3px · 圆角 2 · Blue/Red/Yellow 三主题
 *   胶囊标签  圆角 13.5 · 高 27 · 选中蓝底白字
 * ========================================================================== */

/* --------------------------------- 按钮 --------------------------------- */

export interface AlxButtonProps {
  children?: ReactNode
  /** 前置图标 */
  leftIcon?: ReactNode
  /** 后置图标 */
  rightIcon?: ReactNode
  /** 高亮型：常态边框 #0b5bcb */
  highlight?: boolean
  /** 危险型：常态边框 #ce2111 */
  danger?: boolean
  /** 块级（撑满） */
  block?: boolean
  /** 大号（44px） */
  large?: boolean
  disabled?: boolean
  onClick?: () => void
  title?: string
  className?: string
  type?: 'button' | 'submit'
}

/** 描边按钮（对应上游 Button 控件的 Normal / Highlight / Red 三型）。 */
export function AlxButton({
  children,
  leftIcon,
  rightIcon,
  highlight,
  danger,
  block,
  large,
  disabled,
  onClick,
  title,
  className,
  type = 'button',
}: AlxButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'alx-btn',
        highlight && 'alx-btn--primary',
        danger && 'alx-btn--danger',
        block && 'alx-btn--block',
        large && 'alx-btn--lg',
        className,
      )}
      disabled={disabled}
      onClick={onClick}
      title={title}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  )
}

/* --------------------------------- 输入框 -------------------------------- */

export interface AlxInputProps {
  value?: string
  defaultValue?: string
  placeholder?: string
  disabled?: boolean
  /** 前缀图标（14px） */
  prefix?: ReactNode
  onChange?: (value: string) => void
  onEnter?: () => void
  className?: string
  style?: React.CSSProperties
}

/** 单行输入框（高 28 · 圆角 3 · 边框 #96c0f9）。 */
export function AlxInput({
  value,
  defaultValue,
  placeholder,
  disabled,
  prefix,
  onChange,
  onEnter,
  className,
  style,
}: AlxInputProps) {
  return (
    <span style={{ position: 'relative', display: 'block', ...style }}>
      {prefix && (
        <span
          style={{
            position: 'absolute',
            left: 9,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'inline-flex',
            color: 'var(--alx-1)',
            pointerEvents: 'none',
          }}
        >
          {prefix}
        </span>
      )}
      <input
        className={cx('alx-input', className)}
        style={prefix ? { paddingLeft: 30 } : undefined}
        value={value}
        defaultValue={defaultValue}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter?.()
        }}
      />
    </span>
  )
}

/* --------------------------------- 下拉框 -------------------------------- */

export interface AlxSelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface AlxSelectProps {
  value?: string
  defaultValue?: string
  options: AlxSelectOption[]
  disabled?: boolean
  onChange?: (value: string) => void
  className?: string
  style?: React.CSSProperties
}

/** 下拉框（高 28 · 圆角 3 · 箭头区 21.5px）。 */
export function AlxSelect({
  value,
  defaultValue,
  options,
  disabled,
  onChange,
  className,
  style,
}: AlxSelectProps) {
  return (
    <select
      className={cx('alx-select', className)}
      style={style}
      value={value}
      defaultValue={defaultValue}
      disabled={disabled}
      onChange={(e) => onChange?.(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

/* --------------------------------- 单选框 -------------------------------- */

export interface AlxRadioProps {
  checked: boolean
  onChange?: () => void
  children?: ReactNode
  disabled?: boolean
  name?: string
  className?: string
}

/** 单选按钮（外圈 18px 圆 · 内点 9px · 选中边框 #0b5bcb）。 */
export function AlxRadio({
  checked,
  onChange,
  children,
  disabled,
  name,
  className,
}: AlxRadioProps) {
  const id = useId()
  return (
    <label className={cx('alx-radio', className)} htmlFor={id}>
      <input
        id={id}
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange?.()}
      />
      <span className="alx-radio__box">
        <span className="alx-radio__dot" />
      </span>
      {children}
    </label>
  )
}

/* --------------------------------- 复选框 -------------------------------- */

export interface AlxCheckProps {
  checked: boolean
  onChange?: (checked: boolean) => void
  children?: ReactNode
  disabled?: boolean
  className?: string
}

/** 复选框（外框 18px 圆角 3 · 对勾 12px）。 */
export function AlxCheck({ checked, onChange, children, disabled, className }: AlxCheckProps) {
  const id = useId()
  return (
    <label className={cx('alx-check', className)} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span className="alx-check__box">
        <svg className="alx-check__mark" viewBox="0 0 12 12" aria-hidden="true">
          <path
            d="M0,6 L1.5,4.5 L4.5,7.5 L10.5,1.5 L12,3 L4.5,10.5 Z"
            fill="currentColor"
          />
        </svg>
      </span>
      {children}
    </label>
  )
}

/* --------------------------------- 滑块 --------------------------------- */

export interface AlxSliderProps {
  value: number
  min: number
  max: number
  step?: number
  disabled?: boolean
  onChange?: (value: number) => void
  /** 右侧数值显示（可选） */
  format?: (value: number) => string
  className?: string
}

/** 滑块（轨道 4px · 圆点 10px · 悬停放大 1.3）。 */
export function AlxSlider({
  value,
  min,
  max,
  step = 1,
  disabled,
  onChange,
  format,
  className,
}: AlxSliderProps) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
      <span className={cx('alx-slider', className)} style={disabled ? { opacity: 0.5 } : undefined}>
        <span className="alx-slider__track" />
        <span className="alx-slider__fill" style={{ width: `${pct}%` }} />
        <span className="alx-slider__dot" style={{ left: `${pct}%` }} />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange?.(Number(e.target.value))}
          style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', cursor: disabled ? 'default' : 'pointer' }}
        />
      </span>
      {format && (
        <span style={{ fontSize: 13, color: 'var(--alx-1)', minWidth: 64, textAlign: 'right' }}>
          {format(value)}
        </span>
      )}
    </span>
  )
}

/* -------------------------------- 提示条 -------------------------------- */

export type AlxHintTheme = 'blue' | 'red' | 'yellow'

export interface AlxHintProps {
  theme?: AlxHintTheme
  children?: ReactNode
  /** 右侧关闭按钮 */
  onClose?: () => void
  className?: string
  style?: React.CSSProperties
}

/** 提示条（左边框 3px · 圆角 2 · 三主题配色）。 */
export function AlxHint({ theme = 'blue', children, onClose, className, style }: AlxHintProps) {
  return (
    <div
      className={cx('alx-hint', theme === 'red' && 'alx-hint--red', theme === 'yellow' && 'alx-hint--yellow', className)}
      style={style}
    >
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
      {onClose && (
        <button type="button" className="alx-hint__close" aria-label="不再提示" onClick={onClose}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M2,0 L0,2 4.5,6.5 0,11 2,13 6.5,8.5 11,13 13,11 8.5,6.5 13,2 11,0 6.5,4.5 Z"
              fill="currentColor"
            />
          </svg>
        </button>
      )}
    </div>
  )
}

/* ------------------------------- 胶囊标签 ------------------------------- */

export interface AlxPillProps {
  active?: boolean
  children?: ReactNode
  onClick?: () => void
  className?: string
  /** 淡色型：常态浅蓝底蓝字（分类筛选用） */
  soft?: boolean
}

/** 胶囊标签（圆角 13.5 · 高 27 · 选中蓝底白字）。 */
export function AlxPill({ active, children, onClick, className, soft }: AlxPillProps) {
  return (
    <button
      type="button"
      className={cx('alx-pill', soft && 'alx-pill--soft', active && 'is-active', className)}
      onClick={onClick}
      aria-pressed={active}
    >
      {children}
    </button>
  )
}

/* ------------------------------- 搜索框 -------------------------------- */

export interface AlxSearchBoxProps {
  value?: string
  defaultValue?: string
  placeholder?: string
  onChange?: (value: string) => void
  onEnter?: () => void
  className?: string
}

/** 搜索框（本体即一张卡片，高 40，放大镜 14px + 清除按钮 24px）。 */
export function AlxSearchBox({
  value,
  defaultValue,
  placeholder,
  onChange,
  onEnter,
  className,
}: AlxSearchBoxProps) {
  const [inner, setInner] = useState(value ?? defaultValue ?? '')
  const current = value ?? inner

  function update(v: string) {
    if (value === undefined) setInner(v)
    onChange?.(v)
  }

  return (
    <div className={cx('alx-searchbox', className)}>
      <span className="alx-searchbox__icon" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="6.6" cy="6.6" r="4.6" stroke="currentColor" strokeWidth="1.4" />
          <path d="M10.2 10.2 L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </span>
      <input
        value={current}
        placeholder={placeholder}
        onChange={(e) => update(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter?.()
        }}
      />
      {current && (
        <button
          type="button"
          className="alx-searchbox__clear"
          aria-label="清除"
          onClick={() => update('')}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M2,0 L0,2 4.5,6.5 0,11 2,13 6.5,8.5 11,13 13,11 8.5,6.5 13,2 11,0 6.5,4.5 Z"
              fill="currentColor"
            />
          </svg>
        </button>
      )}
    </div>
  )
}

/* ------------------------------ 悬浮大按钮 ------------------------------ */

export interface AlxFloatButtonProps {
  children?: ReactNode
  leftIcon?: ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
}

/** 底部悬浮大按钮（高 52 · 圆角 20.8 · 蓝底浅蓝字）。 */
export function AlxFloatButton({
  children,
  leftIcon,
  onClick,
  disabled,
  className,
  style,
}: AlxFloatButtonProps) {
  return (
    <button
      type="button"
      className={cx('alx-float-btn', className)}
      onClick={onClick}
      disabled={disabled}
      style={style}
    >
      {leftIcon}
      {children}
    </button>
  )
}

/* ------------------------------- 列表条目 ------------------------------- */

export interface AlxListItemProps {
  title: ReactNode
  /** 副文本（12px / 60% 透明） */
  info?: ReactNode
  /** 左侧图标（34px 圆角方块） */
  icon?: ReactNode
  onClick?: () => void
  /** 右侧操作区（默认悬停才显示） */
  actions?: ReactNode
  /** 右侧操作区始终显示 */
  actionsAlways?: boolean
  className?: string
}

/** 列表条目（高 42 · 图标 34px · 标题 14px · 副文本 12px）。 */
export function AlxListItem({
  title,
  info,
  icon,
  onClick,
  actions,
  actionsAlways,
  className,
}: AlxListItemProps) {
  return (
    <div className={cx('alx-listitem', className)} onClick={onClick}>
      {icon && <span className="alx-listitem__logo">{icon}</span>}
      <span className="alx-listitem__main">
        <span className="alx-listitem__title">{title}</span>
        {info != null && <span className="alx-listitem__info">{info}</span>}
      </span>
      {actions && (
        <span
          className="alx-listitem__actions"
          style={actionsAlways ? { opacity: 1 } : undefined}
          onClick={(e) => e.stopPropagation()}
        >
          {actions}
        </span>
      )}
    </div>
  )
}

/* ------------------------------ 图标按钮 -------------------------------- */

export interface AlxIconButtonProps {
  children: ReactNode
  label: string
  onClick?: () => void
  /** 黑色主题（用于浅色底上的次要操作） */
  black?: boolean
  className?: string
}

/** 圆形图标按钮（25×25 · 悬停淡蓝底）。 */
export function AlxIconButton({ children, label, onClick, black, className }: AlxIconButtonProps) {
  return (
    <button
      type="button"
      className={cx('alx-iconbtn', black && 'alx-iconbtn--black', className)}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/* --------------------------------- 弹窗 --------------------------------- */

export interface AlxModalProps {
  open: boolean
  title: string
  children?: ReactNode
  /** 底部按钮 */
  actions?: ReactNode
  onClose?: () => void
}

/** 模态弹窗（圆角 7 · 标题 23px 主蓝 · 正文 15px 灰）。 */
export function AlxModal({ open, title, children, actions, onClose }: AlxModalProps) {
  if (!open) return null
  return (
    <div className="alx-modal" onClick={onClose}>
      <div className="alx-modal__box" onClick={(e) => e.stopPropagation()}>
        <h3 className="alx-modal__title">{title}</h3>
        <div className="alx-modal__body">{children}</div>
        <div className="alx-modal__actions">{actions}</div>
      </div>
    </div>
  )
}
