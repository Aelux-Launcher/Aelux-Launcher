<script setup lang="ts">
/**
 * 下拉选择（替代原生 select）：
 * 原生下拉面板由系统绘制，选项多时会溢出到启动器窗口之外，
 * 这里改为自绘面板：固定高度 + 内部滚动，并自动向上/向下避让。
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import AlxIcon from './AlxIcon.vue'

export interface SelectOption {
  value: string
  label: string
}

const props = withDefaults(
  defineProps<{
    options: ReadonlyArray<SelectOption>
    modelValue?: string
    placeholder?: string
    /** 面板最大高度（px），超出后内部滚动。 */
    maxHeight?: number
  }>(),
  { modelValue: '', placeholder: '请选择', maxHeight: 280 },
)

const emit = defineEmits<{ 'update:modelValue': [string] }>()

const open = ref(false)
/** 触发器容器（用于定位与外部点击判定）。 */
const root = ref<HTMLElement | null>(null)
/** 浮层面板（Teleport 到 body，避免被卡片 overflow 裁切）。 */
const panel = ref<HTMLElement | null>(null)

const panelStyle = ref<Record<string, string>>({})

const selectedLabel = computed(
  () => props.options.find((o) => o.value === props.modelValue)?.label ?? '',
)

const ITEM_HEIGHT = 32
const PANEL_PADDING = 8

/** 面板朝向与位置：下方空间不足时向上展开。 */
function placePanel() {
  const rect = root.value?.getBoundingClientRect()
  if (!rect) return
  const wantHeight = Math.min(
    props.maxHeight,
    props.options.length * ITEM_HEIGHT + PANEL_PADDING,
  )
  const below = window.innerHeight - rect.bottom - 12
  const above = rect.top - 12
  const upward = below < wantHeight && above > below
  const height = Math.max(96, Math.min(wantHeight, upward ? above : below))
  // 面板宽度与触发器保持一致，避免短按钮配长面板。
  const width = Math.min(rect.width || 200, window.innerWidth - 16)
  panelStyle.value = {
    left: `${Math.min(rect.left, window.innerWidth - width - 8)}px`,
    width: `${width}px`,
    maxHeight: `${height}px`,
    ...(upward
      ? { bottom: `${window.innerHeight - rect.top + 4}px` }
      : { top: `${rect.bottom + 4}px` }),
  }
}

function toggle() {
  if (open.value) {
    close()
    return
  }
  placePanel()
  open.value = true
  document.addEventListener('mousedown', onDocumentDown, true)
  window.addEventListener('scroll', onWindowScroll, true)
  window.addEventListener('resize', close)
}

function close() {
  open.value = false
  document.removeEventListener('mousedown', onDocumentDown, true)
  window.removeEventListener('scroll', onWindowScroll, true)
  window.removeEventListener('resize', close)
}

/** 面板内部滚动不关闭；页面其它区域滚动时关闭。 */
function onWindowScroll(e: Event) {
  if (panel.value && e.target instanceof Node && panel.value.contains(e.target)) return
  close()
}

function onDocumentDown(e: MouseEvent) {
  const target = e.target as Node
  if (root.value?.contains(target) || panel.value?.contains(target)) return
  close()
}

function choose(value: string) {
  emit('update:modelValue', value)
  close()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

onBeforeUnmount(close)
</script>

<template>
  <div ref="root" class="alx-select">
    <button
      type="button"
      :class="['alx-select-trigger', open ? 'open' : '']"
      :aria-expanded="open"
      @click.stop="toggle"
      @keydown="onKeydown"
    >
      <span :class="['alx-select-value', selectedLabel ? '' : 'placeholder']">
        {{ selectedLabel || placeholder }}
      </span>
      <AlxIcon name="chevron-down" :size="14" class="alx-select-chevron" />
    </button>

    <Teleport to="body">
      <div v-if="open" ref="panel" class="alx-select-panel" :style="panelStyle" role="listbox">
        <button
          v-for="o in options"
          :key="o.value"
          type="button"
          :class="['alx-select-option', o.value === modelValue ? 'active' : '']"
          :title="o.label"
          role="option"
          :aria-selected="o.value === modelValue"
          @click="choose(o.value)"
        >
          {{ o.label }}
        </button>
      </div>
    </Teleport>
  </div>
</template>
