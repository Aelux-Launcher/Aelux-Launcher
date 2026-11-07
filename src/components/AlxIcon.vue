<script setup lang="ts">
import { computed } from 'vue'
import { ICONS, type IconDef } from './icons'

const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 15 })
const def = computed<IconDef>(() => ICONS[props.name as keyof typeof ICONS] ?? { vb: '0 0 15 15', body: '' })
</script>

<template>
  <img
    v-if="def.src"
    :src="def.src"
    :width="props.size"
    :height="props.size"
    alt=""
    aria-hidden="true"
    draggable="false"
    class="alx-icon-img"
  />
  <svg
    v-else
    :width="props.size"
    :height="props.size"
    :viewBox="def.vb"
    fill="none"
    aria-hidden="true"
    v-html="def.body"
  />
</template>

<style scoped>
.alx-icon-img {
  display: block;
  object-fit: contain;
  /* 位图方块素材按像素风放大时保持锐利 */
  image-rendering: pixelated;
  user-select: none;
}
</style>
