<script setup lang="ts" vapor>
/**
 * 应用外壳（极简黑白设计稿）：
 *   全局顶栏（返回 + Logo + 窗口控制）
 *   + 侧栏（按模块分组切换 + 底部账户区）
 *   + 内容舞台（双层交叉过渡，沿用既有动画体系）
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import { router } from './router'
import { useAppStore } from './stores/app'
import TopHeader from './components/TopHeader.vue'
import SideNav from './components/SideNav.vue'
import AlxModal from './components/AlxModal.vue'
import { toasts, toast } from './lib/toast'
import Home from './views/Home.vue'
import Download from './views/Download.vue'
import Settings from './views/Settings.vue'
import More from './views/More.vue'
import Select from './views/Select.vue'
import TaskManager from './views/TaskManager.vue'
import Instance from './views/Instance.vue'
import ResourceDetail from './views/ResourceDetail.vue'
import HelpDetail from './views/HelpDetail.vue'
import VersionDetail from './views/VersionDetail.vue'
import Accounts from './views/Accounts.vue'
import DeviceLoginModal from './components/DeviceLoginModal.vue'

/** 离场动画时长（须与 theme.css 里 alx-stage-out 的时长一致） */
const LEAVE_MS = 180

type StageMotion = 'forward' | 'back' | 'swap'

interface StageLayer {
  id: number
  key: string
  comp: Component
  props: Record<string, unknown>
  leaving: boolean
  motion: StageMotion
}

const COMPONENTS: Record<string, Component> = {
  home: Home,
  download: Download,
  settings: Settings,
  more: More,
  select: Select,
  tasks: TaskManager,
  instance: Instance,
  resource: ResourceDetail,
  help: HelpDetail,
  version: VersionDetail,
  accounts: Accounts,
}

const store = useAppStore()
const route = computed(() => router.currentRoute.value)

/** 舞台内容键：同键视为同一页（用于判定是否需要切换动画）。 */
function stageKey(r: (typeof route.value)): string {
  const name = String(r.name ?? 'home')
  if (name === 'instance') return `instance:${r.params.instanceId}:${r.params.tab ?? 'overall'}`
  if (name === 'resource') return `resource:${r.params.projectId}`
  if (name === 'help') return `help:${r.params.entryId}`
  if (name === 'version') return `version:${r.params.versionId}`
  if (name === 'download') return `download:${r.params.cat}`
  if (name === 'settings') return `settings:${r.params.sec}`
  if (name === 'more') return `more:${r.params.sec}`
  return name
}

/** 该层的组件参数快照（退场期间内容不随路由漂移）。 */
function stageProps(r: (typeof route.value)): Record<string, unknown> {
  const name = String(r.name ?? 'home')
  if (name === 'instance')
    return { instanceId: String(r.params.instanceId ?? ''), tab: String(r.params.tab ?? 'overall') }
  if (name === 'resource')
    return {
      resourceKind: String(r.params.kind ?? 'mod'),
      projectId: String(r.params.projectId ?? ''),
      title: String(r.query.title ?? ''),
    }
  if (name === 'help') return { entryId: String(r.params.entryId ?? ''), title: String(r.query.title ?? '') }
  if (name === 'version') return { versionId: String(r.params.versionId ?? '') }
  if (name === 'download') return { cat: String(r.params.cat ?? 'original') }
  if (name === 'settings') return { sec: String(r.params.sec ?? 'global') }
  if (name === 'more') return { sec: String(r.params.sec ?? 'help') }
  return {}
}

/**
 * 根据页面层级决定过渡方向：模块进入详情是“推进”，从详情或模块回首页是“回退”；
 * 同一模块的分类切换保持克制，避免用户在筛选资源时感到页面被重新打开。
 */
function stageMotion(from: (typeof route.value), to: (typeof route.value)): StageMotion {
  const fromSub = Boolean(from.meta.sub)
  const toSub = Boolean(to.meta.sub)
  const fromModule = String(from.meta.module ?? 'home')
  const toModule = String(to.meta.module ?? 'home')

  if (!fromSub && toSub) return 'forward'
  if (fromSub && !toSub) return 'back'
  if (toModule === 'home' && fromModule !== 'home') return 'back'
  if (fromModule === 'home' && toModule !== 'home') return 'forward'
  return 'swap'
}

/** 每页独立记录滚动位置；从详情返回列表时不会丢失阅读位置。 */
const scrollPositions = new Map<string, number>()

function saveScroll(key: string) {
  const page = document.querySelector<HTMLElement>('.alx-stage__layer:last-child .page-view')
  if (page) scrollPositions.set(key, page.scrollTop)
}

function restoreScroll(key: string) {
  void nextTick(() => {
    const page = document.querySelector<HTMLElement>('.alx-stage__layer:last-child .page-view')
    if (page) page.scrollTop = scrollPositions.get(key) ?? 0
  })
}

const layers = ref<StageLayer[]>([
  {
    id: 0,
    key: stageKey(route.value),
    comp: COMPONENTS[String(route.value.name ?? 'home')] ?? Home,
    props: stageProps(route.value),
    leaving: false,
    motion: 'swap',
  },
])
let nextId = 1

// 目标页变化 → 旧层转退场，新层立即入场。
watch(
  () => stageKey(route.value),
  (key, previousKey) => {
    const top = layers.value[layers.value.length - 1]
    if (!top || top.key === key) return
    const motion = stageMotion(topRoute.value, route.value)
    saveScroll(previousKey)
    layers.value = [
      ...layers.value.map((l, i) =>
        i === layers.value.length - 1 ? { ...l, leaving: true, motion } : l,
      ),
      {
        id: nextId++,
        key,
        comp: COMPONENTS[String(route.value.name ?? 'home')] ?? Home,
        props: stageProps(route.value),
        leaving: false,
        motion,
      },
    ]
    restoreScroll(key)
  },
  // 同步捕捉：DOM 仍是旧页，且 topRoute 尚未被路由快照观察器覆盖。
  { flush: 'sync' },
)

/** 路由快照用于在响应式路由切换后仍能判断上一页的层级。 */
const topRoute = ref(route.value)
watch(
  route,
  (current, previous) => {
    if (stageKey(current) !== stageKey(previous)) topRoute.value = previous
  },
)

// 每个退场层各管各的卸载定时器：快切时互不干扰。
const timers = new Map<number, number>()
watch(
  layers,
  (ls) => {
    for (const layer of ls) {
      if (!layer.leaving || timers.has(layer.id)) continue
      timers.set(
        layer.id,
        window.setTimeout(() => {
          timers.delete(layer.id)
          layers.value = layers.value.filter((l) => l.id !== layer.id)
        }, LEAVE_MS + 16),
      )
    }
  },
  { deep: true },
)

onBeforeUnmount(() => {
  for (const t of timers.values()) window.clearTimeout(t)
  timers.clear()
})

onMounted(() => {
  void store.init()
  // 浏览器预览提示只停留 3 秒：说明数据是模拟的即可，不常驻遮挡内容
  window.setTimeout(() => {
    showPreviewTip.value = false
  }, 3000)
})

const announcement = computed(() => store.pendingAnnouncements[0] ?? null)
const showPreviewTip = ref(true)
</script>

<template>
  <div class="aelux-app">
    <TopHeader />

    <div class="main-body">
      <SideNav />

      <div class="content-area">
        <div class="alx-stage">
          <div
            v-for="layer in layers"
            :key="layer.id"
            :class="[
              'alx-stage__layer',
              `alx-stage__layer--${layer.motion}`,
              layer.leaving && 'alx-stage__layer--leaving',
              !layer.leaving && layer.id !== 0 && 'alx-stage__layer--entering',
            ]"
            :style="layer.id === 0 ? undefined : { '--alx-enter-base': `${LEAVE_MS}ms` }"
            :aria-hidden="layer.leaving || undefined"
            :inert="layer.leaving || undefined"
          >
            <component :is="layer.comp" v-bind="layer.props" />
          </div>
        </div>

        <!-- 初始化提醒：浮在内容区右下角 -->
        <div v-if="store.initError || store.browserMode" class="aelux-init-alerts">
          <div v-if="store.initError" class="aelux-alert" role="alert">
            <div class="aelux-alert__head">
              <span class="aelux-alert__title">部分平台能力不可用</span>
            </div>
            <div class="aelux-alert__desc">{{ store.initError }}</div>
            <button type="button" class="btn-download btn-ghost" @click="store.init()">重试</button>
          </div>
          <div v-if="store.browserMode && showPreviewTip" class="aelux-alert" role="alert">
            <div class="aelux-alert__head">
              <span class="aelux-alert__title">浏览器预览模式</span>
            </div>
            <div class="aelux-alert__desc">
              未检测到 Tauri 运行时，版本清单、下载与启动均为模拟实现；界面布局与桌面端一致。
            </div>
          </div>
        </div>
      </div>
    </div>

    <AlxModal
      :open="!!announcement"
      :title="announcement?.title ?? ''"
      @close="announcement && store.markAnnouncementShown(announcement.id)"
    >
      <p>{{ announcement?.body }}</p>
      <template #actions>
        <button
          type="button"
          class="btn-download"
          @click="announcement && store.markAnnouncementShown(announcement.id)"
        >
          知道了
        </button>
      </template>
    </AlxModal>

    <!-- 微软设备码登录弹窗（全局：启动页 / 账户管理页侧栏均可触发） -->
    <DeviceLoginModal />

    <!-- 全局 toast -->
    <div class="aelux-toasts">
      <TransitionGroup name="aelux-toast">
        <div
          v-for="t in toasts.items"
          :key="t.id"
          :class="['aelux-toast', `aelux-toast--${t.kind}`]"
          @click="toast.dismiss(t.id)"
        >
          {{ t.text }}
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>
