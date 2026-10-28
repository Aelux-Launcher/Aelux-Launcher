import { useState } from 'react'
import { PclPage } from '../components/PclPage'
import { Account } from './Account'
import { Mods } from './Mods'

const SECTIONS = [
  { key: 'account', title: '账号' },
  { key: 'mods', title: '模组' },
  { key: 'about', title: '关于' },
]

/**
 * 更多页 —— 对应 PCL 的 `PageOther`（关于 / 帮助）：
 *   左栏为子页面列表，右栏为对应内容。
 */
export function More() {
  const [section, setSection] = useState('account')

  return (
    <PclPage
      leftWidth={200}
      nav={SECTIONS}
      active={section}
      onSelect={setSection}
    >
      {section === 'account' && <Account />}
      {section === 'mods' && <Mods />}
      {section === 'about' && (
        <div className="pcl-section">
          <div className="pcl-section__head">
            <h3>关于 Aelux 启动器</h3>
          </div>
          <div className="pcl-about">
            <div className="pcl-about__logo">A</div>
            <div className="pcl-about__name">Aelux Launcher</div>
            <div className="pcl-about__version">版本 0.1.0 · MIT License</div>
            <p className="pcl-about__desc">
              参考 PCL（Plain Craft Launcher）与 HMCL 的产品形态与工程架构重写的跨平台启动器。
              分为三层：aelux-components（UI 组件库）、aelux-launcher-lib（纯逻辑核心）、
              aelux-launcher-app（Tauri 桌面壳）。本项目仅参考二者设计，不包含其源码。
            </p>
            <p className="pcl-about__desc">
              核心业务逻辑全部在 TypeScript 层，通过注入的 PlatformAdapter 与系统交互，
              因此可在浏览器中纯单测。
            </p>
          </div>
        </div>
      )}
    </PclPage>
  )
}
