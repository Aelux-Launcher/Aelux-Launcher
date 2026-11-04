<script setup lang="ts">
/**
 * 弹窗（theme.css 的 alx-modal 规格：遮罩 + 居中卡片 + 底部操作区插槽）。
 * 点击遮罩或调用方传 @close 关闭；操作按钮放 #actions 插槽。
 */
defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div v-if="open" class="alx-modal" @click.self="emit('close')">
    <div class="alx-modal__box">
      <div class="alx-modal__title">{{ title }}</div>
      <div class="alx-modal__body"><slot /></div>
      <div v-if="$slots.actions" class="alx-modal__actions"><slot name="actions" /></div>
    </div>
  </div>
</template>
