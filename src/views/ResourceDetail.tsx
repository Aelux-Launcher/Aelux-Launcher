import { useEffect } from 'react'
import { IconDownload, IconStar } from 'aelux-components'
import type { ResourceKind } from 'aelux-launcher-lib'
import { useApp } from '../store'
import { AlxPage } from '../components/AlxPage'
import { AlxCard } from '../components/AlxCard'
import { AlxBlockIcon } from '../components/AlxBlockIcon'
import { AlxButton, AlxListItem, AlxPill } from '../components/AlxControls'
import { Note } from './CommonUi'

/**
 * 社区资源详情子页（从下载页的资源条目进入）。
 *
 * 数据全部走 lib-core：
 *   - 资源元数据由 ResourceDetailLoader 拉取（store 的 loadResourceDetail）；
 *   - 版本列表按「加载器 + 游戏版本」分组展示。
 */

/** 资源类型 → 中文名。 */
const KIND_TITLE: Record<ResourceKind, string> = {
  mod: 'Mod',
  pack: '整合包',
  datapack: '数据包',
  resourcepack: '资源包',
  shader: '光影包',
}

export function ResourceDetail({
  resourceKind,
  projectId,
  title,
}: {
  resourceKind: ResourceKind
  projectId: string
  title: string
}) {
  const { resourceDetailData, resourceDetailLoading, resourceError, loadResourceDetail } = useApp()

  useEffect(() => {
    void loadResourceDetail(projectId)
  }, [projectId, loadResourceDetail])

  const project = resourceDetailData?.project
  const groups = resourceDetailData?.groups ?? []
  const versions = groups.flatMap((g) =>
    g.versions.map((v) => ({ ...v, loader: g.loader, gameVersion: g.gameVersion })),
  )

  const left = (
    <div className="alx-nav">
      <div className="alx-nav-group">资源信息</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 13px' }}>
        <div style={{ fontSize: 13, color: 'var(--alx-1)' }}>{KIND_TITLE[resourceKind]}</div>
        <Note>{title}</Note>
      </div>
    </div>
  )

  return (
    <AlxPage left={left} leftWidth={220}>
      {resourceError && (
        <div style={{ marginBottom: 14, fontSize: 13, color: '#bf0b0b' }}>
          加载失败：{resourceError}
        </div>
      )}

      <AlxCard
        title={project?.title ?? title}
        extra={
          <span style={{ fontSize: 12, color: 'var(--alx-1)', opacity: 0.6 }}>
            {project?.author ? `作者 ${project.author}` : ''}
          </span>
        }
      >
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div
            style={{
              width: 64,
              height: 64,
              flex: '0 0 64px',
              borderRadius: 'var(--alx-radius-thumb)',
              background: 'var(--alx-8)',
              display: 'grid',
              placeItems: 'center',
              overflow: 'hidden',
            }}
          >
            {project?.iconUrl ? (
              <img
                src={project.iconUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <AlxBlockIcon size={32} />
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {project?.description ? (
              <div style={{ fontSize: 13, lineHeight: '19px', color: 'var(--alx-1)' }}>
                {project.description}
              </div>
            ) : (
              <Note>该项目暂无简介。</Note>
            )}

            {project && project.categories.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {project.categories.map((c) => (
                  <AlxPill key={c}>{c}</AlxPill>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <AlxButton highlight leftIcon={<IconDownload size={13} />}>
                安装
              </AlxButton>
              <AlxButton leftIcon={<IconStar size={13} />}>收藏</AlxButton>
            </div>
          </div>
        </div>
      </AlxCard>

      <AlxCard title="版本列表">
        {resourceDetailLoading ? (
          <Note>正在加载版本信息…</Note>
        ) : versions.length === 0 ? (
          <Note>该项目暂无可安装的版本。</Note>
        ) : (
          versions.map((v) => (
            <AlxListItem
              key={`${v.loader}-${v.gameVersion}-${v.id}`}
              icon={<AlxBlockIcon size={32} />}
              title={v.name}
              info={`${v.gameVersion} · ${v.loader}${v.fileName ? ` · ${v.fileName}` : ''}`}
            />
          ))
        )}
      </AlxCard>
    </AlxPage>
  )
}
