<script setup lang="ts">
/**
 * 导出树的单个节点（含子孙）——递归渲染，与上游实现的嵌套结构一致：
 * 每个节点一层 div（控制缩进），子树作为兄弟节点继续下钻。
 * 锁定项（游戏本体）开关置灰且不可点击。
 */
import AlxToggle from '../../components/AlxToggle.vue'
import type { ExportOption } from '../instanceMeta'

const props = defineProps<{
  nodes: ExportOption[]
  depth: number
  /** 「游戏本体」节点旁显示的版本摘要 */
  gameLabel: string
}>()

const emit = defineEmits<{ toggle: [id: string, checked: boolean] }>()
</script>

<template>
  <template v-for="node in props.nodes" :key="node.id">
    <div>
      <div
        :style="{
          paddingLeft: `${props.depth * 18}px`,
          marginBottom: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }"
      >
        <span :style="node.locked ? { opacity: 0.5, pointerEvents: 'none' } : undefined">
          <AlxToggle :model-value="node.checked" @update:model-value="emit('toggle', node.id, $event)" />
        </span>
        <span style="font-size: 13px; color: var(--text-main)">{{ node.label }}</span>
        <span style="font-size: 12px; color: var(--text-sub)">
          {{ node.id === 'game' ? props.gameLabel : node.description }}
        </span>
      </div>
      <ExportTree
        v-if="node.children"
        :nodes="node.children"
        :depth="props.depth + 1"
        :game-label="props.gameLabel"
        @toggle="(id, checked) => emit('toggle', id, checked)"
      />
    </div>
  </template>
</template>
