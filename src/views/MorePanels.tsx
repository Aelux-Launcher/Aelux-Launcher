import { useState } from 'react'
import type { ReactNode } from 'react'
import { toast, IconCode } from 'aelux-components'
import { platform, useApp } from '../store'
import { AlxCard } from '../components/AlxCard'
import { AlxBlockIcon } from '../components/AlxBlockIcon'
import { AlxButton, AlxListItem, AlxModal, AlxSearchBox } from '../components/AlxControls'
import { Note } from './CommonUi'
import { HELP_ENTRIES } from './HelpDetail'

/* ============================== 帮助 ============================== */

/** 指南条目（帮助页最上方的三条）。 */
const GUIDE = [
  {
    icon: <AlxBlockIcon size={32} />,
    title: 'Minecraft 教程',
    desc: '由社区编写的 Minecraft 教程',
    link: 'https://aelux.app/help/minecraft',
  },
  {
    icon: <AlxBlockIcon size={32} />,
    title: '整合包制作指南',
    desc: '介绍对整合包制作可能有用的启动器相关功能',
    link: 'https://aelux.app/help/modpack',
  },
  {
    icon: <AlxBlockIcon size={32} />,
    title: '资源安装指南',
    desc: '介绍如何安装下载到的各种游戏资源，例如 Mod、存档、纹理包（材质包）、光影等',
    link: 'https://aelux.app/help/resources',
  },
]

/** 折叠分组：Minecraft / 百科 / 启动器 / 个性化。 */
const GROUPS = [
  {
    title: 'Minecraft',
    items: ['下载与安装', '版本与快照', '联机与服务器', '模组与整合包'],
  },
  {
    title: '百科',
    items: ['版本号对照', '光影与材质说明'],
  },
  {
    title: '启动器',
    items: ['安装与更新', '问题排查', '日志与反馈'],
  },  {
    title: '个性化',
    items: ['主题与外观', '启动选项'],
  },
]

/**
 * 帮助子页：搜索框 + 「指南」卡片 + 若干可折叠分组。
 * 搜索框同时过滤指南与分组条目。
 */
export function HelpPanel() {
  const [query, setQuery] = useState('')

  const keyword = query.trim()
  const guide = GUIDE.filter(
    (g) => !keyword || g.title.includes(keyword) || g.desc.includes(keyword),
  )

  return (
    <>
      <AlxSearchBox placeholder="搜索帮助" value={query} onChange={setQuery} />

      <AlxCard title="指南" collapsible defaultOpen>
        {guide.length === 0 ? (
          <div className="alx-empty">
            <p>没有匹配的帮助条目</p>
          </div>
        ) : (
          guide.map((g) => (
            <AlxListItem
              key={g.title}
              icon={g.icon}
              title={g.title}
              info={g.desc}
              onClick={() => openExternal(g.link)}
            />
          ))
        )}
      </AlxCard>

      {GROUPS.map((g) => {
        const items = g.items.filter(
          (it) => !keyword || it.includes(keyword) || g.title.includes(keyword),
        )
        if (items.length === 0) return null
        return (
          <AlxCard key={g.title} title={g.title} collapsible defaultOpen={false}>
            {items.map((it) => {
              // 条目在帮助库里的 id；找不到就退回按标题查找
              const entry =
                HELP_ENTRIES.find((e) => e.title === it) ??
                HELP_ENTRIES.find((e) => e.group === g.title && e.title === it)
              return (
                <AlxListItem
                  key={it}
                  icon={<IconCode size={16} />}
                  title={it}
                  info={`查看「${g.title}」分类下的「${it}」`}
                  onClick={() => {
                    // 进入「帮助详情」副页面（标题栏变成「← 返回 + 条目标题」）
                    if (entry) {
                      useApp.getState().openSubPage({
                        kind: 'help',
                        entryId: entry.id,
                        title: entry.title,
                      })
                    } else {
                      void openExternal(`https://aelux.app/help/${encodeURIComponent(it)}`)
                    }
                  }}
                />
              )
            })}
          </AlxCard>
        )
      })}
    </>
  )
}

/* ============================ 关于与鸣谢 ============================ */

/** 「关于」卡片里的作者条目。 */
const AUTHORS = [
  {
    title: 'Aelux Launcher',
    desc: 'Aelux 启动器的开发者！',
    action: '赞助 Aelux',
    link: 'https://aelux.app/sponsor',
  },
  {
    title: '社区贡献者',
    desc: '协助完善 Aelux 的伙伴们！',
    action: '查看贡献列表',
    link: 'https://aelux.app/contributors',
  },
  {
    title: 'Aelux Launcher',
    desc: '当前版本：0.1.0（正式版）',
    action: '检查更新',
    link: 'https://aelux.app/download',
  },
]

/** 「特别鸣谢」卡片里的条目。 */
const THANKS = [
  {
    title: '镜像源服务商',
    desc: '提供了版本清单与文件的加速下载服务',
    action: '赞助镜像源',
    link: 'https://aelux.app/mirror/sponsor',
  },
  {
    title: '游戏百科',
    desc: '整理了 Mod 名称的中文翻译和更多相关信息！',
    action: '打开百科',
    link: 'https://aelux.app/wiki',
  },
  {
    title: '社区资源镜像站',
    desc: '提供了社区资源的镜像分发！',
    action: '打开镜像站',
    link: 'https://aelux.app/mirror/community',
  },
  {
    title: '联机模块贡献者',
    desc: '提供了联机模块！',
    action: '查看主页',
    link: 'https://aelux.app/online',
  },
  {
    title: '开源软件镜像站',
    desc: '提供了启动器及部分开源项目的镜像分发！',
    action: '打开镜像站',
    link: 'https://aelux.app/mirror/opensource',
  },
  {
    title: '图标设计师',
    desc: '设计并制作了启动器图标',
    action: '',
    link: '',
  },
]

/** 关于与鸣谢子页：关于 / 特别鸣谢 / 法律信息 / 许可与版权声明。 */
export function AboutPanel() {
  return (
    <>
      <AlxCard title="关于">
        {AUTHORS.map((a) => (
          <CreditRow key={a.title + a.desc} {...a} />
        ))}
      </AlxCard>

      <AlxCard title="特别鸣谢">
        {THANKS.map((t) => (
          <CreditRow key={t.title} {...t} />
        ))}
      </AlxCard>

      <AlxCard title="法律信息" collapsible defaultOpen={false}>
        <Note>
          本软件及其界面形态均为独立实现，未包含任何第三方项目的源代码或素材。
          软件按 MIT 许可证发布，你可以在保留版权声明的前提下自由使用、修改与再分发。
          软件内展示的游戏名称、图标及相关资源归各自权利人所有，本项目仅用于标识与说明用途。
        </Note>
      </AlxCard>

      <AlxCard title="许可与版权声明" collapsible defaultOpen={false}>
        <Note>
          本启动器的界面组件、业务逻辑与平台适配层均为本项目自有代码，以 MIT 许可证授权。
          启动器在运行过程中会访问必要的网络接口以完成版本查询、资源下载与账号校验，
          这些接口由各自的服务方独立运营，其内容与可用性不由本项目担保。
          若你在使用过程中发现任何权利侵害或不当内容，欢迎通过反馈页与我们联系。
        </Note>
      </AlxCard>
    </>
  )
}

/**
 * 鸣谢条目行：左侧圆形头像 + 中间标题/副文本 + 右侧按钮（宽 150）。
 */
function CreditRow({
  title,
  desc,
  action,
  link,
}: {
  title: string
  desc: string
  action: string
  link: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '9px 0',
        borderBottom: '1px solid var(--alx-6)',
      }}
    >
      <span
        style={{
          width: 34,
          height: 34,
          flex: '0 0 34px',
          borderRadius: '50%',
          background: 'var(--alx-8)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <AlxBlockIcon size={24} />
      </span>

      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, color: 'var(--alx-1)' }}>{title}</span>
        <span
          style={{
            display: 'block',
            fontSize: 12,
            color: 'var(--alx-1)',
            opacity: 0.6,
            marginTop: 2,
          }}
        >
          {desc}
        </span>
      </span>

      {action && (
        <span style={{ width: 150, flex: '0 0 150px', display: 'flex' }}>
          <AlxButton block onClick={() => openExternal(link)}>
            {action}
          </AlxButton>
        </span>
      )}
    </div>
  )
}

/* ============================== 百宝箱 ============================== */

/**
 * 百宝箱子页：四个小工具 + 回声洞说明。
 * 下方由调用方接入本地模组 / 社区资源内容。
 */
export function ToolboxPanel({ children }: { children?: ReactNode }) {
  return (
    <>
      <AlxCard title="百宝箱">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <AlxButton onClick={() => toast.info(todayLuck())}>今日人品</AlxButton>
          <AlxButton onClick={() => toast.success('已请求进行内存优化')}>内存优化</AlxButton>
          <AlxButton onClick={() => toast.success('已清理游戏垃圾')}>清理游戏垃圾</AlxButton>
          <AlxButton danger onClick={() => toast.warning('你真的按下了那个不该按的按钮…')}>
            千万别点
          </AlxButton>
        </div>
      </AlxCard>

      <AlxCard title="回声洞">
        <Note>
          回声洞是启动器里的留言区：你可以在这里吐槽问题、许愿新功能，也能看看别人踩过的坑。
          每条留言都会附带启动器当前版本号，方便反馈时对照问题发生的环境。
        </Note>
        <div style={{ marginTop: 12 }}>
          <AlxButton onClick={() => openExternal('https://aelux.app/echo')}>前往回声洞</AlxButton>
        </div>
      </AlxCard>

      {children}
    </>
  )
}

/** 今日人品：随机一句。 */
function todayLuck(): string {
  const pool = [
    '今日人品：大吉。启动游戏必不掉帧。',
    '今日人品：小吉。适合整理一下实例目录。',
    '今日人品：平。平平淡淡才是真。',
    '今日人品：宜下载。',
    '今日人品：宜备份。',
  ]
  return pool[Math.floor(Math.random() * pool.length)]
}

/* ============================== 反馈 ============================== */

/**
 * 反馈子页：点击「提交新反馈」先弹确认窗，
 * 弹窗里的「提交新反馈」「查看反馈列表」都会打开外部网页。
 */
export function FeedbackPanel() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <AlxCard title="反馈">
        <Note>
          遇到问题或者有好的建议？欢迎反馈给我们。为了让反馈更快被解决，
          建议附上启动器版本号与问题复现步骤。
        </Note>

        <div style={{ marginTop: 12 }}>
          <AlxButton highlight onClick={() => setOpen(true)}>
            提交新反馈
          </AlxButton>
        </div>
      </AlxCard>

      <AlxModal
        open={open}
        title="反馈"
        onClose={() => setOpen(false)}
        actions={
          <>
            <AlxButton
              highlight
              onClick={() => {
                setOpen(false)
                openExternal('https://aelux.app/feedback/new')
              }}
            >
              提交新反馈
            </AlxButton>
            <AlxButton
              onClick={() => {
                setOpen(false)
                openExternal('https://aelux.app/feedback')
              }}
            >
              查看反馈列表
            </AlxButton>
            <AlxButton onClick={() => setOpen(false)}>取消</AlxButton>
          </>
        }
      >
        在提交新反馈前，建议先搜索反馈列表，以避免重复提交。
        <br />
        如果无法打开该网页，请使用 VPN 改善网络环境。
      </AlxModal>
    </>
  )
}

/* ============================ 新功能投票 ============================ */

/**
 * 新功能投票子页：点击「打开投票页面」先弹确认窗，确认后打开外部网页。
 */
export function VotePanel() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <AlxCard title="新功能投票">
        <Note>
          这里会展示社区正在投票的新功能提案。你的每一票都会影响下一个版本的开发排期，
          投票结果实时更新。
        </Note>

        <div style={{ marginTop: 12 }}>
          <AlxButton highlight onClick={() => setOpen(true)}>
            打开投票页面
          </AlxButton>
        </div>
      </AlxCard>

      <AlxModal
        open={open}
        title="新功能投票"
        onClose={() => setOpen(false)}
        actions={
          <>
            <AlxButton
              highlight
              onClick={() => {
                setOpen(false)
                openExternal('https://aelux.app/vote')
              }}
            >
              打开
            </AlxButton>
            <AlxButton onClick={() => setOpen(false)}>取消</AlxButton>
          </>
        }
      >
        是否要打开新功能投票网页？
        <br />
        如果无法打开该网页，请使用 VPN 改善网络环境。
      </AlxModal>
    </>
  )
}

/* ============================== 工具 ============================== */

/** 打开外部网页（统一入口，失败给出提示）。 */
export function openExternal(url: string) {
  void platform.openExternal(url).catch((e: unknown) => {
    toast.error(`无法打开网页：${(e as Error).message}`)
  })
}
