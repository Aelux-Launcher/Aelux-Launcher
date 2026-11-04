<script setup lang="ts">
/** 开关（设计稿 toggle 规格：36×20，滑块位移 16px）。 */
const model = defineModel<boolean>({ default: false })
</script>

<template>
  <button
    type="button"
    :class="['toggle', model ? 'on' : '']"
    role="switch"
    :aria-checked="model"
    @click="model = !model"
  />
</template>
