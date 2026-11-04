<script setup lang="ts">
/**
 * 帮助详情（副页面）：从「更多 → 帮助」的折叠条目进入。
 *
 * props 契约不变：entryId 定位条目，title 用作条目缺失时的兜底标题。
 * 正文支持页内搜索（命中标题或任一段落），相关链接经内核 open_external 打开。
 */
import { computed, ref, watch } from 'vue'
import { useAppStore } from '../stores/app'
import { call } from '../lib/bridge'
import AlxIcon from '../components/AlxIcon.vue'
import AlxSearchBar from '../components/AlxSearchBar.vue'
import PageHeader from '../components/PageHeader.vue'
import { findHelpEntry } from './helpEntries'

const props = defineProps<{
  entryId: string
  title: string
}>()

const store = useAppStore()

/** 当前条目。 */
const entry = computed(() => findHelpEntry(props.entryId))

/** 页内搜索词（切换条目时清空）。 */
const query = ref('')

watch(
  () => props.entryId,
  () => {
    query.value = ''
  },
)

const q = computed(() => query.value.trim())

/** 页内搜索：命中标题或任一正文段落即视为匹配。 */
const hit = computed(() => {
  const e = entry.value
  if (!e) return false
  return !q.value || e.title.includes(q.value) || e.paragraphs.some((p) => p.includes(q.value))
})

/** 打开条目里的相关链接。 */
function openLink(url: string) {
  void call('open_external', { url })
}
</script>

<template>
  <div class="page-view active sub-page">
    <!-- 条目不存在：兜底提示（标题用 props.title） -->
    <template v-if="!entry">
      <PageHeader :title="title" />
      <div class="empty-state">
        <AlxIcon name="help-circle" :size="32" />
        <div>没有找到这条帮助内容，它可能已经被移动或删除。</div>
      </div>
    </template>

    <template v-else>
      <PageHeader :title="entry.title">
        <AlxSearchBar v-model="query" placeholder="在本文中搜索" />
      </PageHeader>

      <span class="tag">{{ entry.group }}</span>

      <!-- 搜索无命中 -->
      <div v-if="!hit" class="empty-state">
        <AlxIcon name="search" :size="32" />
        <div>没有匹配的内容。</div>
      </div>

      <!-- 正文段落 -->
      <template v-else>
        <div style="margin-top: 16px">
          <p
            v-for="(p, i) in entry.paragraphs"
            :key="i"
            :style="{ margin: '0 0 12px', fontSize: '14px', lineHeight: '1.8', color: 'var(--text-main)' }"
          >
            {{ p }}
          </p>
        </div>

        <!-- 相关链接 -->
        <div
          v-if="entry.links && entry.links.length > 0"
          style="display: flex; gap: 10px; margin-top: 8px; flex-wrap: wrap"
        >
          <button
            v-for="l in entry.links"
            :key="l.url"
            type="button"
            class="btn-download btn-ghost"
            @click="openLink(l.url)"
          >
            <AlxIcon name="external" :size="13" />
            <span style="margin-left: 6px">{{ l.label }}</span>
          </button>
        </div>
      </template>

      <!-- 返回帮助列表 -->
      <div style="display: flex; justify-content: center; margin-top: 32px">
        <button type="button" class="btn-download btn-ghost" @click="store.pageBack()">
          返回帮助列表
        </button>
      </div>
    </template>
  </div>
</template>
