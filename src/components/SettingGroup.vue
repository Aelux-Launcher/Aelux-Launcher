<script setup lang="ts">
/**
 * 设置卡片（与版本卡片同款外观），支持折叠：
 *   collapsible=false → 标题不可点击（无法折叠）；
 *   defaultOpen=false → 默认折叠。
 */
import { ref } from 'vue'
import AlxIcon from './AlxIcon.vue'

const props = withDefaults(
  defineProps<{
    title: string
    /** 是否允许折叠；false 时标题只是普通文本。 */
    collapsible?: boolean
    /** 默认是否展开。 */
    defaultOpen?: boolean
  }>(),
  { collapsible: true, defaultOpen: true },
)

const open = ref(props.defaultOpen)
</script>

<template>
  <section class="setting-group">
    <button
      v-if="collapsible"
      type="button"
      class="setting-group-head"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="setting-group-title">{{ title }}</span>
      <AlxIcon name="chevron-down" :size="16" :class="['setting-chevron', open ? 'open' : '']" />
    </button>
    <div v-else class="setting-group-head static">
      <span class="setting-group-title">{{ title }}</span>
    </div>
    <div v-show="open" class="setting-group-body">
      <slot />
    </div>
  </section>
</template>
