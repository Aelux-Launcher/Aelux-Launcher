import { useState } from 'react'
import { IconInfo, IconStar, IconPackage, IconExternal, IconGrid, IconUser } from 'aelux-components'
import { AlxPage } from '../components/AlxPage'
import { AlxNavItem } from '../components/AlxNavItem'
import { Account } from './Account'
import { AboutPanel, FeedbackPanel, HelpPanel, ToolboxPanel, VotePanel } from './MorePanels'
import { ModsPanel } from './MoreMods'

type Section = 'help' | 'about' | 'toolbox' | 'feedback' | 'vote' | 'account'

/**
 * 左栏六项，顺序与上游一致：**帮助 → 关于与鸣谢 → 百宝箱 → 反馈 → 新功能投票**，
 * 末尾追加「账号」（上游把账号放在启动页，这里额外保留一个入口）。
 */
const NAV = [
  { key: 'help', title: '帮助', icon: <IconInfo size={17} /> },
  { key: 'about', title: '关于与鸣谢', icon: <IconStar size={17} /> },
  { key: 'toolbox', title: '百宝箱', icon: <IconPackage size={17} /> },
  { key: 'feedback', title: '反馈', icon: <IconExternal size={17} /> },
  { key: 'vote', title: '新功能投票', icon: <IconGrid size={17} /> },
  { key: 'account', title: '账号', icon: <IconUser size={17} /> },
]

/**
 * 更多页：
 *   左栏 —— 帮助 / 关于与鸣谢 / 百宝箱 / 反馈 / 新功能投票 / 账号
 *   右栏 —— 按左栏选中项切换内容
 */
export function More() {
  const [section, setSection] = useState<Section>('help')

  const left = (
    <div className="alx-nav">
      {NAV.map((item) => (
        <div key={item.key}>
          <AlxNavItem
            title={item.title}
            icon={item.icon}
            selected={section === item.key}
            onClick={() => setSection(item.key as Section)}
          />
        </div>
      ))}
    </div>
  )

  return (
    <AlxPage left={left} leftWidth={205}>
      {section === 'help' && <HelpPanel />}
      {section === 'about' && <AboutPanel />}
      {section === 'toolbox' && (
        <ToolboxPanel>
          <ModsPanel />
        </ToolboxPanel>
      )}
      {section === 'feedback' && <FeedbackPanel />}
      {section === 'vote' && <VotePanel />}
      {section === 'account' && <Account />}
    </AlxPage>
  )
}
