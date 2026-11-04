<script setup lang="ts">
/** 搜索栏（设计稿规格：36px 高、灰底、圆角 6）。 */
import AlxIcon from './AlxIcon.vue'

const model = defineModel<string>({ default: '' })
defineProps<{ placeholder?: string }>()
const emit = defineEmits<{ search: [] }>()
</script>

<template>
  <div class="search-bar">
    <AlxIcon name="search" :size="16" />
    <input
      v-model="model"
      type="text"
      :placeholder="placeholder"
      @keydown.enter="emit('search')"
    />
  </div>
</template>
