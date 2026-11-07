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

      <!-- 搜索无命中 -->
      <div v-if="!hit" class="empty-state help-search-empty">
        <AlxIcon name="search" :size="32" />
        <div>没有匹配的内容。</div>
      </div>

      <!-- 正文卡片 -->
      <template v-else>
        <div class="help-article">
          <div class="help-article-head">
            <span class="tag">{{ entry.group }}</span>
          </div>

          <p v-for="(p, i) in entry.paragraphs" :key="i" class="help-paragraph">
            {{ p }}
          </p>

          <!-- 相关链接 -->
          <div v-if="entry.links && entry.links.length > 0" class="help-links">
            <button
              v-for="l in entry.links"
              :key="l.url"
              type="button"
              class="btn-download btn-ghost help-link"
              @click="openLink(l.url)"
            >
              <AlxIcon name="external" :size="13" />
              <span>{{ l.label }}</span>
            </button>
          </div>
        </div>

        <!-- 返回帮助列表 -->
        <div class="help-back">
          <button type="button" class="btn-download btn-ghost" @click="store.pageBack()">
            返回帮助列表
          </button>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.help-article {
  margin-top: 16px;
  padding: 20px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-color);
}
.help-article-head {
  display: flex;
  margin-bottom: 14px;
}
.help-paragraph {
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-main);
}
.help-paragraph:last-of-type {
  margin-bottom: 0;
}
.help-links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--border-light);
}
.help-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
}
.help-back {
  display: flex;
  justify-content: center;
  margin-top: 24px;
}
.help-search-empty {
  margin-top: 16px;
}
</style>
