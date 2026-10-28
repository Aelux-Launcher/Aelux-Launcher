import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Card, Switch, Input, Button } from 'aelux-components'
import { useApp } from '../store'
import { SettingsSchema, type Settings } from 'aelux-launcher-lib'

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

export function Settings() {
  const { settings, setTheme, theme } = useApp()
  const [draft, setDraft] = useState<Settings>(settings)

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    const next = { ...draft, [key]: value }
    setDraft(next)
    useApp.setState({ settings: next })
  }

  async function save() {
    const parsed = SettingsSchema.parse(draft)
    useApp.setState({ settings: parsed })
    await invoke('kv_set', { key: 'settings', value: JSON.stringify(parsed) })
  }

  return (
    <div className="view">
      <h2>设置</h2>

      <Card title="实验性功能">
        <Row
          label="AI 修复模组"
          description="每次启动自动注入保底修复 mod（试验性）。"
          control={<Switch checked={draft.aiFixMod} onChange={(v: boolean) => update('aiFixMod', v)} />}
        />
      </Card>

      <Card title="游戏">
        <Row
          label="分配内存 (MB)"
          control={
            <Input
              type="number"
              value={String(draft.memoryMb)}
              onChange={(e: any) => update('memoryMb', Number(e.target.value) || 2048)}
            />
          }
        />
        <Row
          label="Java 路径"
          description="留空则自动探测系统 Java。"
          control={
            <Input
              placeholder="自动探测"
              value={draft.javaPath}
              onChange={(e: any) => update('javaPath', e.target.value)}
            />
          }
        />
      </Card>

      <Card title="外观与更新">
        <Row
          label="深色主题"
          control={<Switch checked={theme === 'dark'} onChange={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />}
        />
        <Row
          label="自动更新"
          control={<Switch checked={draft.autoUpdate} onChange={(v: boolean) => update('autoUpdate', v)} />}
        />
      </Card>

      <Button variant="primary" onClick={save}>
        保存设置
      </Button>
    </div>
  )
}
