import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { toast, IconPlay, IconStar, IconGrid, IconExternal } from 'aelux-components'
import { useApp } from '../store'
import { AlxPage } from '../components/AlxPage'
import { AlxCard } from '../components/AlxCard'
import { AlxNavItem } from '../components/AlxNavItem'
import {
  AlxButton,
  AlxCheck,
  AlxInput,
  AlxRadio,
  AlxSelect,
  AlxSlider,
} from '../components/AlxControls'
import { Row } from './CommonUi'
import { OtherPanel, OnlinePanel, PersonalizationPanel } from './SettingsPanels'
import {
  DEFAULT_DRAFT,
  GC_OPTIONS,
  ISOLATION_OPTIONS,
  PRIORITY_OPTIONS,
  VISIBILITY_OPTIONS,
  WINDOW_SIZE_OPTIONS,
  loadDraft,
  persistDraft,
  type SettingsDraft,
} from './SettingsModel'

type Section = 'launch' | 'link' | 'personal' | 'other'

/**
 * 左栏四项，顺序与上游一致：**启动 → 联机 → 个性化 → 其他**。
 */
const NAV: { key: string; title: string; icon: ReactNode; disabled?: boolean }[] = [
  { key: 'launch', title: '启动', icon: <IconPlay size={17} /> },
  { key: 'link', title: '联机', icon: <IconExternal size={17} /> },
  { key: 'personal', title: '个性化', icon: <IconStar size={17} /> },
  { key: 'other', title: '其他', icon: <IconGrid size={17} /> },
]

/**
 * 设置页：左栏切换「启动 / 个性化 / 其他 / 联机」。
 *
 * 状态是一份本地草稿（draft）：
 *   - 进入页面时从本地存储读出（读不到就用默认值）；
 *   - 所有控件只改草稿，不直接落盘；
 *   - 点「保存设置」时才校验核心字段 → 写入 store → 持久化。
 */
export function Settings() {
  const { settings } = useApp()
  const [section, setSection] = useState<Section>('launch')
  const [draft, setDraft] = useState<SettingsDraft>({ ...DEFAULT_DRAFT, ...settings })

  // 首屏读取已保存的设置（异步，不阻塞界面渲染）。
  useEffect(() => {
    let cancelled = false
    void loadDraft().then((saved) => {
      if (!cancelled) setDraft(saved)
    })
    return () => {
      cancelled = true
    }
  }, [])

  function set<K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function patch(part: Partial<SettingsDraft>) {
    setDraft((prev) => ({ ...prev, ...part }))
  }

  async function save() {
    try {
      const core = await persistDraft(draft)
      useApp.setState({ settings: core })
      toast.success('设置已保存')
    } catch (e) {
      toast.error(`保存失败：${(e as Error).message}`)
    }
  }

  function reset() {
    setDraft({ ...DEFAULT_DRAFT })
    toast.info('已重置为默认值，点击「保存设置」后生效')
  }

  const left = (
    <div className="alx-nav">
      {NAV.map((item) => (
        <div key={item.key}>
          {item.disabled ? (
            // 不可用项：整体半透明且不响应点击。
            <div style={{ opacity: 0.4, pointerEvents: 'none' }}>
              <AlxNavItem title={item.title} icon={item.icon} />
            </div>
          ) : (
            <AlxNavItem
              title={item.title}
              icon={item.icon}
              selected={section === item.key}
              onClick={() => setSection(item.key as Section)}
            />
          )}
        </div>
      ))}
    </div>
  )

  const panelProps = { draft, set, patch }

  return (
    <AlxPage left={left} leftWidth={170}>
      {section === 'launch' && (
        <>
          <AlxCard title="启动选项">
            <Row label="默认版本隔离">
              <AlxSelect
                value={draft.isolation}
                options={ISOLATION_OPTIONS}
                onChange={(v) => set('isolation', v as SettingsDraft['isolation'])}
              />
            </Row>

            <Row label="游戏窗口标题">
              <AlxInput
                value={draft.windowTitle}
                placeholder="默认"
                onChange={(v) => set('windowTitle', v)}
              />
            </Row>

            <Row label="自定义信息">
              <AlxInput
                value={draft.customInfo}
                placeholder="Aelux"
                onChange={(v) => set('customInfo', v)}
              />
            </Row>

            <Row label="启动器可见性">
              <AlxSelect
                value={draft.launcherVisibility}
                options={VISIBILITY_OPTIONS}
                onChange={(v) => set('launcherVisibility', v as SettingsDraft['launcherVisibility'])}
              />
            </Row>

            <Row label="进程优先级">
              <AlxSelect
                value={draft.processPriority}
                options={PRIORITY_OPTIONS}
                onChange={(v) => set('processPriority', v as SettingsDraft['processPriority'])}
              />
            </Row>

            <Row label="窗口大小">
              <AlxSelect
                value={draft.windowSize}
                options={WINDOW_SIZE_OPTIONS}
                onChange={(v) => set('windowSize', v as SettingsDraft['windowSize'])}
              />
            </Row>

            <Row label="Java 路径">
              <AlxInput
                value={draft.javaPath}
                placeholder="自动探测"
                onChange={(v) => set('javaPath', v)}
              />
            </Row>
          </AlxCard>

          <AlxCard title="内存分配">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <AlxRadio
                name="aelux-memory-mode"
                checked={draft.memoryMode === 'follow'}
                onChange={() => set('memoryMode', 'follow')}
              >
                跟随全局设置
              </AlxRadio>
              <AlxRadio
                name="aelux-memory-mode"
                checked={draft.memoryMode === 'auto'}
                onChange={() => set('memoryMode', 'auto')}
              >
                自动配置
              </AlxRadio>
              <AlxRadio
                name="aelux-memory-mode"
                checked={draft.memoryMode === 'custom'}
                onChange={() => set('memoryMode', 'custom')}
              >
                自定义
              </AlxRadio>
            </div>

            {draft.memoryMode === 'custom' && (
              <div style={{ marginTop: 12 }}>
                <AlxSlider
                  value={draft.memoryMb}
                  min={512}
                  max={8192}
                  step={256}
                  onChange={(v) => set('memoryMb', v)}
                  format={(v) => `${v} MB`}
                />
              </div>
            )}

            <div style={{ marginTop: 12 }}>
              <AlxCheck
                checked={draft.memoryOptimize}
                onChange={(v) => set('memoryOptimize', v)}
              >
                启动游戏前进行内存优化
              </AlxCheck>
            </div>

            {/* 内存比例条：已使用 / 游戏分配 / 剩余 */}
            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  display: 'flex',
                  height: 6,
                  borderRadius: 3,
                  overflow: 'hidden',
                  background: 'var(--alx-7)',
                }}
              >
                <div
                  style={{
                    width: '22%',
                    background: 'linear-gradient(90deg, #1370f3, #4890f5)',
                  }}
                />
                <div style={{ width: '50%', background: '#1370f3', opacity: 0.5 }} />
                <div style={{ flex: 1, background: '#d5e6fd', opacity: 0.7 }} />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: 8,
                }}
              >
                <MemoryStat label="已使用" value="4.7 GB" />
                <MemoryStat label="游戏分配" value={`${(draft.memoryMb / 1024).toFixed(1)} GB`} />
                <MemoryStat label="剩余" value="11.3 GB" />
              </div>
            </div>
          </AlxCard>

          <AlxCard title="高级选项" collapsible defaultOpen={false}>
            <Row label="Java 虚拟机参数">
              <AlxInput
                value={draft.jvmArgs}
                placeholder="跟随全局设置"
                onChange={(v) => set('jvmArgs', v)}
              />
            </Row>

            <Row label="游戏参数">
              <AlxInput
                value={draft.gameArgs}
                placeholder="跟随全局设置"
                onChange={(v) => set('gameArgs', v)}
              />
            </Row>

            <Row label="内存管理">
              <AlxSelect
                value={draft.gcMode}
                options={GC_OPTIONS}
                onChange={(v) => set('gcMode', v as SettingsDraft['gcMode'])}
              />
            </Row>

            <Row label="启动前执行命令">
              <AlxInput
                value={draft.preLaunchCommand}
                placeholder="无"
                onChange={(v) => set('preLaunchCommand', v)}
              />
            </Row>

            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
              <AlxCheck
                checked={draft.forbidModUpdate}
                onChange={(v) => set('forbidModUpdate', v)}
              >
                禁止更新 Mod
              </AlxCheck>
              <AlxCheck
                checked={draft.disableFileVerify}
                onChange={(v) => set('disableFileVerify', v)}
              >
                关闭文件校验
              </AlxCheck>
              <AlxCheck checked={draft.disableJlw} onChange={(v) => set('disableJlw', v)}>
                禁用 Java Launch Wrapper
              </AlxCheck>
              <AlxCheck checked={draft.verifySsl} onChange={(v) => set('verifySsl', v)}>
                在正版登录时验证 SSL 证书
              </AlxCheck>
            </div>
          </AlxCard>
        </>
      )}

      {section === 'personal' && <PersonalizationPanel {...panelProps} />}

      {section === 'other' && <OtherPanel {...panelProps} />}

      {section === 'link' && <OnlinePanel {...panelProps} />}

      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <AlxButton highlight onClick={() => void save()}>
          保存设置
        </AlxButton>
        <AlxButton onClick={reset}>重置</AlxButton>
      </div>
    </AlxPage>
  )
}

/** 内存比例条下方的一个数值标签（标题 11px / 透明，数值 16px）。 */
function MemoryStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 11, color: 'var(--alx-1)', opacity: 0.7 }}>{label}</span>
      <span style={{ fontSize: 16, color: 'var(--alx-1)' }}>{value}</span>
    </div>
  )
}
