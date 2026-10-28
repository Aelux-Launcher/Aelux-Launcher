import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Dialog, Alert, cx } from 'aelux-components'
import { TitleBar } from './components/TitleBar'
import { useApp, announcements, type MainView, type SubPage } from './store'
import { Home } from './views/Home'
import { Download } from './views/Download'
import { Multiplayer } from './views/Multiplayer'
import { Settings } from './views/Settings'
import { More } from './views/More'
import { Select } from './views/Select'
import { Instance } from './views/Instance'
import { ResourceDetail } from './views/ResourceDetail'
import { TaskManager } from './views/TaskManager'
import { HelpDetail } from './views/HelpDetail'

/** 离场动画时长（须与 theme.css 里 alx-stage-out 的时长一致） */
const LEAVE_MS = 110

/** 舞台层：一次切换涉及的一层页面 */
interface StageLayer {
  /** 稳定 id —— React 靠它保住旧页组件实例，退场期间不丢状态 */
  id: number
  /** 舞台内容键：主页面或子页面 */
  key: string
  view: MainView
  sub: SubPage | null
  /** 是否正在淡出退场 */
  leaving: boolean
}

/** 舞台内容键：同键视为同一页（用于判定是否需要切换动画）。 */
function stageKey(view: MainView, sub: SubPage | null): string {
  if (!sub) return view
  switch (sub.kind) {
    case 'select':
      return 'select'
    case 'tasks':
      return 'tasks'
    case 'instance':
      return `instance:${sub.instanceId}:${sub.tab}`
    case 'resource':
      return `resource:${sub.projectId}`
    case 'help':
      return `help:${sub.entryId}`
  }
}

function renderStage(view: MainView, sub: SubPage | null) {
  if (sub) {
    switch (sub.kind) {
      case 'select':
        return <Select />
      case 'tasks':
        return <TaskManager />
      case 'instance':
        return <Instance instanceId={sub.instanceId} tab={sub.tab} />
      case 'resource':
        return (
          <ResourceDetail
            resourceKind={sub.resourceKind}
            projectId={sub.projectId}
            title={sub.title}
          />
        )
      case 'help':
        return <HelpDetail entryId={sub.entryId} title={sub.title} />
    }
  }
  switch (view) {
    case 'home':
      return <Home />
    case 'download':
      return <Download />
    case 'multiplayer':
      return <Multiplayer />
    case 'settings':
      return <Settings />
    case 'more':
      return <More />
  }
}

/**
 * 副页面的标题栏文案。
 *
 * 对齐上游 `PageNameGet`：只有副页面才返回非空串，
 * 返回空串即表示「这是主页面」，标题栏就该显示顶栏那排标签。
 */
function subTitle(sub: SubPage | null, instances: { id: string; name: string }[]): string {
  if (!sub) return ''
  switch (sub.kind) {
    case 'select':
      return '版本选择'
    case 'tasks':
      return '任务管理'
    case 'instance': {
      const inst = instances.find((i) => i.id === sub.instanceId)
      return `版本设置 - ${inst?.name ?? '未知版本'}`
    }
    case 'resource':
      return sub.title
    case 'help':
      return sub.title
  }
}

export function App() {
  const { view, subPage, init, pendingAnnouncements, initError, browserMode, instances } =
    useApp()

  // 启动器立刻可用：init() 在后台静默跑，各页面用自己的局部加载态。
  useEffect(() => {
    void init()
  }, [])

  /**
   * 页面切换：双层交叉过渡。
   *
   *   新页立刻挂载在下层，旧页保留在上层整体缩放淡出（110ms）后移除。
   *
   * 这样做的两个原因：
   *   1) 旧实现把整个舞台淡到透明再换页，底下露出了窗口的标题栏蓝
   *      (#4890f5)，切换过程中整页泛蓝；双层都有不透明的左右栏底色，
   *      交叉淡化时露出的始终是页面本身，不会泛蓝。
   *   2) 旧实现只有一个「当前页 + 离场中」状态，来回快切会让定时器互相
   *      取消、把页面永久卡在 opacity:0；分层后每层独立退场，不会互删。
   *
   * 旧层用稳定的 id 做 key，React 不会重建它的组件树，所以退场期间
   * 滚动位置、展开状态都还在。
   */
  const [layers, setLayers] = useState<StageLayer[]>(() => [
    { id: 0, key: stageKey(view, subPage), view, sub: subPage, leaving: false },
  ])

  // 目标页变化 → 旧层转退场，新层立即入场。
  // id 取顶层 id + 1：顶层永远保留（只卸载退场层），所以 id 不会重复。
  const targetKey = stageKey(view, subPage)
  useEffect(() => {
    setLayers((prev) => {
      const top = prev[prev.length - 1]
      if (!top || top.key === targetKey) return prev
      return [
        ...prev.map((l, i) => (i === prev.length - 1 ? { ...l, leaving: true } : l)),
        { id: top.id + 1, key: targetKey, view, sub: subPage, leaving: false },
      ]
    })
  }, [targetKey, view, subPage])

  // 每个退场层各管各的卸载定时器：快切时互不干扰（共用一个定时器会互相取消）。
  const timersRef = useRef<Map<number, number>>(new Map())
  useEffect(() => {
    const timers = timersRef.current
    for (const layer of layers) {
      if (!layer.leaving || timers.has(layer.id)) continue
      const t = window.setTimeout(() => {
        timers.delete(layer.id)
        setLayers((prev) => prev.filter((l) => l.id !== layer.id))
      }, LEAVE_MS + 16)
      timers.set(layer.id, t)
    }
  }, [layers])

  // 卸载时清掉所有待执行的定时器。
  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const t of timers.values()) window.clearTimeout(t)
      timers.clear()
    }
  }, [])

  const current = pendingAnnouncements[0]
  const title = subTitle(subPage, instances)

  return (
    <div className="aelux-app">
      <TitleBar
        subTitle={title || undefined}
        onBack={() => useApp.getState().pageBack()}
      />

      <div className="aelux-body">
        <main className="aelux-content">
          {(initError || browserMode) && (
            <div className="aelux-init-alerts">
              {initError && (
                <Alert
                  type="warning"
                  title="部分平台能力不可用"
                  description={initError}
                  className="aelux-init-alert"
                >
                  <Button variant="ghost" size="sm" onClick={() => init()}>
                    重试
                  </Button>
                </Alert>
              )}
              {browserMode && (
                <Alert
                  type="info"
                  title="浏览器预览模式"
                  description="未检测到 Tauri 运行时，版本清单、下载与启动均为模拟实现；界面布局与桌面端一致。"
                  className="aelux-init-alert"
                />
              )}
            </div>
          )}

          <div className="alx-stage">
            {layers.map((layer) => (
              <div
                key={layer.id}
                className={cx('alx-stage__layer', layer.leaving && 'alx-stage__layer--leaving')}
                style={
                  // 新页的逐项入场动画等旧页退场结束再开始，
                  // 免得新旧两页的内容同时在屏幕上运动。
                  // 首屏（id 0）没有旧页要等，不加延迟。
                  // 注意：该值在层的整个生命周期内保持不变 —— 若中途改变，
                  // 会改写子元素已播放完的 animation-delay，让旧页内容闪回透明。
                  layer.id === 0
                    ? undefined
                    : ({ '--alx-enter-base': `${LEAVE_MS}ms` } as CSSProperties)
                }
                aria-hidden={layer.leaving || undefined}
                inert={layer.leaving || undefined}
              >
                {renderStage(layer.view, layer.sub)}
              </div>
            ))}
          </div>
        </main>
      </div>

      <Dialog
        open={!!current}
        title={current?.title ?? ''}
        onClose={() => current && announcements.markShown(current.id)}
      >
        <p>{current?.body}</p>
        <Button variant="primary" onClick={() => current && announcements.markShown(current.id)}>
          知道了
        </Button>
      </Dialog>
    </div>
  )
}
