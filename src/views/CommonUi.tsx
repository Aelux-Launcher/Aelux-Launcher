import type { ReactNode } from 'react'

/**
 * 表单行：左标签 + 右控件。
 *
 * 布局按设置页的规格来：grid `auto 1fr`、标签右对齐 13px、列间距 18px、行间距 9px。
 * 这里全部走内联样式，不新增任何 CSS 类。
 */
export function Row({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  /** 控件下方的补充说明 */
  hint?: ReactNode
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        alignItems: 'center',
        gap: 18,
        marginBottom: 9,
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: 'var(--alx-1)',
          textAlign: 'right',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
      <div style={{ minWidth: 0 }}>
        {children}
        {hint != null && (
          <div
            style={{
              fontSize: 12,
              lineHeight: '18px',
              color: 'var(--alx-1)',
              opacity: 0.7,
              marginTop: 4,
            }}
          >
            {hint}
          </div>
        )}
      </div>
    </div>
  )
}

/** 灰色说明文字（70% 不透明）。 */
export function Note({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 12, lineHeight: '18px', color: 'var(--alx-1)', opacity: 0.7 }}>
      {children}
    </div>
  )
}

/** 一行按钮（卡片底部常见的横向按钮组）。 */
export function ButtonRow({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>{children}</div>
  )
}

/** 横向排列的一组单选项。 */
export function RadioRow({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center' }}>{children}</div>
  )
}
