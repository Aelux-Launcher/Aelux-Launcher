import { useState } from 'react'
import {
  IconSearch,
  IconInfo,
  IconStar,
  IconGrid,
  IconExternal,
  IconCode,
  IconUser,
  IconPackage,
} from 'aelux-components'
import { PclPage } from '../components/PclPage'
import { PclCard } from '../components/PclCard'
import { McBlockIcon } from '../components/McBlockIcon'
import { Account } from './Account'
import { Mods } from './Mods'

const SECTIONS = [
  { key: 'help', title: '帮助', icon: <IconInfo size={17} /> },
  { key: 'about', title: '关于与鸣谢', icon: <IconStar size={17} /> },
  { key: 'account', title: '账号', icon: <IconUser size={17} /> },
  { key: 'mods', title: '模组', icon: <IconPackage size={17} /> },
  { key: 'feedback', title: '反馈', icon: <IconExternal size={17} /> },
  { key: 'vote', title: '新功能投票', icon: <IconGrid size={17} /> },
]

/** 指南条目 */
const GUIDE = [
  {
    icon: <McBlockIcon size={32} />,
    title: 'Minecraft 教程',
    desc: '由社区编写的 Minecraft 教程',
  },
  {
    icon: <McBlockIcon size={32} />,
    title: '整合包制作指南',
    desc: '介绍对整合包制作可能有用的 Aelux 相关功能',
  },
  {
    icon: <McBlockIcon size={32} />,
    title: '资源安装指南',
    desc: '介绍如何安装下载到的各种游戏资源，例如 Mod、存档、纹理包（材质包）、光影等',
  },
]

/** 可折叠分组 */
const GROUPS = [
  { title: 'Minecraft', items: ['下载与安装', '版本与快照', '联机与服务器', '模组与整合包'] },
  { title: '百科', items: ['版本号对照', '光影与材质说明'] },
  { title: '启动器', items: ['安装与更新', '问题排查', '日志与反馈'] },
  { title: '个性化', items: ['主题与外观', '启动选项'] },
]

/**
 * 更多页 —— 复刻 PCL 的 `PageOther`：
 *   左栏：帮助 / 关于与鸣谢 / 账号 / 模组 / 反馈 / 新功能投票
 *   右栏：搜索框 +「指南」卡片 + 若干可折叠分组
 */
export function More() {
  const [section, setSection] = useState('help')
  const [query, setQuery] = useState('')
  const [openGroups, setOpenGroups] = useState<string[]>(['Minecraft'])

  function toggleGroup(title: string) {
    setOpenGroups((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title],
    )
  }

  const filteredGuide = GUIDE.filter(
    (g) =>
      !query.trim() ||
      g.title.includes(query.trim()) ||
      g.desc.includes(query.trim()),
  )

  return (
    <PclPage nav={SECTIONS} active={section} onSelect={setSection} leftWidth={205}>
      {section === 'help' && (
        <>
          <div className="pcl-search">
            <IconSearch size={16} />
            <input placeholder="搜索帮助" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          <PclCard title="指南" collapsible>
            {filteredGuide.length === 0 ? (
              <div className="pcl-empty">
                <p>没有匹配的帮助条目</p>
              </div>
            ) : (
              filteredGuide.map((g) => (
                <div key={g.title} className="pcl-guide">
                  <span className="pcl-guide__icon">{g.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="pcl-guide__title">{g.title}</div>
                    <div className="pcl-guide__desc">{g.desc}</div>
                  </div>
                </div>
              ))
            )}
          </PclCard>

          {GROUPS.map((g) => {
            const open = openGroups.includes(g.title)
            return (
              <section key={g.title} className="pcl-card">
                <button
                  type="button"
                  className="pcl-card__title pcl-card__title--button"
                  aria-expanded={open}
                  onClick={() => toggleGroup(g.title)}
                >
                  <span>{g.title}</span>
                  <span className={`pcl-card__toggle${open ? ' is-open' : ''}`} aria-hidden="true">
                    <IconSearch size={0} style={{ display: 'none' }} />
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <path
                        d="m6 9 6 6 6-6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </button>
                {open && (
                  <div className="pcl-card__body">
                    {g.items.map((it) => (
                      <div key={it} className="pcl-guide" style={{ background: 'transparent', padding: '6px 2px' }}>
                        <span style={{ width: 20, display: 'inline-flex', color: 'var(--pcl-3)' }}>
                          <IconCode size={15} />
                        </span>
                        <span style={{ fontSize: 13 }}>{it}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </>
      )}

      {section === 'about' && (
        <PclCard title="关于 Aelux 启动器">
          <div className="pcl-about">
            <img className="pcl-about__logo" src="/aelux-icon.png" alt="Aelux" />
            <div className="pcl-about__name">Aelux Launcher</div>
            <div className="pcl-about__version">版本 0.1.0 · MIT License</div>
            <p className="pcl-about__desc">
              用 Rust + Web 技术重构的跨平台 Minecraft 启动器，界面与交互完整复刻 PCL
              （Plain Craft Launcher），核心业务逻辑全部在 TypeScript 层。
            </p>
            <p className="pcl-about__desc">
              分三层：aelux-components（UI 组件库）、aelux-launcher-lib（纯逻辑核心）、
              aelux-launcher-app（Tauri 桌面壳）。本项目仅参考 PCL / HMCL 的设计，不包含其源码。
            </p>
          </div>
        </PclCard>
      )}

      {section === 'account' && <Account />}
      {section === 'mods' && <Mods />}

      {section === 'feedback' && (
        <PclCard title="反馈">
          <div className="pcl-empty">
            <p>遇到问题或有好建议？欢迎反馈，我们会尽快处理。</p>
            <button type="button" className="pcl-btn">
              <IconExternal size={13} />
              前往反馈页面
            </button>
          </div>
        </PclCard>
      )}

      {section === 'vote' && (
        <PclCard title="新功能投票">
          <div className="pcl-empty">
            <p>这里会展示社区投票的新功能提案。</p>
          </div>
        </PclCard>
      )}
    </PclPage>
  )
}
