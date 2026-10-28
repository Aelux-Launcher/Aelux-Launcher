import { useState } from 'react'
import type { CSSProperties } from 'react'
import { formatDownloadCount, type ResourceProject } from 'aelux-launcher-lib'
import { AlxListItem } from '../components/AlxControls'
import { AlxBlockIcon } from '../components/AlxBlockIcon'

/**
 * 社区资源条目与分页（下载页右栏下半部分）。
 *
 * 资源条目沿用上游启动器的信息层级：
 *   缩略图 50×50（圆角 6）· 标题 14px + 灰色后缀 12px · 分类标签 11px ·
 *   描述 12px · 底部元信息 12px（兼容版本 / 下载量 / 更新时间 / 来源）。
 * 缩略图加载失败时回退为方块图标，避免出现破图。
 */

/** 相对时间（12 天前 / 3 小时前 / 刚刚） */
function relativeTime(iso: string): string {
  if (!iso) return '未知'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '未知'
  const minutes = Math.floor((Date.now() - t) / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} 个月前`
  return `${Math.floor(months / 12)} 年前`
}

/** 资源缩略图（远程图失败时回退为方块图标） */
function Thumb({ url }: { url: string }) {
  const [failed, setFailed] = useState(false)

  if (!url || failed) return <AlxBlockIcon size={32} />

  return (
    <img
      src={url}
      alt=""
      onError={() => setFailed(true)}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  )
}

export interface ResourceRowProps {
  project: ResourceProject
  onOpen: (project: ResourceProject) => void
}

/** 单条资源（在 AlxListItem 内部用内联样式复刻资源条目的排版） */
export function ResourceRow({ project, onOpen }: ResourceRowProps) {
  const source = project.source === 'curseforge' ? 'CurseForge' : 'Modrinth'
  const gameVersion = project.gameVersions[0] ?? '—'

  return (
    <AlxListItem
      title={
        <span
          style={{
            display: 'grid',
            gridTemplateColumns: '50px 1fr',
            gap: 8,
            alignItems: 'start',
            width: '100%',
          }}
        >
          <span
            style={{
              width: 50,
              height: 50,
              borderRadius: 6,
              overflow: 'hidden',
              background: 'var(--alx-8)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Thumb url={project.iconUrl} />
          </span>

          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {/* 标题 + 灰色后缀 */}
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
              <span
                style={{
                  fontSize: 14,
                  color: 'var(--alx-1)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {project.title}
              </span>
              {project.titleSuffix && (
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--alx-gray-1)',
                    opacity: 0.4,
                    flex: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {project.titleSuffix}
                </span>
              )}
            </span>

            {/* 分类标签 */}
            {project.categories.length > 0 && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  marginTop: 2,
                  flexWrap: 'wrap',
                }}
              >
                {project.categories.map((c) => (
                  <span
                    key={c}
                    style={{
                      padding: '1px 3px',
                      borderRadius: 3,
                      background: 'rgba(0, 0, 0, 0.067)',
                      fontSize: 11,
                      color: '#868686',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c}
                  </span>
                ))}
              </span>
            )}

            {/* 描述 */}
            {project.description && (
              <span
                style={{
                  marginTop: 2,
                  fontSize: 12,
                  color: 'var(--alx-gray-3)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {project.description}
              </span>
            )}

            {/* 元信息 */}
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                marginTop: 3,
                fontSize: 12,
                color: 'var(--alx-gray-4)',
                whiteSpace: 'nowrap',
              }}
            >
              <span>◎ {gameVersion}+</span>
              <span>·</span>
              <span>↓ {formatDownloadCount(project.downloads)}</span>
              <span>·</span>
              <span>↑ {relativeTime(project.updatedAt)}</span>
              <span>·</span>
              <span>⊕ {source}</span>
            </span>
          </span>
        </span>
      }
      onClick={() => onOpen(project)}
    />
  )
}

export interface ResourcePagerProps {
  /** 当前页（从 1 开始） */
  page: number
  /** 命中总数 */
  total: number
  /** 每页条数 */
  size: number
  onChange: (page: number) => void
}

/** 分页导航（« ‹ 1 2 3 › »） */
export function ResourcePager({ page, total, size, onChange }: ResourcePagerProps) {
  const pages = Math.max(1, Math.ceil(total / Math.max(size, 1)))

  // 当前页附近最多显示 5 个页码。
  const start = Math.max(1, Math.min(page - 2, pages - 4))
  const end = Math.min(pages, start + 4)
  const numbers: number[] = []
  for (let i = start; i <= end; i++) numbers.push(i)

  const btnStyle: CSSProperties = {
    height: 26,
    minWidth: 26,
    padding: '0 8px',
    border: '1px solid var(--alx-5)',
    borderRadius: 3,
    background: 'transparent',
    color: 'var(--alx-1)',
    fontSize: 12,
    fontFamily: 'inherit',
    cursor: 'pointer',
  }

  const items: { key: string; label: string; target: number; disabled: boolean; active?: boolean }[] =
    [
      { key: 'first', label: '«', target: 1, disabled: page <= 1 },
      { key: 'prev', label: '‹', target: page - 1, disabled: page <= 1 },
      ...numbers.map((n) => ({
        key: `p${n}`,
        label: String(n),
        target: n,
        disabled: false,
        active: n === page,
      })),
      { key: 'next', label: '›', target: page + 1, disabled: page >= pages },
      { key: 'last', label: '»', target: pages, disabled: page >= pages },
    ]

  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          style={{
            ...btnStyle,
            borderColor: it.active ? 'var(--alx-3)' : 'var(--alx-5)',
            color: it.active ? 'var(--alx-3)' : 'var(--alx-1)',
            opacity: it.disabled ? 0.45 : 1,
            cursor: it.disabled ? 'default' : 'pointer',
          }}
          disabled={it.disabled}
          onClick={() => onChange(it.target)}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}
