<script setup lang="ts">
/**
 * 版本选择详情页（副页面，极简黑白新版设计）。
 *
 * 列出 Mojang 版本清单（store.versions）中的全部版本，支持搜索过滤与一键安装：
 *   - 已存在同版本实例 → 「已安装」按钮禁用；
 *   - 否则 → 「安装」走 store.installVersion（内核下载管线，进度见任务管理页）。
 * 旧版按加载器分组的实例管理视图已由新设计取代，安装与实例登记逻辑保留在 store。
 */
import { computed, ref } from 'vue'
import { useAppStore } from '../stores/app'
import { toast } from '../lib/toast'
import PageHeader from '../components/PageHeader.vue'
import AlxSearchBar from '../components/AlxSearchBar.vue'
import AlxIcon from '../components/AlxIcon.vue'

const store = useAppStore()

/** 清单版本类型 → 中文名。 */
const KIND_LABEL: Record<string, string> = {
  release: '正式版',
  snapshot: '快照',
  old_beta: 'Beta 旧版',
  old_alpha: 'Alpha 旧版',
}

/** 版本类型 → 中文（未识别类型原样展示）。 */
function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind
}

/** 搜索关键字（按版本 id 过滤）。 */
const keyword = ref('')

/** 过滤后的版本列表（关键字为空时返回全部）。 */
const filteredVersions = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return store.versions
  return store.versions.filter((v) => v.id.toLowerCase().includes(q))
})

/** ISO 时间 → `2026/10/21`（本地时区日期）。 */
function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

/** 该版本是否已安装（存在同版本实例）。 */
function isInstalled(id: string): boolean {
  return store.instances.some((i) => i.version === id)
}

/** 安装版本；期间全部「安装」按钮禁用，结果用 toast 反馈。 */
async function handleInstall(id: string) {
  await store.installVersion(id)
  if (store.installError) {
    toast.error(`安装失败：${store.installError}`)
  } else {
    toast.success(`已安装 ${id}，可在「启动」页一键启动`)
  }
}

/** 版本清单加载失败后重试（loadVersions 内部会先清空错误）。 */
function retryLoad() {
  void store.loadVersions()
}
</script>

<template>
  <div class="page-view active sub-page">
    <PageHeader title="版本选择">
      <span class="tag">共 {{ filteredVersions.length }} 个版本</span>
      <AlxSearchBar v-model="keyword" placeholder="搜索版本号" />
    </PageHeader>

    <!-- 版本清单加载失败 -->
    <div v-if="store.versionsError" class="empty-state">
      <AlxIcon name="alert-circle" :size="32" />
      <span>版本清单加载失败：{{ store.versionsError }}</span>
      <button type="button" class="btn-download btn-ghost" @click="retryLoad">重试</button>
    </div>

    <!-- 清单拉取中 -->
    <div v-else-if="store.versionsLoading" class="loading-hint">正在拉取版本清单…</div>

    <!-- 无匹配版本 -->
    <div v-else-if="filteredVersions.length === 0" class="empty-state">
      <AlxIcon name="search" :size="32" />
      <span>没有匹配「{{ keyword }}」的版本</span>
    </div>

    <!-- 版本列表 -->
    <div v-else>
      <div v-for="v in filteredVersions" :key="v.id" class="list-item">
        <div class="item-left">
          <div class="item-icon"><AlxIcon name="columns" :size="20" /></div>
          <div class="item-info">
            <div class="item-title">Minecraft {{ v.id }}</div>
            <div class="item-desc">
              {{ kindLabel(v.kind) }}<span v-if="fmtDate(v.releaseTime)"> · 发布于 {{ fmtDate(v.releaseTime) }}</span>
            </div>
          </div>
        </div>
        <div class="item-right">
          <button v-if="isInstalled(v.id)" type="button" class="btn-download btn-ghost" disabled>
            已安装
          </button>
          <button
            v-else
            type="button"
            class="btn-download"
            :disabled="store.installing !== null"
            @click="handleInstall(v.id)"
          >
            {{ store.installing === v.id ? '安装中…' : '安装' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
