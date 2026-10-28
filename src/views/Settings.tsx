import { useState } from 'react'
import { Switch, Input, Button, toast, IconRefresh } from 'aelux-components'
import { useApp, platform } from '../store'
import { SettingsSchema, type Settings } from 'aelux-launcher-lib'
import { PclPage } from '../components/PclPage'

const SECTIONS = [
  { key: 'launch', title: '启动设置' },
  { key: 'java', title: 'Java 运行环境' },
  { key: 'download', title: '下载与更新' },
  { key: 'appearance', title: '外观' },
  { key: 'experimental', title: '实验性功能' },
]

function Row({
  label,
  description,
  control,
}: {
  label: string
  description?: string
  control: React.ReactNode
}) {
  return (
    <div className="setting-row">
      <div className="setting-row__text">
        <div className="setting-row__label">{label}</div>
        {description && <div className="setting-row__desc">{description}</div>}
      </div>
      <div className="setting-row__control">{control}</div>
    </div>
  )
}

/**
 * 设置页 —— 左栏为分类（对应 PCL 设置页的分类列表），右栏为该分类的设置项。
 */
export function Settings() {
  const { settings, setTheme, theme } = useApp()
  const [section, setSection] = useState('launch')
  const [draft, setDraft] = useState<Settings>(settings)

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    const next = { ...draft, [key]: value }
    setDraft(next)
    useApp.setState({ settings: next })
  }

  async function save() {
    try {
      const parsed = SettingsSchema.parse(draft)
      useApp.setState({ settings: parsed })
      await platform.storage.set('settings', JSON.stringify(parsed))
      toast.success('设置已保存')
    } catch (e) {
      toast.error(`保存失败：${(e as Error).message}`)
    }
  }

  return (
    <PclPage nav={SECTIONS} active={section} onSelect={setSection} leftWidth={200}>
      <div className="pcl-section__head">
        <h3>{SECTIONS.find((s) => s.key === section)?.title}</h3>
      </div>

      {section === 'launch' && (
        <div className="pcl-settings">
          <Row
            label="分配内存 (MB)"
            description="过小会导致加载失败，过大可能耗尽系统内存。"
            control={
              <Input
                type="number"
                value={String(draft.memoryMb)}
                onChange={(e: any) => update('memoryMb', Number(e.target.value) || 2048)}
                wrapperClassName="pcl-input--narrow"
              />
            }
          />
          <Row
            label="启动时显示控制台"
            description="显示游戏进程的输出窗口，便于排查崩溃。"
            control={
              <Switch checked={draft.showConsole} onChange={(v: boolean) => update('showConsole', v)} />
            }
          />
          <Row
            label="游戏退出后关闭启动器"
            control={
              <Switch checked={draft.closeOnExit} onChange={(v: boolean) => update('closeOnExit', v)} />
            }
          />
        </div>
      )}

      {section === 'java' && (
        <div className="pcl-settings">
          <Row
            label="Java 路径"
            description="留空则自动探测系统 Java。启动前会按游戏版本挑选匹配的 Java。"
            control={
              <Input
                placeholder="自动探测"
                value={draft.javaPath}
                onChange={(e: any) => update('javaPath', e.target.value)}
                wrapperClassName="pcl-input--wide"
              />
            }
          />
          <Row
            label="实例目录"
            description="各游戏实例的存放根目录。"
            control={
              <Input
                placeholder="默认（应用数据目录）"
                value={draft.instancesDir}
                onChange={(e: any) => update('instancesDir', e.target.value)}
                wrapperClassName="pcl-input--wide"
              />
            }
          />
        </div>
      )}

      {section === 'download' && (
        <div className="pcl-settings">
          <Row
            label="自动更新启动器"
            description="启动时检查是否有新版本并提示。"
            control={
              <Switch checked={draft.autoUpdate} onChange={(v: boolean) => update('autoUpdate', v)} />
            }
          />
        </div>
      )}

      {section === 'appearance' && (
        <div className="pcl-settings">
          <Row
            label="深色主题"
            description="默认浅色（PCL 蓝白风格）。"
            control={
              <Switch
                checked={theme === 'dark'}
                onChange={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              />
            }
          />
        </div>
      )}

      {section === 'experimental' && (
        <div className="pcl-settings">
          <Row
            label="AI 修复模组"
            description="每次启动自动注入保底修复 mod（试验性，失败不阻断启动）。"
            control={
              <Switch checked={draft.aiFixMod} onChange={(v: boolean) => update('aiFixMod', v)} />
            }
          />
        </div>
      )}

      <div className="pcl-settings__actions">
        <Button variant="primary" onClick={save}>
          保存设置
        </Button>
        <Button
          variant="ghost"
          leftIcon={<IconRefresh size={15} />}
          onClick={() => {
            setDraft(settings)
            useApp.setState({ settings })
            toast.info('已重置为已保存的设置')
          }}
        >
          重置
        </Button>
      </div>
    </PclPage>
  )
}
