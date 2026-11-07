<script setup lang="ts" vapor>
/**
 * 应用外壳（极简黑白设计稿）：
 *   全局顶栏（返回 + Logo + 窗口控制）
 *   + 侧栏（按模块分组切换 + 底部账户区）
 *   + 内容舞台（页面切换直接替换，内容块逐项淡入）
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import { router } from './router'
import { useAppStore } from './stores/app'
import TopHeader from './components/TopHeader.vue'
import SideNav from './components/SideNav.vue'
import AlxModal from './components/AlxModal.vue'
import { toasts, toast } from './lib/toast'
import { call, isTauri } from './lib/bridge'
import { readExtras } from './views/SettingsModel'
import { convertFileSrc } from '@tauri-apps/api/core'
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

/** 舞台内容直接由路由派生：路由变化必然触发重渲染，避免手动层状态滞留。 */
const stage = computed(() => ({
  key: stageKey(route.value),
  comp: COMPONENTS[String(route.value.name ?? 'home')] ?? Home,
  props: stageProps(route.value),
}))

// 页面切换后回到顶部（等新页 DOM 渲染完成再滚动）。
watch(
  () => stage.value.key,
  () => resetStageScroll(),
  { flush: 'post' },
)

/** 自定义背景：直接铺在应用根节点上（设置页选择图片后立即生效）。 */
const appStyle = computed(() => {
  const extras = readExtras(store.settings)
  if (extras.backgroundMode !== 'custom' || !extras.backgroundPath) return {}
  const url = isTauri ? convertFileSrc(extras.backgroundPath) : extras.backgroundPath
  return {
    backgroundImage: `url("${url}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  }
})

/** 桌面端拦截 WebView 默认右键菜单（返回 / 刷新 / 另存为 / 打印 / 检查）。 */
function onContextMenu(e: MouseEvent) {
  if (isTauri) e.preventDefault()
}

/** 桌面端拦截浏览器快捷键（F5 / Ctrl+R / 打印 / devtools / 前进后退）。 */
function onShortcut(e: KeyboardEvent) {
  if (!isTauri) return
  const key = e.key.toLowerCase()
  const ctrl = e.ctrlKey || e.metaKey
  const blocked =
    key === 'f5' ||
    key === 'f12' ||
    (ctrl && ['r', 'p', 's', 'u'].includes(key)) ||
    (ctrl && e.shiftKey && ['r', 'i', 'j', 'c'].includes(key)) ||
    (e.altKey && (key === 'arrowleft' || key === 'arrowright'))
  if (!blocked) return
  e.preventDefault()
  e.stopPropagation()
}

onMounted(() => {
  // 刷新后不还原上次的滚动位置：页面回到顶部。
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  // Tauri WebView 的默认右键菜单与快捷键在桌面端全部禁用（浏览器预览保留，便于调试）
  document.addEventListener('contextmenu', onContextMenu, { capture: true })
  document.addEventListener('keydown', onShortcut, { capture: true })
  resetStageScroll()
  void store.init().then(() => {
    // 启动时恢复自定义窗口图标
    const icon = readExtras(store.settings).iconPath
    if (isTauri && icon) void call('set_window_icon', { path: icon }).catch(() => {})
  })
  // 浏览器预览提示只停留 3 秒：说明数据是模拟的即可，不常驻遮挡内容
  window.setTimeout(() => {
    showPreviewTip.value = false
  }, 3000)
})

onBeforeUnmount(() => {
  document.removeEventListener('contextmenu', onContextMenu, { capture: true })
  document.removeEventListener('keydown', onShortcut, { capture: true })
})

const announcement = computed(() => store.pendingAnnouncements[0] ?? null)
const showPreviewTip = ref(true)

/** 复制崩溃日志到剪贴板。 */
async function copyCrashLog() {
  const c = store.crashInfo
  if (!c) return
  try {
    await navigator.clipboard.writeText(c.content)
    toast.success('崩溃日志已复制到剪贴板')
  } catch {
    toast.error('复制失败，请在日志中手动选择文本复制')
  }
}

/** 打开崩溃日志所在文件夹。 */
async function openCrashFolder() {
  const c = store.crashInfo
  if (!c) return
  if (!c.path) {
    toast.warning('没有找到崩溃日志文件')
    return
  }
  const dir = c.path.replace(/[\\/][^\\/]+$/, '')
  try {
    await call('open_folder_in_explorer', { path: dir })
  } catch (e) {
    toast.error(`打开失败：${(e as Error).message}`)
  }
}
</script>

<template>
  <div class="aelux-app" :style="appStyle">
    <TopHeader />

    <div class="main-body">
      <SideNav />

      <div class="content-area">
        <div class="alx-stage">
          <div :key="stage.key" class="alx-stage__layer">
            <component :is="stage.comp" v-bind="stage.props" />
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

    <!-- 游戏崩溃弹窗（内核上报非 0 退出码时自动弹出） -->
    <AlxModal :open="!!store.crashInfo" title="游戏崩溃了" @close="store.dismissCrash()">
      <div v-if="store.crashInfo" class="crash-modal">
        <div class="crash-meta">
          <span class="tag">{{ store.crashInfo.instanceName }}</span>
          <span class="tag">退出码 {{ store.crashInfo.exitCode }}</span>
          <span class="tag">{{ store.crashInfo.fromGame ? '崩溃报告' : '启动日志' }}</span>
        </div>
        <div class="crash-desc">
          游戏没有正常退出。下面是日志的末尾片段，完整内容可在崩溃日志文件夹中查看。
        </div>
        <pre class="crash-log">{{ store.crashInfo.content }}</pre>
      </div>
      <template #actions>
        <button type="button" class="btn-download btn-ghost" @click="store.dismissCrash()">
          取消
        </button>
        <button type="button" class="btn-download btn-ghost" @click="openCrashFolder">
          打开崩溃日志文件夹
        </button>
        <button type="button" class="btn-download" @click="copyCrashLog">复制崩溃日志</button>
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
