import { useRef } from 'react'
import { toast } from 'aelux-components'
import { updater, useApp } from '../store'
import {
  AlxButton,
  AlxCheck,
  AlxInput,
  AlxPill,
  AlxRadio,
  AlxSelect,
  AlxSlider,
} from '../components/AlxControls'
import { AlxCard } from '../components/AlxCard'
import { ButtonRow, Note, RadioRow, Row } from './CommonUi'
import {
  COMMUNITY_SOURCE_OPTIONS,
  DOWNLOAD_SOURCE_OPTIONS,
  FILE_NAME_FORMAT_OPTIONS,
  HOME_PAGE_OPTIONS,
  LAUNCHER_NOTICE_OPTIONS,
  LAUNCHER_UPDATE_OPTIONS,
  MOD_MANAGE_OPTIONS,
  ONLINE_MODE_OPTIONS,
  TITLE_BAR_OPTIONS,
  pickValid,
  type OnlineMode,
  type SettingsDraft,
} from './SettingsModel'

export interface PanelProps {
  draft: SettingsDraft
  /** 局部更新一个字段 */
  set: <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) => void
  /** 局部更新多个字段 */
  patch: (part: Partial<SettingsDraft>) => void
}

/* ============================== 个性化 ============================== */

/**
 * 个性化子页：外观、背景、标题栏、主页、功能隐藏。
 * 主题胶囊的点击会立刻调用 store 的 setTheme（即时生效），其余项随「保存设置」落盘。
 */
export function PersonalizationPanel({ draft, set, patch }: PanelProps) {
  /** 跟随系统时的实际主题（浏览器提供 prefers-color-scheme）。 */
  function systemTheme(): 'light' | 'dark' {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  function chooseTheme(pref: 'light' | 'dark' | 'system') {
    patch({ themePref: pref })
    // 立即生效：跟随系统时取系统当前偏好。
    const resolved = pref === 'system' ? systemTheme() : pref
    useApp.getState().setTheme(resolved)
  }

  return (
    <>
      <AlxCard title="基础">
        <Row label="不透明度">
          <AlxSlider
            value={draft.opacity}
            min={40}
            max={100}
            onChange={(v) => set('opacity', v)}
            format={(v) => `${v}%`}
          />
        </Row>

        <Row label="主题">
          <div style={{ display: 'flex', gap: 8 }}>
            <AlxPill active={draft.themePref === 'light'} onClick={() => chooseTheme('light')}>
              浅色
            </AlxPill>
            <AlxPill active={draft.themePref === 'dark'} onClick={() => chooseTheme('dark')}>
              深色
            </AlxPill>
            <AlxPill active={draft.themePref === 'system'} onClick={() => chooseTheme('system')}>
              跟随系统
            </AlxPill>
          </div>
        </Row>

        <div style={{ marginTop: 12 }}>
          <AlxCheck
            checked={draft.showIconOnLaunch}
            onChange={(v) => set('showIconOnLaunch', v)}
          >
            打开启动器时显示图标
          </AlxCheck>
        </div>
      </AlxCard>

      <AlxCard title="背景图片">
        <AlxCheck checked={draft.overlayColorBg} onChange={(v) => set('overlayColorBg', v)}>
          叠加彩色背景
        </AlxCheck>

        <ButtonRow>
          <AlxButton
            onClick={() =>
              toast.info('背景图片放在启动器数据目录的 background 文件夹中，保存后自动生效')
            }
          >
            打开文件夹
          </AlxButton>
          <AlxButton onClick={() => toast.success('已重新扫描背景图片')}>刷新背景图片</AlxButton>
          <AlxButton danger onClick={() => set('backgroundImage', '')}>
            清空背景图片
          </AlxButton>
        </ButtonRow>
      </AlxCard>

      <AlxCard title="背景音乐">
        <ButtonRow>
          <AlxButton
            onClick={() =>
              toast.info('背景音乐放在启动器数据目录的 music 文件夹中，保存后自动生效')
            }
          >
            打开文件夹
          </AlxButton>
          <AlxButton onClick={() => toast.success('已重新扫描背景音乐')}>刷新背景音乐</AlxButton>
          <AlxButton danger onClick={() => set('backgroundMusic', '')}>
            清空背景音乐
          </AlxButton>
        </ButtonRow>
      </AlxCard>

      <AlxCard title="标题栏">
        <RadioRow>
          {TITLE_BAR_OPTIONS.map((o) => (
            <AlxRadio
              key={o.value}
              name="aelux-titlebar"
              checked={draft.titleBar === o.value}
              onChange={() => set('titleBar', o.value)}
            >
              {o.label}
            </AlxRadio>
          ))}
        </RadioRow>
      </AlxCard>

      <AlxCard title="主页">
        <RadioRow>
          {HOME_PAGE_OPTIONS.map((o) => (
            <AlxRadio
              key={o.value}
              name="aelux-home"
              checked={draft.homePage === o.value}
              onChange={() => set('homePage', o.value)}
            >
              {o.label}
            </AlxRadio>
          ))}
        </RadioRow>
      </AlxCard>

      <AlxCard title="功能隐藏">
        <Note>勾选后，对应的页面入口将在启动器中隐藏。</Note>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '10px 18px',
            marginTop: 12,
          }}
        >
          <AlxCheck checked={draft.hideDownload} onChange={(v) => set('hideDownload', v)}>
            隐藏下载页
          </AlxCheck>
          <AlxCheck checked={draft.hideSettings} onChange={(v) => set('hideSettings', v)}>
            隐藏设置页
          </AlxCheck>
          <AlxCheck checked={draft.hideMore} onChange={(v) => set('hideMore', v)}>
            隐藏更多页
          </AlxCheck>
          <AlxCheck checked={draft.hideMultiplayer} onChange={(v) => set('hideMultiplayer', v)}>
            隐藏联机页
          </AlxCheck>
          <AlxCheck checked={draft.hideAccount} onChange={(v) => set('hideAccount', v)}>
            隐藏账号页
          </AlxCheck>
          <AlxCheck checked={draft.hideFeedback} onChange={(v) => set('hideFeedback', v)}>
            隐藏反馈页
          </AlxCheck>
          <AlxCheck checked={draft.hideVote} onChange={(v) => set('hideVote', v)}>
            隐藏新功能投票页
          </AlxCheck>
          <AlxCheck checked={draft.hideUpdateNotice} onChange={(v) => set('hideUpdateNotice', v)}>
            隐藏更新提示
          </AlxCheck>
        </div>
      </AlxCard>
    </>
  )
}

/* ============================== 其他 ============================== */

/** 其他子页：下载、社区资源、辅助功能、启动器本身。 */
export function OtherPanel({ draft, set, patch }: PanelProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  /** 导出当前设置为一个 JSON 文件（浏览器下载，无需 Rust 参与）。 */
  function exportSettings() {
    try {
      const blob = new Blob([JSON.stringify(draft, null, 2)], {
        type: 'application/json;charset=utf-8',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'aelux-settings.json'
      a.click()
      URL.revokeObjectURL(url)
      toast.success('设置已导出')
    } catch (e) {
      toast.error(`导出失败：${(e as Error).message}`)
    }
  }

  /** 导入设置文件：合并到当前草稿，等待用户点「保存设置」生效。 */
  function importSettings(file: File) {
    void file.text().then((text) => {
      try {
        const obj = JSON.parse(text) as unknown
        patch(pickValid(obj))
        toast.success('设置已导入，点击「保存设置」后生效')
      } catch (e) {
        toast.error(`导入失败：${(e as Error).message}`)
      }
    })
  }

  async function checkUpdate() {
    const info = await updater.check()
    if (info) toast.info(`发现新版本：${info.version}`)
    else toast.success('当前已是最新版本')
  }

  return (
    <>
      <AlxCard title="下载">
        <Row label="文件下载源">
          <AlxSelect
            value={draft.downloadSource}
            options={DOWNLOAD_SOURCE_OPTIONS}
            onChange={(v) => set('downloadSource', v as SettingsDraft['downloadSource'])}
          />
        </Row>

        <Row label="版本列表源">
          <AlxSelect
            value={draft.versionSource}
            options={DOWNLOAD_SOURCE_OPTIONS}
            onChange={(v) => set('versionSource', v as SettingsDraft['versionSource'])}
          />
        </Row>

        <Row label="最大线程数">
          <AlxSlider
            value={draft.maxThreads}
            min={1}
            max={256}
            onChange={(v) => set('maxThreads', v)}
            format={(v) => `${v}`}
          />
        </Row>

        <Row label="速度限制">
          <AlxSlider
            value={draft.speedLimit}
            min={1}
            max={42}
            onChange={(v) => set('speedLimit', v)}
            format={(v) => (v >= 42 ? '无限制' : `${v}.0 M/s`)}
          />
        </Row>

        <Row label="目标文件夹">
          <Note>请在 启动 → 版本选择 → 文件夹列表 中更改下载目标文件夹。</Note>
        </Row>

        <div style={{ marginTop: 12 }}>
          <AlxCheck checked={draft.verifySsl} onChange={(v) => set('verifySsl', v)}>
            在正版登录时验证 SSL 证书
          </AlxCheck>
        </div>
      </AlxCard>

      <AlxCard title="社区资源">
        <Row label="来源">
          <AlxSelect
            value={draft.communitySource}
            options={COMMUNITY_SOURCE_OPTIONS}
            onChange={(v) => set('communitySource', v as SettingsDraft['communitySource'])}
          />
        </Row>

        <Row label="文件名格式">
          <AlxSelect
            value={draft.fileNameFormat}
            options={FILE_NAME_FORMAT_OPTIONS}
            onChange={(v) => set('fileNameFormat', v as SettingsDraft['fileNameFormat'])}
          />
        </Row>

        <Row label="Mod 管理样式">
          <AlxSelect
            value={draft.modManageStyle}
            options={MOD_MANAGE_OPTIONS}
            onChange={(v) => set('modManageStyle', v as SettingsDraft['modManageStyle'])}
          />
        </Row>
      </AlxCard>

      <AlxCard title="辅助功能">
        <AlxCheck checked={draft.releaseNotice} onChange={(v) => set('releaseNotice', v)}>
          正式版更新提示
        </AlxCheck>
        <div style={{ height: 9 }} />
        <AlxCheck checked={draft.betaNotice} onChange={(v) => set('betaNotice', v)}>
          测试版更新提示
        </AlxCheck>
        <div style={{ height: 9 }} />
        <AlxCheck checked={draft.autoChinese} onChange={(v) => set('autoChinese', v)}>
          自动设置为中文
        </AlxCheck>
      </AlxCard>

      <AlxCard title="启动器">
        <Row label="启动器更新">
          <AlxSelect
            value={draft.launcherUpdate}
            options={LAUNCHER_UPDATE_OPTIONS}
            onChange={(v) => set('launcherUpdate', v as SettingsDraft['launcherUpdate'])}
          />
        </Row>

        <Row label="启动器公告">
          <AlxSelect
            value={draft.launcherNotice}
            options={LAUNCHER_NOTICE_OPTIONS}
            onChange={(v) => set('launcherNotice', v as SettingsDraft['launcherNotice'])}
          />
        </Row>

        <Row label="缓存文件夹">
          <AlxInput
            value={draft.cacheFolder}
            placeholder="默认（应用数据目录）"
            onChange={(v) => set('cacheFolder', v)}
          />
        </Row>

        <div style={{ marginTop: 12 }}>
          <AlxCheck checked={draft.anonymousStats} onChange={(v) => set('anonymousStats', v)}>
            匿名数据收集
          </AlxCheck>
        </div>

        <ButtonRow>
          <AlxButton onClick={() => void checkUpdate()}>检查更新</AlxButton>
          <AlxButton onClick={exportSettings}>导出设置</AlxButton>
          <AlxButton onClick={() => fileRef.current?.click()}>导入设置</AlxButton>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) importSettings(file)
              e.target.value = ''
            }}
          />
        </ButtonRow>
      </AlxCard>
    </>
  )
}

/* ============================== 联机 ============================== */

/**
 * 联机子页：联机方式、中转节点、默认端口与联机行为。
 *
 * 联机方式决定后续哪些行可用：
 *   直连 / 局域网 —— 用不到中转节点，中转地址一行置灰；
 *   中转         —— 中转地址可编辑。
 */
export function OnlinePanel({ draft, set }: PanelProps) {
  const relayNeeded = draft.onlineMode === 'relay'

  return (
    <>
      <AlxCard title="联机方式">
        <Row label="联机方式">
          <AlxSelect
            value={draft.onlineMode}
            options={ONLINE_MODE_OPTIONS}
            onChange={(v) => set('onlineMode', v as OnlineMode)}
          />
        </Row>

        <Row
          label="中转节点"
          hint={
            relayNeeded
              ? '留空则使用默认的公共中转节点；自建节点请填写完整地址。'
              : '仅在「通过中转节点联机」下生效。'
          }
        >
          <AlxInput
            value={draft.onlineRelay}
            onChange={(v) => set('onlineRelay', v)}
            placeholder="例如：relay.aelux.app:25565"
            disabled={!relayNeeded}
          />
        </Row>

        <Row label="默认端口">
          <AlxInput
            value={String(draft.onlinePort)}
            onChange={(v) => {
              const n = Number(v)
              if (Number.isFinite(n) && n >= 1 && n <= 65535) {
                set('onlinePort', n)
              }
            }}
            placeholder="25565"
          />
        </Row>

        <Row label="联机昵称">
          <AlxInput
            value={draft.onlineNickname}
            onChange={(v) => set('onlineNickname', v)}
            placeholder="留空则使用当前登录账号"
          />
        </Row>
      </AlxCard>

      <AlxCard title="联机行为">
        <AlxCheck
          checked={draft.onlineHideLauncher}
          onChange={(v) => set('onlineHideLauncher', v)}
        >
          联机时隐藏启动器窗口
        </AlxCheck>

        <div style={{ height: 9 }} />

        <AlxCheck
          checked={draft.onlineAutoEnter}
          onChange={(v) => set('onlineAutoEnter', v)}
        >
          启动游戏后自动进入上次联机的服务器
        </AlxCheck>

        <div style={{ marginTop: 12 }}>
          <Note>
            联机功能会把你输入的服务器地址与昵称发送到目标服务器；
            局域网联机不会经过任何第三方节点。
          </Note>
        </div>
      </AlxCard>

      <AlxCard title="服务器列表">
        <Note>
          已保存的服务器在「联机」页管理。点击下方按钮前往该页面添加、编辑或删除服务器。
        </Note>
        <ButtonRow>
          <AlxButton onClick={() => useApp.getState().setView('multiplayer')}>
            前往联机页
          </AlxButton>
        </ButtonRow>
      </AlxCard>
    </>
  )
}
