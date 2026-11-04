<script setup lang="ts">
/**
 * 全局顶栏（60px）：
 *   左侧 ← 返回（模块态 / 子页面态显示，点击回启动页或逐级回退）+ Logo；
 *   右侧最小化 / 关闭。
 *
 * 窗口拖动：data-tauri-drag-region 只在点击目标自身带属性时生效，
 * 各平台注入行为不一致；这里显式调用 startDragging()（排除按钮等交互元素），
 * 属性保留作为双保险。
 */
import { getCurrentWindow } from '@tauri-apps/api/window'
import { call, isTauri } from '../lib/bridge'
import { useAppStore } from '../stores/app'
import AlxIcon from './AlxIcon.vue'

const store = useAppStore()

function onDragStart(e: MouseEvent) {
  if (e.button !== 0 || !isTauri) return
  if ((e.target as HTMLElement).closest('button, a, input')) return
  void getCurrentWindow().startDragging()
}
</script>

<template>
  <div class="top-header" data-tauri-drag-region @mousedown="onDragStart">
    <div class="header-left">
      <button
        v-if="store.showBack"
        type="button"
        class="back-btn"
        aria-label="返回"
        @click="store.pageBack()"
      >
        ←
      </button>
      <div class="logo">Aelux</div>
      <span v-if="store.browserMode" class="tag">预览</span>
    </div>

    <div class="window-controls">
      <button type="button" aria-label="最小化" @click="call('minimize_window')">
        <AlxIcon name="minus" :size="16" />
      </button>
      <button type="button" class="win-close" aria-label="关闭" @click="call('close_window')">
        <AlxIcon name="x" :size="16" />
      </button>
    </div>
  </div>
</template>
