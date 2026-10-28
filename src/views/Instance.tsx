import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { InstanceSettings } from 'aelux-launcher-lib'
import { IconGrid, IconLayout, IconPackage, IconSettings, IconEdit } from 'aelux-components'
import { useApp, type InstanceTab } from '../store'
import { AlxPage } from '../components/AlxPage'
import { AlxNavItem } from '../components/AlxNavItem'
import {
  DEFAULT_INSTANCE_UI,
  fallbackInstanceSettings,
  loadInstanceUiMap,
  saveInstanceUi,
  type InstanceUi,
} from './instanceMeta'
import { ExportPanel, ModPanel, OverviewPanel, SetupPanel } from './InstancePanels'

/**
 * 实例设置子页（从主页「版本设置」或版本选择页进入）。
 *
 * 左栏四个标签：概览 / 设置 / Mod 管理 / 导出。
 * 右栏按标签渲染对应面板。
 *
 * 实例设置（Java、内存、服务器、高级选项）由 lib-core 的 InstanceSettingsRepository
 * 负责持久化，视图只通过 store 的 action 读写。
 */

/**
 * 左栏五项，顺序与上游一致：
 *   概览 → 设置 → 修改 → Mod 管理 → 导出
 */
const NAV: { key: InstanceTab; title: string; icon: ReactNode }[] = [
  { key: 'overall', title: '概览', icon: <IconGrid size={17} /> },
  { key: 'setup', title: '设置', icon: <IconSettings size={17} /> },
  { key: 'modify', title: '修改', icon: <IconEdit size={17} /> },
  { key: 'mod', title: 'Mod 管理', icon: <IconLayout size={17} /> },
  { key: 'export', title: '导出', icon: <IconPackage size={17} /> },
]

export function Instance({ instanceId, tab }: { instanceId: string; tab: InstanceTab }) {
  const { instances, instanceSettings, loadInstanceSettings, updateInstanceSettings, setInstanceTab } =
    useApp()

  const [ui, setUiState] = useState<InstanceUi>(DEFAULT_INSTANCE_UI)

  // 进入实例页时读取该实例的设置。
  useEffect(() => {
    void loadInstanceSettings(instanceId)
  }, [instanceId, loadInstanceSettings])

  // 读取该实例的外观偏好（图标 / 分类 / 收藏等）。
  useEffect(() => {
    let cancelled = false
    void loadInstanceUiMap().then((map) => {
      if (cancelled) return
      setUiState({ ...DEFAULT_INSTANCE_UI, ...(map[instanceId] ?? {}) })
    })
    return () => {
      cancelled = true
    }
  }, [instanceId])

  const instance = instances.find((i) => i.id === instanceId)

  /** 写回实例设置（lib-core 负责校验与落盘）。 */
  function patch(p: Partial<InstanceSettings>) {
    void updateInstanceSettings(instanceId, p)
  }

  /** 写回外观偏好。 */
  function setUi(p: InstanceUi) {
    setUiState((prev) => ({ ...prev, ...p }))
    void saveInstanceUi(instanceId, p)
  }

  const left = (
    <div className="alx-nav">
      {NAV.map((item) => (
        <div key={item.key}>
          <AlxNavItem
            title={item.title}
            icon={item.icon}
            selected={tab === item.key}
            onClick={() => setInstanceTab(item.key)}
          />
        </div>
      ))}
    </div>
  )

  if (!instance) {
    return (
      <AlxPage left={left} leftWidth={160}>
        <div style={{ fontSize: 13, color: 'var(--alx-1)', opacity: 0.7 }}>
          未找到该游戏版本，它可能已被删除。
        </div>
      </AlxPage>
    )
  }

  const settings = fallbackInstanceSettings(instanceSettings[instanceId])
  const panelProps = { instance, settings, patch, ui, setUi }

  return (
    <AlxPage left={left} leftWidth={160}>
      {tab === 'overall' && <OverviewPanel {...panelProps} />}
      {tab === 'setup' && <SetupPanel {...panelProps} />}
      {tab === 'mod' && <ModPanel {...panelProps} />}
      {tab === 'export' && <ExportPanel {...panelProps} />}
    </AlxPage>
  )
}
