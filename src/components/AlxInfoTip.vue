<script setup lang="ts">
/**
 * 说明图标：圆圈感叹号，悬停 / 聚焦时浮出解释气泡。
 * 气泡 Teleport 到 body 并用 fixed 定位，避免被卡片的 overflow 裁切；
 * 下方空间不足时自动翻到图标上方。
 */
import { nextTick, onBeforeUnmount, ref } from 'vue'
import AlxIcon from './AlxIcon.vue'

const props = withDefaults(
  defineProps<{
    /** 解释文案（支持 \n 换行） */
    text: string
    size?: number
  }>(),
  { size: 14 },
)

const root = ref<HTMLElement | null>(null)
const bubble = ref<HTMLElement | null>(null)
const visible = ref(false)
const bubbleStyle = ref<Record<string, string>>({})

const MAX_WIDTH = 300
const GAP = 8

async function show() {
  const rect = root.value?.getBoundingClientRect()
  if (!rect) return
  visible.value = true
  await nextTick()
  const width = Math.min(MAX_WIDTH, window.innerWidth - 24)
  const height = bubble.value?.offsetHeight ?? 0
  const left = Math.min(Math.max(12, rect.left - 8), window.innerWidth - width - 12)
  const upward = rect.bottom + GAP + height > window.innerHeight - 12 && rect.top > height + GAP
  bubbleStyle.value = {
    left: `${left}px`,
    width: `${width}px`,
    ...(upward
      ? { bottom: `${window.innerHeight - rect.top + GAP}px` }
      : { top: `${rect.bottom + GAP}px` }),
  }
}

function hide() {
  visible.value = false
}

onBeforeUnmount(hide)
</script>

<template>
  <span
    ref="root"
    class="alx-tip"
    role="note"
    tabindex="0"
    :aria-label="text"
    @mouseenter="show"
    @mouseleave="hide"
    @focus="show"
    @blur="hide"
  >
    <AlxIcon name="info" :size="props.size" />
  </span>

  <Teleport to="body">
    <div v-if="visible" ref="bubble" class="alx-tip-bubble" :style="bubbleStyle">{{ text }}</div>
  </Teleport>
</template>
