<script setup lang="ts" vapor>
/**
 * 应用外壳（极简黑白设计稿）：
 *   全局顶栏（返回 + Logo + 窗口控制）
 *   + 侧栏（按模块分组切换 + 底部账户区）
 *   + 内容舞台（页面切换直接替换，内容块逐项淡入）
 */
import { computed, nextTick, onMounted, ref, watch, type Component } from 'vue'
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
import DialogHost from './components/DialogHost.vue'

/** 舞台层：同一时间只渲染这一页。 */
interface StageLayer {
  id: number
  key: string
  comp: Component
  props: Record<string, unknown>
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
      gameVersion: String(r.query.version ?? ''),
      loader: String(r.query.loader ?? ''),
    }
  if (name === 'help') return { entryId: String(r.params.entryId ?? ''), title: String(r.query.title ?? '') }
  if (name === 'version') return { versionId: String(r.params.versionId ?? '') }
  if (name === 'download') return { cat: String(r.params.cat ?? 'original') }
  if (name === 'settings') return { sec: String(r.params.sec ?? 'global') }
  if (name === 'more') return { sec: String(r.params.sec ?? 'help') }
  return {}
}

/** 页面切换后始终从顶部开始（不再保留上一页的滚动位置）。 */
function resetStageScroll() {
  void nextTick(() => {
    const page = document.querySelector<HTMLElement>('.alx-stage__layer:last-child .page-view')
    if (page) page.scrollTop = 0
  })
}

const layer = ref<StageLayer>({
  id: 0,
  key: stageKey(route.value),
  comp: COMPONENTS[String(route.value.name ?? 'home')] ?? Home,
  props: stageProps(route.value),
})
let nextId = 1

// 页面切换：直接替换舞台内容，旧页在同一帧内卸载。
// 保留旧层等待卸载会让 WebView 的合成缓存残留上一页像素，形成重叠 / 拖影。
watch(
  () => stageKey(route.value),
  (key) => {
    if (layer.value.key === key) return
    layer.value = {
      id: nextId++,
      key,
      comp: COMPONENTS[String(route.value.name ?? 'home')] ?? Home,
      props: stageProps(route.value),
    }
    resetStageScroll()
  },
  // 同步捕捉：DOM 仍是旧页，且路由参数已更新。
  { flush: 'sync' },
)

onMounted(() => {
  // 刷新后不还原上次的滚动位置：页面回到顶部。
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  resetStageScroll()
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
          <div :key="layer.id" class="alx-stage__layer">
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

    <!-- 全局输入 / 确认对话框（替代原生 prompt / confirm） -->
    <DialogHost />

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
