<script setup lang="ts">
/**
 * 弹窗（theme.css 的 alx-modal 规格：遮罩 + 居中卡片 + 底部操作区插槽）。
 * 点击遮罩或调用方传 @close 关闭；操作按钮放 #actions 插槽。
 */
defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <!-- 弹窗挂到 body：不受页面滚动容器的 overflow 裁剪，始终全局居中 -->
  <Teleport to="body">
    <div v-if="open" class="alx-modal" @click.self="emit('close')">
      <div class="alx-modal__box">
        <div class="alx-modal__title">{{ title }}</div>
        <div class="alx-modal__body"><slot /></div>
        <div v-if="$slots.actions" class="alx-modal__actions"><slot name="actions" /></div>
      </div>
    </div>
  </Teleport>
</template>
