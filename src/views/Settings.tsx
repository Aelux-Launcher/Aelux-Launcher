import { useState } from 'react'
import { toast, IconPlay, IconStar, IconGrid } from 'aelux-components'
import { useApp, platform } from '../store'
import { SettingsSchema, type Settings } from 'aelux-launcher-lib'
import { PclPage } from '../components/PclPage'
import { PclCard } from '../components/PclCard'

const SECTIONS = [
  { key: 'launch', title: '启动', icon: <IconPlay size={17} /> },
  { key: 'personal', title: '个性化', icon: <IconStar size={17} /> },
  { key: 'other', title: '其他', icon: <IconGrid size={17} /> },
]

/** 一行「标签 + 控件」，标签右对齐（PCL 设置页的 FormItem 布局） */
function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="pcl-form-row">
      <div className="pcl-form-row__label">{label}</div>
      <div className="pcl-form-row__control">{children}</div>
    </div>
  )
}

/**
 * 设置页 —— 复刻 PCL 的 `PageSetting`：
 *   左栏：启动 / 个性化 / 其他
 *   右栏：「启动选项」卡片（标签 + 下拉/输入行）+「内存分配」卡片（单选 + 滑块 + 勾选 + 底部标签页）
 */
export function Settings() {
  const { settings, setTheme, theme } = useApp()
  const [section, setSection] = useState('launch')
  const [draft, setDraft] = useState<Settings>(settings)
  const [autoMemory, setAutoMemory] = useState(true)
  const [customMemory, setCustomMemory] = useState(settings.memoryMb)
  const [optimize, setOptimize] = useState(false)
  const [memTab, setMemTab] = useState<'used' | 'game'>('used')

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    const next = { ...draft, [key]: value }
    setDraft(next)
    useApp.setState({ settings: next })
  }

  async function save() {
    try {
      const parsed = SettingsSchema.parse({ ...draft, memoryMb: autoMemory ? draft.memoryMb : customMemory })
      useApp.setState({ settings: parsed })
      await platform.storage.set('settings', JSON.stringify(parsed))
      toast.success('设置已保存')
    } catch (e) {
      toast.error(`保存失败：${(e as Error).message}`)
    }
  }

  return (
    <PclPage nav={SECTIONS} active={section} onSelect={setSection} leftWidth={170}>
      {section === 'launch' && (
        <>
          <PclCard title="启动选项">
            <Row label="默认版本隔离">
              <select className="pcl-select" defaultValue="all">
                <option value="all">隔离所有版本</option>
                <option value="none">不隔离</option>
              </select>
            </Row>
            <Row label="游戏窗口标题">
              <input
                className="pcl-input"
                defaultValue="默认"
                onChange={(e) => update('javaPath', e.target.value)}
                placeholder="默认"
              />
            </Row>
            <Row label="自定义信息">
              <input
                className="pcl-input"
                defaultValue="Aelux"
                onChange={(e) => update('instancesDir', e.target.value)}
                placeholder="Aelux"
              />
            </Row>
            <Row label="启动器可见性">
              <select className="pcl-select" defaultValue="keep">
                <option value="keep">游戏启动后仍保持不变</option>
                <option value="hide">游戏启动后隐藏</option>
                <option value="min">游戏启动后最小化</option>
              </select>
            </Row>
            <Row label="进程优先级">
              <select className="pcl-select" defaultValue="normal">
                <option value="low">低（省电）</option>
                <option value="normal">中（平衡）</option>
                <option value="high">高（性能）</option>
              </select>
            </Row>
            <Row label="窗口大小">
              <select className="pcl-select" defaultValue="default">
                <option value="default">默认</option>
                <option value="854">854 × 480</option>
                <option value="1280">1280 × 720</option>
              </select>
            </Row>
            <Row label="Java 路径">
              <input
                className="pcl-input"
                value={draft.javaPath}
                onChange={(e) => update('javaPath', e.target.value)}
                placeholder="自动探测"
              />
            </Row>
          </PclCard>

          <PclCard title="内存分配">
            <label className="pcl-radio" style={{ marginBottom: 10 }}>
              <input
                type="radio"
                name="aelux-memory"
                checked={autoMemory}
                onChange={() => setAutoMemory(true)}
              />
              <span className="pcl-radio__box">
                <span className="pcl-radio__dot" />
              </span>
              自动配置
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
              <label className="pcl-radio">
                <input
                  type="radio"
                  name="aelux-memory"
                  checked={!autoMemory}
                  onChange={() => setAutoMemory(false)}
                />
                <span className="pcl-radio__box">
                  <span className="pcl-radio__dot" />
                </span>
                自定义
              </label>
              <div className="pcl-slider">
                <div className="pcl-slider__track" />
                <div
                  className="pcl-slider__fill"
                  style={{ width: `${Math.min(100, (customMemory / 8192) * 100)}%` }}
                />
                <div
                  className="pcl-slider__dot"
                  style={{ left: `${Math.min(100, (customMemory / 8192) * 100)}%` }}
                />
                <input
                  type="range"
                  min={512}
                  max={8192}
                  step={256}
                  value={customMemory}
                  disabled={autoMemory}
                  onChange={(e) => setCustomMemory(Number(e.target.value))}
                  style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%' }}
                />
              </div>
              <span style={{ minWidth: 92, textAlign: 'right', fontSize: 13 }}>
                {autoMemory ? '自动' : `${customMemory} MB`}
              </span>
            </div>

            <label className="pcl-check">
              <input type="checkbox" checked={optimize} onChange={(e) => setOptimize(e.target.checked)} />
              <span className="pcl-check__box">✓</span>
              启动游戏前进行内存优化
            </label>
          </PclCard>

          <div className="pcl-tabs">
            <button
              type="button"
              className={`pcl-tabs__item${memTab === 'used' ? ' is-active' : ''}`}
              onClick={() => setMemTab('used')}
            >
              已使用内存
            </button>
            <button
              type="button"
              className={`pcl-tabs__item${memTab === 'game' ? ' is-active' : ''}`}
              onClick={() => setMemTab('game')}
            >
              游戏分配
            </button>
          </div>
        </>
      )}

      {section === 'personal' && (
        <>
          <PclCard title="外观">
            <Row label="主题">
              <select
                className="pcl-select"
                value={theme}
                onChange={(e) => setTheme(e.target.value as 'light' | 'dark')}
              >
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
            </Row>
            <Row label="自定义信息">
              <input
                className="pcl-input"
                value={draft.instancesDir}
                onChange={(e) => update('instancesDir', e.target.value)}
                placeholder="Aelux"
              />
            </Row>
          </PclCard>

          <PclCard title="实验性功能">
            <Row label="AI 修复模组">
              <span style={{ fontSize: 12, color: 'var(--pcl-1)', opacity: 0.7 }}>
                每次启动自动注入保底修复 mod（试验性，失败不阻断启动）
              </span>
            </Row>
            <label className="pcl-check" style={{ paddingTop: 6 }}>
              <input
                type="checkbox"
                checked={draft.aiFixMod}
                onChange={(e) => update('aiFixMod', e.target.checked)}
              />
              <span className="pcl-check__box">✓</span>
              启用 AI 修复模组
            </label>
          </PclCard>
        </>
      )}

      {section === 'other' && (
        <>
          <PclCard title="其他">
            <Row label="自动更新">
              <label className="pcl-check">
                <input
                  type="checkbox"
                  checked={draft.autoUpdate}
                  onChange={(e) => update('autoUpdate', e.target.checked)}
                />
                <span className="pcl-check__box">✓</span>
                启动时检查更新
              </label>
            </Row>
            <Row label="游戏退出后关闭启动器">
              <label className="pcl-check">
                <input
                  type="checkbox"
                  checked={draft.closeOnExit}
                  onChange={(e) => update('closeOnExit', e.target.checked)}
                />
                <span className="pcl-check__box">✓</span>
                关闭
              </label>
            </Row>
            <Row label="实例目录">
              <input
                className="pcl-input"
                value={draft.instancesDir}
                onChange={(e) => update('instancesDir', e.target.value)}
                placeholder="默认（应用数据目录）"
              />
            </Row>
          </PclCard>
        </>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" className="pcl-btn pcl-btn--primary" onClick={save}>
          保存设置
        </button>
        <button
          type="button"
          className="pcl-btn"
          onClick={() => {
            setDraft(settings)
            useApp.setState({ settings })
            toast.info('已重置为已保存的设置')
          }}
        >
          重置
        </button>
      </div>
    </PclPage>
  )
}
