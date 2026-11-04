<script setup lang="ts">
import { computed } from 'vue'
import { ICONS } from './icons'

const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 15 })
const def = computed(() => ICONS[props.name as keyof typeof ICONS] ?? { vb: '0 0 15 15', body: '' })
</script>

<template>
  <svg
    :width="props.size"
    :height="props.size"
    :viewBox="def.vb"
    fill="none"
    aria-hidden="true"
    v-html="def.body"
  />
</template>
