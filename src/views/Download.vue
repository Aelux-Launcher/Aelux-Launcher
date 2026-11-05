<script setup lang="ts">
/**
 * 下载页（极简黑白设计稿）：
 *   每个分类一个视图，结构统一 = PageHeader（标题 + 搜索栏）+ 内容列表。
 *   cat 由外壳路由参数传入（original / modpack / mod / world / resourcepack / datapack / shader）：
 *     · original：版本清单列表，本地过滤 + 一键安装（安装中 / 已安装态）。
 *     · 其余六类：Modrinth 社区资源检索，点击条目进详情副页面。
 * 业务动作全部走 store；进入社区资源分类时自动切类型并检索。
 */
import { computed, ref, watch } from 'vue'
import type { ResourceKind, ResourceProject } from '../lib/types'
import { useAppStore } from '../stores/app'
import { toast } from '../lib/toast'
import PageHeader from '../components/PageHeader.vue'
import AlxSearchBar from '../components/AlxSearchBar.vue'
import AlxIcon from '../components/AlxIcon.vue'

/** 分类 → 页头标题（与侧栏文案一致） */
const CAT_TITLE: Record<string, string> = {
  original: '原版游戏下载',
  modpack: '整合包',
  mod: '模组',
  world: '世界',
  resourcepack: '资源包',
  datapack: '数据包',
  shader: '光影包',
}

/** 社区资源分类 → 列表图标（与侧栏一致，见 icons.ts） */
const CAT_ICON: Record<string, string> = {
  modpack: 'package',
  mod: 'tool',
  world: 'globe',
  resourcepack: 'image',
  datapack: 'package',
  shader: 'sun',
}

const props = defineProps<{ cat: string }>()

const store = useAppStore()

/* ------------------------------- 原版游戏 ------------------------------- */

/** 版本号本地过滤关键字（不进 store，仅作用于本列表） */
const versionKeyword = ref('')

/** 搜索态：非空时分组全部展开 */
const hasKeyword = computed(() => Boolean(versionKeyword.value.trim()))

/** ISO 时间 → `2026/09/15 19:23` */
function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '未知'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 愚人节版本 id（小写比对）：Mojang 清单中它们混在 release/snapshot 里，需单独归组 */
const APRIL_FOOLS = new Set([
  '2.0',
  '2.0-red',
  '2.0-blue',
  '1.rv-pre1',
  '15w14a',
  '3d shareware v1.34',
  '20w14infinite',
  '24w14potato',
  '25w14craftmine',
])

/** 最新正式版 / 最新预览版（清单按时间倒序，取同类第一个） */
const latestRelease = computed(() => store.versions.find((v) => v.kind === 'release'))
const latestSnapshot = computed(() => store.versions.find((v) => v.kind === 'snapshot'))

/** 分类折叠组定义（key → 归组规则） */
const GROUP_DEFS: Array<{ key: string; title: string; match: (v: { id: string; kind: string }) => boolean }> = [
  {
    key: 'release',
    title: '正式版',
    match: (v) => v.kind === 'release' && !APRIL_FOOLS.has(v.id.toLowerCase()),
  },
  {
    key: 'snapshot',
    title: '预览版',
    match: (v) => v.kind === 'snapshot' && !APRIL_FOOLS.has(v.id.toLowerCase()),
  },
  {
    key: 'legacy',
    title: '远古版',
    match: (v) => v.kind === 'old_beta' || v.kind === 'old_alpha',
  },
  {
    key: 'april',
    title: '愚人节版',
    match: (v) => APRIL_FOOLS.has(v.id.toLowerCase()),
  },
]

/** 折叠组展开状态（默认全部收起；搜索时强制展开） */
const expandedGroups = ref(new Set<string>())

function isGroupOpen(key: string): boolean {
  return hasKeyword.value || expandedGroups.value.has(key)
}

function toggleGroup(key: string) {
  if (hasKeyword.value) return
  const s = expandedGroups.value
  if (s.has(key)) s.delete(key)
  else s.add(key)
}

/** 四个分组 + 关键字过滤后的结果 */
const versionGroups = computed(() => {
  const kw = versionKeyword.value.trim().toLowerCase()
  return GROUP_DEFS.map((g) => ({
    key: g.key,
    title: g.title,
    items: store.versions.filter((v) => g.match(v) && (!kw || v.id.toLowerCase().includes(kw))),
  }))
})

/** 搜索命中总数（0 时显示空态） */
const matchCount = computed(() => versionGroups.value.reduce((n, g) => n + g.items.length, 0))

/** 该版本是否已有同名实例（实例的 version 与版本 id 一致即视为已安装） */
function isInstalled(id: string): boolean {
  return store.instances.some((i) => i.version === id)
}

/** 安装版本（沿用旧版反馈：成功 / 失败 toast） */
async function handleInstall(id: string) {
  await store.installVersion(id)
  const err = store.installError
  if (err) toast.error(`安装失败：${err}`)
  else toast.success(`已安装 ${id}，可在「启动」页一键启动`)
}

/* ------------------------------ 社区资源 ------------------------------ */

/** 当前分类是否为社区资源（原版之外全部走 Modrinth 检索，按 cat 切换内容） */
const isResource = computed(() => props.cat !== 'original')

/** 名称筛选：直接转发 store 的查询（getter/setter 计算属性，沿用旧版） */
const keyword = computed({
  get: () => store.resourceQuery.name,
  set: (v) => store.setResourceQuery({ name: v }),
})

/** 回车触发检索 */
function runSearch() {
  void store.searchResources()
}

// 进入分类时同步资源类型并检索（setResourceKind 会清空旧结果，避免串类）。
watch(
  () => props.cat,
  (c) => {
    if (c === 'original') return
    store.setResourceKind(c as ResourceKind)
    void store.searchResources()
  },
  { immediate: true },
)

/** 下载量格式化（1234 → 1.2k / 23456 → 23.5k / 1234567 → 1.2M） */
function formatDownloads(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return String(n)
}

/** 条目副文本：`作者: xxx · 下载量: 1.2k` */
function projectDesc(p: ResourceProject): string {
  return `作者: ${p.author ?? '未知'} · 下载量: ${formatDownloads(p.downloads)}`
}

/** 图标加载失败的条目（回退为分类图标，避免破图） */
const failedIcons = ref(new Set<string>())

/** 点击条目 → 资源详情副页面 */
function openResource(p: ResourceProject) {
  store.openSubPage({
    kind: 'resource',
    resourceKind: props.cat as ResourceKind,
    projectId: p.projectId,
    title: p.title,
  })
}

/** 右侧下载按钮：内核下载管理就绪前给出提示 */
function onResourceDownload() {
  toast.info('资源下载将在内核下载管理就绪后开放')
}
</script>

<template>
  <div class="page-view active sub-page">
    <!-- ============ 原版游戏下载 ============ -->
    <template v-if="!isResource">
      <PageHeader title="原版游戏下载">
        <AlxSearchBar v-model="versionKeyword" placeholder="搜索版本号..." />
      </PageHeader>

      <!-- 版本清单加载中 -->
      <div v-if="store.versionsLoading" class="loading-hint">
        正在从版本清单源拉取可下载版本…
      </div>

      <!-- 版本清单加载失败 -->
      <div v-else-if="store.versionsError" class="empty-state">
        <AlxIcon name="alert-circle" :size="32" />
        <div>版本清单加载失败：{{ store.versionsError }}</div>
      </div>

      <template v-else>
        <!-- 最新版本卡片 -->
        <div v-if="latestRelease || latestSnapshot" class="version-card">
          <div class="version-card-title">最新版本</div>
          <template v-if="latestRelease">
            <div class="list-item version-latest-item">
              <div class="item-left">
                <div class="item-icon">
                  <AlxIcon name="columns" :size="20" />
                </div>
                <div class="item-info">
                  <div class="item-title">{{ latestRelease.id }}</div>
                  <div class="item-desc">最新正式版，发布于 {{ formatDateTime(latestRelease.releaseTime) }}</div>
                </div>
              </div>
              <div class="item-right">
                <button
                  type="button"
                  class="icon-btn"
                  :disabled="isInstalled(latestRelease.id) || store.installing !== null"
                  :title="isInstalled(latestRelease.id) ? '已安装' : '安装'"
                  @click="handleInstall(latestRelease.id)"
                >
                  <AlxIcon :name="isInstalled(latestRelease.id) ? 'check' : 'download'" :size="18" />
                </button>
              </div>
            </div>
          </template>
          <template v-if="latestSnapshot">
            <div class="list-item version-latest-item">
              <div class="item-left">
                <div class="item-icon">
                  <AlxIcon name="columns" :size="20" />
                </div>
                <div class="item-info">
                  <div class="item-title">{{ latestSnapshot.id }}</div>
                  <div class="item-desc">最新预览版，发布于 {{ formatDateTime(latestSnapshot.releaseTime) }}</div>
                </div>
              </div>
              <div class="item-right">
                <button
                  type="button"
                  class="icon-btn"
                  :disabled="isInstalled(latestSnapshot.id) || store.installing !== null"
                  :title="isInstalled(latestSnapshot.id) ? '已安装' : '安装'"
                  @click="handleInstall(latestSnapshot.id)"
                >
                  <AlxIcon :name="isInstalled(latestSnapshot.id) ? 'check' : 'download'" :size="18" />
                </button>
              </div>
            </div>
          </template>
        </div>

        <!-- 分类折叠卡片 -->
        <div
          v-for="g in versionGroups"
          :key="g.key"
          class="version-card version-group"
          :class="{ open: isGroupOpen(g.key) }"
        >
          <button type="button" class="version-group-header" @click="toggleGroup(g.key)">
            <span>{{ g.title }}</span>
            <AlxIcon name="chevron-down" :size="18" class="version-group-chevron" />
          </button>
          <div v-if="isGroupOpen(g.key)" class="version-group-body">
            <div v-for="v in g.items" :key="v.id" class="list-item">
              <div class="item-left">
                <div class="item-icon">
                  <AlxIcon name="columns" :size="20" />
                </div>
                <div class="item-info">
                  <div class="item-title">{{ v.id }}</div>
                  <div class="item-desc">发布于 {{ formatDateTime(v.releaseTime) }}</div>
                </div>
              </div>
              <div class="item-right">
                <button
                  type="button"
                  class="btn-download"
                  :class="isInstalled(v.id) ? 'btn-ghost' : ''"
                  :disabled="isInstalled(v.id) || store.installing !== null"
                  @click="handleInstall(v.id)"
                >
                  {{ store.installing === v.id ? '安装中' : isInstalled(v.id) ? '已安装' : '安装' }}
                </button>
              </div>
            </div>
            <div v-if="g.items.length === 0" class="version-group-empty">
              {{ hasKeyword ? `没有匹配「${versionKeyword.trim()}」的版本` : '暂无版本' }}
            </div>
          </div>
        </div>

        <!-- 搜索无任何命中 -->
        <div v-if="hasKeyword && matchCount === 0" class="empty-state">
          <AlxIcon name="search" :size="32" />
          <div>没有匹配「{{ versionKeyword.trim() }}」的版本</div>
        </div>
      </template>
    </template>

    <!-- ============ 社区资源（整合包 / 模组 / 世界 / 资源包 / 数据包 / 光影包） ============ -->
    <template v-else>
      <PageHeader :title="CAT_TITLE[cat] ?? cat">
        <AlxSearchBar
          v-model="keyword"
          :placeholder="`搜索${CAT_TITLE[cat] ?? '资源'}...`"
          @search="runSearch"
        />
      </PageHeader>

      <!-- 检索中 -->
      <div v-if="store.resourceLoading" class="loading-hint">正在搜索社区资源…</div>

      <!-- 检索失败 -->
      <div v-else-if="store.resourceError" class="empty-state">
        <AlxIcon name="alert-circle" :size="32" />
        <div>暂时无法连接到社区资源源，请检查网络后重试</div>
        <div>错误详情：{{ store.resourceError }}</div>
      </div>

      <!-- 无结果 -->
      <div v-else-if="store.resourceProjects.length === 0" class="empty-state">
        <AlxIcon name="search" :size="32" />
        <div>没有找到相关资源</div>
      </div>

      <!-- 资源列表 -->
      <template v-else>
        <div
          v-for="p in store.resourceProjects"
          :key="p.projectId"
          class="list-item list-clickable"
          @click="openResource(p)"
        >
          <div class="item-left">
            <div class="item-icon">
              <!-- 有缩略图用图片，加载失败回退为分类图标 -->
              <img
                v-if="p.iconUrl && !failedIcons.has(p.projectId)"
                :src="p.iconUrl"
                :alt="p.title"
                @error="failedIcons.add(p.projectId)"
              />
              <AlxIcon v-else :name="CAT_ICON[cat] ?? 'package'" :size="20" />
            </div>
            <div class="item-info">
              <div class="item-title">{{ p.title }}</div>
              <div class="item-desc">{{ projectDesc(p) }}</div>
            </div>
          </div>
          <div class="item-right">
            <button type="button" class="btn-download" @click.stop="onResourceDownload">下载</button>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
