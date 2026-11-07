<script setup lang="ts">
/**
 * 通用加载态：旋转圆环 + 文案。
 * 用于下载页版本清单 / 社区资源检索等需要「像 PCL 一样」明显反馈的区块。
 */
withDefaults(defineProps<{ text?: string }>(), { text: '正在加载…' })
</script>

<template>
  <div class="alx-loading" role="status" aria-live="polite">
    <span class="alx-loading-ring" />
    <span class="alx-loading-text">{{ text }}</span>
  </div>
</template>
