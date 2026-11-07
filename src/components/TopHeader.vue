<script setup lang="ts">
/**
 * 全局顶栏（60px）：
 *   左侧 ← 返回（模块态 / 子页面态显示，点击回启动页或逐级回退）+ Logo；
 *   右侧最小化 / 全屏 / 关闭（最大化与全屏功能重复，统一收敛到全屏）。
 *
 * 拖动：显式调用 startDragging()（排除按钮等交互元素），属性保留作为双保险。
 * 全屏：F11 切换，Esc 退出；标题栏双击仍按系统习惯最大化（窗口状态恢复由内核处理）。
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { call, isTauri } from '../lib/bridge'
import { useAppStore } from '../stores/app'
import AlxIcon from './AlxIcon.vue'

const store = useAppStore()

const fullscreen = ref(false)

function onDragStart(e: MouseEvent) {
  if (e.button !== 0 || !isTauri) return
  if ((e.target as HTMLElement).closest('button, a, input')) return
  void getCurrentWindow().startDragging()
}

/** 双击标题栏切换最大化（与系统行为一致）。 */
function onTitleDoubleClick(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('button, a, input')) return
  void toggleMaximize()
}

async function syncWindowState() {
  if (!isTauri) return
  try {
    const [, full] = await call<[boolean, boolean]>('window_state')
    fullscreen.value = full
  } catch {
    // 内核未就绪时不阻塞顶栏
  }
}

async function toggleMaximize() {
  if (!isTauri) return
  await call<boolean>('toggle_maximize_window')
  // 系统还原是异步的，稍后再同步一次真实状态
  setTimeout(() => void syncWindowState(), 200)
}

async function toggleFullscreen(force?: boolean) {
  if (!isTauri) return
  fullscreen.value = await call<boolean>('set_fullscreen_window', {
    fullscreen: force ?? !fullscreen.value,
  })
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'F11') {
    e.preventDefault()
    void toggleFullscreen()
  } else if (e.key === 'Escape' && fullscreen.value) {
    void toggleFullscreen(false)
  }
}

onMounted(() => {
  void syncWindowState()
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="top-header" @mousedown="onDragStart" @dblclick="onTitleDoubleClick">
    <div class="header-left">
      <button
        v-if="store.showBack"
        type="button"
        class="back-btn"
        aria-label="返回"
        @click="store.pageBack()"
      >
        <AlxIcon name="arrow-left" :size="18" />
      </button>
      <div class="logo">Aelux</div>
      <span v-if="store.browserMode" class="tag">预览</span>
    </div>

    <div class="header-right">
      <!-- 下载中：点击进入下载进度页 -->
      <button
        v-if="store.downloadActive"
        type="button"
        class="header-download-btn"
        aria-label="查看下载进度"
        title="正在下载，点击查看进度"
        @click="store.openTasksPage()"
      >
        <AlxIcon name="download" :size="16" />
        <span class="header-download-pulse" aria-hidden="true" />
      </button>

      <div class="window-controls">
        <button type="button" aria-label="最小化" @click="call('minimize_window')">
          <AlxIcon name="minus" :size="16" />
        </button>
        <button
          type="button"
          :aria-label="fullscreen ? '退出全屏' : '全屏'"
          @click="toggleFullscreen()"
        >
          <AlxIcon :name="fullscreen ? 'restore' : 'maximize'" :size="16" />
        </button>
        <button type="button" class="win-close" aria-label="关闭" @click="call('close_window')">
          <AlxIcon name="x" :size="16" />
        </button>
      </div>
    </div>
  </div>
</template>
