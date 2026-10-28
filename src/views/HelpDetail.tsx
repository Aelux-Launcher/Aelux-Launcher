import { useEffect, useMemo, useState } from 'react'
import { IconSearch, IconExternal } from 'aelux-components'
import { useApp, platform } from '../store'
import { AlxCard } from '../components/AlxCard'
import { AlxButton, AlxSearchBox } from '../components/AlxControls'
import { Note } from './CommonUi'

/**
 * 帮助详情（副页面）。
 *
 * 对应上游实现里的 `PageOtherHelpDetail`：
 *   纯右栏页面（**没有左栏**），由 `PanCustom` 容器动态填充若干卡片。
 *   标题栏显示「← 返回 + 条目标题」。
 *
 * 帮助条目在「更多 → 帮助」页的折叠分组里，点击某一条就进入本页。
 */
export interface HelpEntry {
  /** 条目标识 */
  id: string
  /** 所属分组（面包屑用） */
  group: string
  /** 条目标题 */
  title: string
  /** 正文段落 */
  paragraphs: string[]
  /** 相关链接 */
  links?: { label: string; url: string }[]
}

/** 帮助条目库（更多 → 帮助 页的分组会读它）。 */
export const HELP_ENTRIES: HelpEntry[] = [
  {
    id: 'download-install',
    group: 'Minecraft',
    title: '下载与安装',
    paragraphs: [
      '在「下载」页选择「原版游戏」，输入需要的游戏版本号，回车即可开始下载。',
      '下载过程可以在「任务管理」页查看进度；游戏文件会放在你选择的 Minecraft 文件夹下。',
      '安装完成后，版本会出现在「版本选择」页，随时可以单独调整它的启动参数与 Mod。',
    ],
  },
  {
    id: 'version-snapshot',
    group: 'Minecraft',
    title: '版本与快照',
    paragraphs: [
      '正式版是 Minecraft 官方发布的稳定版本；预览版是官方提前放出的测试版本。',
      '快照版（版本号里带 w 的那些）来自每周的快照，可能不够稳定，仅建议用于测试。',
    ],
  },
  {
    id: 'multiplayer-server',
    group: 'Minecraft',
    title: '联机与服务器',
    paragraphs: [
      '在「联机」页添加服务器地址，填好端口后即可一键加入。',
      '如果在「设置 → 联机」里配置了中转节点，联机时会自动走中转，适合直连不顺畅的网络环境。',
    ],
  },
  {
    id: 'mod-modpack',
    group: 'Minecraft',
    title: '模组与整合包',
    paragraphs: [
      '在「下载」页的「Mod / 整合包 / 数据包 / 资源包 / 光影包」分类里搜索并安装。',
      '装好的 Mod 会出现在对应版本的「Mod 管理」页；导出整合包时可以勾选要带走的内容。',
    ],
  },
  {
    id: 'version-compare',
    group: '百科',
    title: '版本号对照',
    paragraphs: [
      '版本号里的第一段是 Minecraft 的主版本号（如 1.21）；第二段是补丁号（如 1.21.4）。',
      '带 w 的是快照版；带 pre / rc 的是预览版；正式发布则不带任何后缀。',
    ],
  },
  {
    id: 'shader-texture',
    group: '百科',
    title: '光影与材质说明',
    paragraphs: [
      '光影包负责画面的光照与阴影效果，材质包（资源包）负责贴图与模型。',
      '两者互不冲突，可以同时安装；性能不足时优先降低光影包的渲染质量。',
    ],
  },
  {
    id: 'launcher-install',
    group: '启动器',
    title: '安装与更新',
    paragraphs: [
      '启动器本体不需要联网下载任何组件，下载后直接运行即可。',
      '只有在取游戏内容（版本、依赖库、材质、社区资源）时才会联网。',
    ],
  },
  {
    id: 'launcher-troubleshoot',
    group: '启动器',
    title: '问题排查',
    paragraphs: [
      '启动失败时先看「启动」页的启动日志，日志里会写明失败原因。',
      '内存不足是最常见的问题，可以在「版本设置 → 内存分配」里调高内存。',
      '若提示 Java 相关错误，请在「版本设置 → 启动选项」里换一个可用的 Java 版本。',
    ],
  },
  {
    id: 'launcher-log',
    group: '启动器',
    title: '日志与反馈',
    paragraphs: [
      '启动日志在「启动」页右下方，点击「清空」可以清空当前日志。',
      '反馈问题时请附上启动日志，能大幅缩短排查时间。',
    ],
  },
  {
    id: 'theme-appearance',
    group: '个性化',
    title: '主题与外观',
    paragraphs: [
      '在「设置 → 个性化」里可以切换浅色 / 深色主题，并调整界面不透明度。',
      '主题选择会被记住，下次打开时沿用你上次的设定。',
    ],
  },
  {
    id: 'launch-options',
    group: '个性化',
    title: '启动选项',
    paragraphs: [
      '「设置 → 启动」是全局启动选项，对所有版本生效。',
      '「版本设置」里的同名选项只对当前这一个版本生效，优先级更高。',
    ],
  },
]

/** 查找帮助条目。 */
export function findHelpEntry(id: string): HelpEntry | undefined {
  return HELP_ENTRIES.find((e) => e.id === id)
}

/** 帮助详情页（副页面，纯右栏）。 */
export function HelpDetail({ entryId, title }: { entryId: string; title: string }) {
  const entry = useMemo(() => findHelpEntry(entryId), [entryId])
  const [query, setQuery] = useState('')

  // 页面内搜索：命中正文时高亮所属分组
  useEffect(() => {
    setQuery('')
  }, [entryId])

  if (!entry) {
    return (
      <div style={{ padding: 25 }}>
        <AlxCard title={title}>
          <Note>没有找到这条帮助内容，它可能已经被移动或删除。</Note>
        </AlxCard>
      </div>
    )
  }

  const q = query.trim()
  const hit = !q || entry.title.includes(q) || entry.paragraphs.some((p) => p.includes(q))

  return (
    <div style={{ padding: '25px 25px 10px', overflowY: 'auto', height: '100%' }}>
      <AlxSearchBox
        placeholder="在本文中搜索"
        value={query}
        onChange={setQuery}
      />

      <AlxCard title={entry.title}>
        <div
          style={{
            fontSize: 12,
            color: 'var(--alx-1)',
            opacity: 0.6,
            marginBottom: 12,
          }}
        >
          {entry.group}
        </div>

        {!hit ? (
          <Note>没有匹配的内容。</Note>
        ) : (
          entry.paragraphs.map((p, i) => (
            <p
              key={i}
              style={{
                margin: '0 0 10px',
                fontSize: 13,
                lineHeight: '20px',
                color: 'var(--alx-1)',
                opacity: 0.85,
              }}
            >
              {p}
            </p>
          ))
        )}

        {entry.links && entry.links.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            {entry.links.map((l) => (
              <AlxButton
                key={l.url}
                leftIcon={<IconExternal size={13} />}
                onClick={() => void platform.openExternal(l.url)}
              >
                {l.label}
              </AlxButton>
            ))}
          </div>
        )}
      </AlxCard>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '10px 0 14px',
        }}
      >
        <AlxButton
          leftIcon={<IconSearch size={13} />}
          onClick={() => useApp.getState().pageBack()}
        >
          返回帮助列表
        </AlxButton>
      </div>
    </div>
  )
}
