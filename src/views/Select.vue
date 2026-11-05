<script setup lang="ts">
/**
 * 版本选择页（副页面，PCL 式）：
 *   侧栏 = 文件夹列表（见 SideNav 的子页面板）；本页内容 = 按加载器分组的实例，
 *   跟随侧栏选中的文件夹（当前文件夹显示实例，其余文件夹待内核扫描支持）。
 */
import { computed, ref } from 'vue'
import { useAppStore } from '../stores/app'
import PageHeader from '../components/PageHeader.vue'
import AlxIcon from '../components/AlxIcon.vue'

const store = useAppStore()

/** 清单版本类型 → 中文。 */
const KIND_LABEL: Record<string, string> = {
  release: '正式版',
  snapshot: '快照',
  old_beta: 'Beta 旧版',
  old_alpha: 'Alpha 旧版',
}

const LOADER_ORDER = ['vanilla', 'fabric', 'forge', 'neoforge', 'quilt'] as const

const LOADER_TITLE: Record<(typeof LOADER_ORDER)[number], string> = {
  vanilla: '原版版本',
  fabric: 'Fabric 版本',
  forge: 'Forge 版本',
  neoforge: 'NeoForge 版本',
  quilt: 'Quilt 版本',
}

const LOADER_SHORT: Record<string, string> = {
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  quilt: 'Quilt',
}

/** 按加载器分组的实例（空组隐藏）。 */
const instanceGroups = computed(() =>
  LOADER_ORDER.map((key) => ({
    key,
    title: LOADER_TITLE[key],
    items: store.instances.filter((i) => (i.loader || 'vanilla') === key),
  })).filter((g) => g.items.length > 0),
)

/** 分组折叠状态（默认全部展开，收起后记住）。 */
const collapsedGroups = ref(new Set<string>())

function isGroupOpen(key: string): boolean {
  return !collapsedGroups.value.has(key)
}

function toggleGroup(key: string) {
  const s = collapsedGroups.value
  if (s.has(key)) s.delete(key)
  else s.add(key)
}

/** 实例行副文本：`正式版 1.21.4 · Fabric 0.16.9`。 */
function instanceDesc(instance: { version: string; loader?: string | null; loaderVersion?: string | null }): string {
  const entry = store.versions.find((v) => v.id === instance.version)
  const kind = entry ? (KIND_LABEL[entry.kind] ?? entry.kind) : '未知类型'
  const lv = instance.loaderVersion ? ` · ${LOADER_SHORT[instance.loader ?? ''] ?? ''} ${instance.loaderVersion}`.trim() : ''
  return `${kind} ${instance.version}${lv}`
}

/** 点击实例 → 实例详情页。 */
function openInstance(id: string) {
  store.openSubPage({ kind: 'instance', instanceId: id, tab: 'overall' })
}
</script>

<template>
  <div class="page-view active sub-page">
    <PageHeader title="版本选择" />

    <!-- 非当前文件夹：暂无实例信息（内核扫描接入前） -->
    <div v-if="store.selectedFolderId !== 'current'" class="empty-state">
      <AlxIcon name="folder" :size="32" />
      <div>该文件夹暂无实例信息，扫描已有实例即将开放</div>
    </div>

    <template v-else>
      <div v-if="store.instances.length === 0" class="empty-state">
        <AlxIcon name="info" :size="32" />
        <div>当前文件夹还没有实例，去「下载」页安装一个版本吧</div>
      </div>

      <!-- 实例按加载器分组 -->
      <div
        v-for="g in instanceGroups"
        :key="g.key"
        class="version-card version-group"
        :class="{ open: isGroupOpen(g.key) }"
      >
        <button type="button" class="version-group-header" @click="toggleGroup(g.key)">
          <span>{{ g.title }}（{{ g.items.length }}）</span>
          <AlxIcon name="chevron-down" :size="18" class="version-group-chevron" />
        </button>
        <div class="version-group-body">
          <div class="version-group-inner" :inert="!isGroupOpen(g.key)">
            <div
              v-for="i in g.items"
              :key="i.id"
              class="list-item list-clickable"
              @click="openInstance(i.id)"
            >
              <div class="item-left">
                <div class="item-icon">
                  <AlxIcon name="columns" :size="20" />
                </div>
                <div class="item-info">
                  <div class="item-title">{{ i.name }}</div>
                  <div class="item-desc">{{ instanceDesc(i) }}</div>
                </div>
              </div>
            </div>
            <div v-if="g.items.length === 0" class="version-group-empty">暂无实例</div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
