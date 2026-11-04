<script setup lang="ts">
/** 页头（22px 标题 + 右侧操作区插槽）。 */
defineProps<{ title: string }>()
</script>

<template>
  <div class="page-header">
    <span class="page-title">{{ title }}</span>
    <slot />
  </div>
</template>
