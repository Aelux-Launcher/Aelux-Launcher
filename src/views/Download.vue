<script setup lang="ts">
/**
 * 下载页（极简黑白主题）：
 *   cat 由外壳路由参数传入（original / modpack / mod / world / resourcepack / datapack / shader）。
 *     · original：版本清单列表（页头搜索 + 分组折叠 + 一键进入版本详情）。
 *     · 其余六类：Modrinth 社区资源检索（PCL 式筛选卡片 + 分页 + 详情副页面）。
 * 布局与交互参考 PCL2 的 PageDownload / PageResource：
 *   名称 / 来源 / 游戏版本 / 加载器 / 类型 → 检索 → 结果列表 → 翻页。
 */
import { computed, ref, watch } from 'vue'
import type { ResourceKind, ResourceProject } from '../lib/types'
import { useAppStore } from '../stores/app'
import { toast } from '../lib/toast'
import { categoryLabel, formatDownloads } from '../lib/modrinth'
import { latestMcVersion } from '../lib/mcVersion'
import PageHeader from '../components/PageHeader.vue'
import AlxSearchBar from '../components/AlxSearchBar.vue'
import AlxIcon from '../components/AlxIcon.vue'
import VersionRowActions from '../components/VersionRowActions.vue'

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

/** 加载器筛选选项（PCL 的「加载器」行；无意义的类型不展示该行）。 */
const LOADER_OPTIONS: Partial<Record<ResourceKind, string[]>> = {
  mod: ['fabric', 'forge', 'neoforge', 'quilt'],
  modpack: ['fabric', 'forge', 'neoforge', 'quilt'],
  shader: ['iris', 'optifine', 'canvas'],
}

const LOADER_LABELS: Record<string, string> = {
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  quilt: 'Quilt',
  iris: 'Iris',
  optifine: 'OptiFine',
  canvas: 'Canvas',
}

const props = defineProps<{ cat: string }>()

const store = useAppStore()

/* ------------------------------- 原版游戏 ------------------------------- */

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

/** 页头版本搜索（本地过滤；空串 = 全部） */
const versionKeyword = ref('')

/** 折叠组展开状态（默认展开正式版，避免首屏空荡） */
const expandedGroups = ref(new Set<string>(['release']))

function isGroupOpen(key: string): boolean {
  return expandedGroups.value.has(key)
}

function toggleGroup(key: string) {
  const next = new Set(expandedGroups.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedGroups.value = next
}

/** 带关键词过滤的分组 */
const versionGroups = computed(() => {
  const keyword = versionKeyword.value.trim().toLowerCase()
  const source = keyword
    ? store.versions.filter((v) => v.id.toLowerCase().includes(keyword))
    : store.versions
  return GROUP_DEFS.map((g) => ({
    key: g.key,
    title: g.title,
    items: source.filter((v) => g.match(v)),
  }))
})

/** 关键词命中的版本总数（用于空状态） */
const matchedVersionCount = computed(() =>
  versionGroups.value.reduce((sum, g) => sum + g.items.length, 0),
)

/** 搜索时自动展开所有有结果的组（清空后保留当前展开状态） */
watch(versionKeyword, (keyword) => {
  if (!keyword.trim()) return
  expandedGroups.value = new Set(versionGroups.value.filter((g) => g.items.length > 0).map((g) => g.key))
})

/** 该版本是否已安装（用于列表里的「已安装」标签） */
function isInstalled(id: string): boolean {
  return store.instances.some((i) => i.version === id)
}

/** 刷新版本清单（页头右侧按钮） */
async function refreshVersions() {
  await store.loadVersions()
  if (store.versionsError) toast.error(`版本清单刷新失败：${store.versionsError}`)
  else toast.success('版本清单已刷新')
}

/** 点击版本行 → 进入版本详情页（加载器选择 + 开始下载）。 */
function openVersionPage(id: string) {
  store.openSubPage({ kind: 'version', versionId: id })
}

/* ------------------------------ 社区资源 ------------------------------ */

/** 当前分类是否为社区资源（原版之外全部走 Modrinth 检索，按 cat 切换内容） */
const isResource = computed(() => props.cat !== 'original')

const currentKind = computed(() => props.cat as ResourceKind)

/** 名称筛选：转发 store 查询（getter/setter 计算属性） */
const keyword = computed({
  get: () => store.resourceQuery.name,
  set: (v) => store.setResourceQuery({ name: v }),
})

/** 游戏版本筛选 */
const gameVersion = computed({
  get: () => store.resourceQuery.gameVersion,
  set: (v) => store.setResourceQuery({ gameVersion: v }),
})

/** 加载器筛选 */
const loader = computed({
  get: () => store.resourceQuery.loader,
  set: (v) => store.setResourceQuery({ loader: v }),
})

/** 类型（分类标签）筛选 */
const category = computed({
  get: () => store.resourceQuery.category,
  set: (v) => store.setResourceQuery({ category: v }),
})

/** 当前类型可用的加载器选项 */
const loaderOptions = computed(() => LOADER_OPTIONS[currentKind.value] ?? [])

/** 当前类型可用的分类标签（Modrinth /tag/category） */
const categoryOptions = computed(() => store.resourceTags[currentKind.value] ?? [])

/** 页头版本输入建议（版本清单前 80 项） */
const versionSuggestions = computed(() => store.versions.slice(0, 80).map((v) => v.id))

/** 是否有筛选条件（用于重置按钮与空状态） */
const hasActiveFilters = computed(
  () =>
    Boolean(store.resourceQuery.name.trim()) ||
    Boolean(store.resourceQuery.gameVersion.trim()) ||
    Boolean(store.resourceQuery.loader) ||
    Boolean(store.resourceQuery.category),
)

/** 执行检索（筛选条件变更 / 回车 / 搜索按钮共用） */
function applyFilters() {
  void store.searchResources()
}

/** 重置条件后立即检索 */
function resetFilters() {
  store.resetResourceFilters()
  void store.searchResources()
}

/** 进入分类时同步资源类型、标签与结果（setResourceKind 会清空旧结果，避免串类）。 */
watch(
  () => props.cat,
  (c) => {
    if (c === 'original') return
    store.setResourceKind(c as ResourceKind)
    void store.loadResourceTags()
    void store.searchResources()
  },
  { immediate: true },
)

/** ISO 时间 → `2026/10/28` */
function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '未知'
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

/** 条目副文本：支持的游戏版本范围 */
function projectVersionSummary(p: ResourceProject): string {
  const list = p.versions ?? []
  if (list.length === 0) return ''
  const latest = latestMcVersion(list)
  return list.length > 1 ? `${latest} 等 ${list.length} 个版本` : latest
}

/** 条目标签：取分类 slug 的前三个（中文文案） */
function projectTags(p: ResourceProject): string[] {
  const unique: string[] = []
  for (const c of p.categories) {
    if (!unique.includes(c)) unique.push(c)
  }
  return unique.slice(0, 3)
}

/** 点击条目上的标签 → 直接按该类型筛选 */
function filterByCategory(slug: string) {
  category.value = slug
  applyFilters()
}

/** 图标加载失败的条目（回退为分类图标，避免破图） */
const failedIcons = ref(new Set<string>())

function markIconFailed(id: string) {
  const next = new Set(failedIcons.value)
  next.add(id)
  failedIcons.value = next
}

/** 点击条目 → 资源详情副页面（把当前筛选条件带过去，PCL 同款预设） */
function openResource(p: ResourceProject) {
  store.openSubPage({
    kind: 'resource',
    resourceKind: currentKind.value,
    projectId: p.projectId,
    title: p.title,
    gameVersion: store.resourceQuery.gameVersion.trim() || undefined,
    loader: store.resourceQuery.loader || undefined,
  })
}

/** 分页信息 */
const totalPages = computed(() => Math.max(1, Math.ceil(store.resourceTotal / store.resourcePageSize)))
const currentPage = computed(() => Math.min(store.resourcePage, totalPages.value - 1))
const canPrev = computed(() => currentPage.value > 0)
const canNext = computed(() => currentPage.value + 1 < totalPages.value)

function goPage(page: number) {
  store.setResourcePage(page)
}

/** 加载失败重试 */
function retrySearch() {
  void store.searchResources()
}
</script>

<template>
  <div class="page-view active sub-page">
    <!-- ============ 原版游戏下载 ============ -->
    <template v-if="!isResource">
      <PageHeader title="原版游戏下载">
        <AlxSearchBar v-model="versionKeyword" placeholder="搜索版本号（如 1.21.4）" />
        <button
          type="button"
          class="icon-btn"
          title="刷新版本清单"
          :disabled="store.versionsLoading"
          @click="refreshVersions"
        >
          <AlxIcon name="refresh" :size="17" />
        </button>
      </PageHeader>

      <!-- 版本清单加载中 -->
      <div v-if="store.versionsLoading" class="loading-hint">
        正在从版本清单源拉取可下载版本…
      </div>

      <!-- 版本清单加载失败 -->
      <div v-else-if="store.versionsError" class="empty-state">
        <AlxIcon name="alert-circle" :size="32" />
        <div>版本清单加载失败：{{ store.versionsError }}</div>
        <button type="button" class="btn-download btn-ghost" @click="refreshVersions">重试</button>
      </div>

      <template v-else>
        <!-- 最新版本卡片（搜索时让位给结果列表） -->
        <div v-if="!versionKeyword.trim() && (latestRelease || latestSnapshot)" class="version-card">
          <div class="version-card-title">最新版本</div>
          <div
            v-if="latestRelease"
            class="list-item list-clickable version-row"
            @click="openVersionPage(latestRelease.id)"
          >
            <div class="item-left">
              <div class="item-icon">
                <AlxIcon name="columns" :size="20" />
              </div>
              <div class="item-info">
                <div class="item-title">
                  {{ latestRelease.id }}
                  <span class="tag">推荐</span>
                  <span v-if="isInstalled(latestRelease.id)" class="tag">已安装</span>
                </div>
                <div class="item-desc">最新正式版，发布于 {{ formatDateTime(latestRelease.releaseTime) }}</div>
              </div>
            </div>
            <VersionRowActions :version-id="latestRelease.id" />
          </div>
          <div
            v-if="latestSnapshot"
            class="list-item list-clickable version-row"
            @click="openVersionPage(latestSnapshot.id)"
          >
            <div class="item-left">
              <div class="item-icon">
                <AlxIcon name="columns" :size="20" />
              </div>
              <div class="item-info">
                <div class="item-title">
                  {{ latestSnapshot.id }}
                  <span class="tag">预览</span>
                  <span v-if="isInstalled(latestSnapshot.id)" class="tag">已安装</span>
                </div>
                <div class="item-desc">最新预览版，发布于 {{ formatDateTime(latestSnapshot.releaseTime) }}</div>
              </div>
            </div>
            <VersionRowActions :version-id="latestSnapshot.id" />
          </div>
        </div>

        <!-- 分类折叠卡片 -->
        <div
          v-for="g in versionGroups"
          :key="g.key"
          class="version-card version-group"
          :class="{ open: isGroupOpen(g.key) }"
        >
          <button type="button" class="version-group-header" @click="toggleGroup(g.key)">
            <span class="version-group-title">
              {{ g.title }}
              <span class="version-group-count">{{ g.items.length }}</span>
            </span>
            <AlxIcon name="chevron-down" :size="18" class="version-group-chevron" />
          </button>
          <div class="version-group-body">
            <div class="version-group-inner" :inert="isGroupOpen(g.key) ? undefined : true">
              <div
                v-for="v in g.items"
                :key="v.id"
                class="list-item list-clickable version-row"
                @click="openVersionPage(v.id)"
              >
                <div class="item-left">
                  <div class="item-icon">
                    <AlxIcon name="columns" :size="20" />
                  </div>
                  <div class="item-info">
                    <div class="item-title">
                      {{ v.id }}
                      <span v-if="isInstalled(v.id)" class="tag">已安装</span>
                    </div>
                    <div class="item-desc">发布于 {{ formatDateTime(v.releaseTime) }}</div>
                  </div>
                </div>
                <VersionRowActions :version-id="v.id" />
              </div>
              <div v-if="g.items.length === 0" class="version-group-empty">暂无版本</div>
            </div>
          </div>
        </div>

        <!-- 搜索无结果 -->
        <div v-if="matchedVersionCount === 0 && versionKeyword.trim()" class="empty-state">
          <AlxIcon name="search" :size="32" />
          <div>没有找到包含「{{ versionKeyword.trim() }}」的版本</div>
          <button type="button" class="btn-download btn-ghost" @click="versionKeyword = ''">清空搜索</button>
        </div>
        <div v-else-if="store.versions.length === 0" class="empty-state">
          <AlxIcon name="info" :size="32" />
          <div>版本清单为空，请稍后重试。</div>
        </div>
      </template>
    </template>

    <!-- ============ 社区资源（整合包 / 模组 / 世界 / 资源包 / 数据包 / 光影包） ============ -->
    <template v-else>
      <PageHeader :title="CAT_TITLE[cat] ?? cat" />

      <!-- PCL 式筛选卡片：名称 / 游戏版本 / 加载器 / 类型 -->
      <section class="resource-search-card">
        <div class="resource-filter-row">
          <div class="filter-field filter-field-name">
            <span class="filter-label">名称</span>
            <div class="filter-input-wrap">
              <AlxIcon name="search" :size="15" />
              <input
                v-model="keyword"
                type="text"
                :placeholder="`搜索${CAT_TITLE[cat] ?? '资源'}...`"
                @change="applyFilters"
              />
            </div>
          </div>
          <button
            type="button"
            class="btn-download search-submit"
            :disabled="store.resourceLoading"
            @click="applyFilters"
          >
            搜索
          </button>
        </div>

        <div class="resource-filter-row">
          <div class="filter-field">
            <span class="filter-label">游戏版本</span>
            <input
              v-model="gameVersion"
              class="filter-control"
              type="text"
              list="mc-version-options"
              placeholder="全部版本"
              @change="applyFilters"
            />
          </div>
          <div v-if="loaderOptions.length" class="filter-field">
            <span class="filter-label">加载器</span>
            <select v-model="loader" class="filter-control" @change="applyFilters">
              <option value="">任意加载器</option>
              <option v-for="l in loaderOptions" :key="l" :value="l">{{ LOADER_LABELS[l] ?? l }}</option>
            </select>
          </div>
          <div v-if="categoryOptions.length" class="filter-field">
            <span class="filter-label">类型</span>
            <select v-model="category" class="filter-control" @change="applyFilters">
              <option value="">全部类型</option>
              <option v-for="c in categoryOptions" :key="c.slug" :value="c.slug">{{ c.label }}</option>
            </select>
          </div>
          <div class="filter-actions">
            <button
              type="button"
              class="btn-download btn-ghost"
              :disabled="!hasActiveFilters || store.resourceLoading"
              @click="resetFilters"
            >
              重置条件
            </button>
          </div>
        </div>

        <div class="resource-filter-foot">
          <span class="resource-filter-source">
            来源：Modrinth<template v-if="store.resourceTotal > 0">
              · 共 {{ store.resourceTotal }} 个结果</template>
          </span>
          <button v-if="cat === 'modpack'" type="button" class="resource-import-btn" @click="store.importModpack()">
            <AlxIcon name="folder" :size="14" />
            <span>安装已有整合包</span>
          </button>
        </div>
      </section>

      <!-- 游戏版本输入建议 -->
      <datalist id="mc-version-options">
        <option v-for="id in versionSuggestions" :key="id" :value="id" />
      </datalist>

      <!-- 检索中：骨架屏 -->
      <div v-if="store.resourceLoading" class="resource-results-card">
        <div v-for="i in 5" :key="i" class="resource-skeleton">
          <div class="skeleton-block skeleton-icon" />
          <div class="resource-skeleton-main">
            <div class="skeleton-block skeleton-title" />
            <div class="skeleton-block skeleton-desc" />
            <div class="skeleton-block skeleton-meta" />
          </div>
        </div>
      </div>

      <!-- 检索失败 -->
      <div v-else-if="store.resourceError" class="resource-state-card">
        <AlxIcon name="alert-circle" :size="28" />
        <div class="resource-state-title">暂时无法连接到社区资源源</div>
        <div class="resource-state-desc">请检查网络后重试。错误详情：{{ store.resourceError }}</div>
        <button type="button" class="btn-download btn-ghost" @click="retrySearch">重试</button>
      </div>

      <!-- 无结果 -->
      <div v-else-if="store.resourceProjects.length === 0" class="resource-state-card">
        <AlxIcon name="search" :size="28" />
        <div class="resource-state-title">没有找到相关资源</div>
        <div class="resource-state-desc">试试更换关键词，或放宽版本 / 加载器 / 类型筛选。</div>
        <button v-if="hasActiveFilters" type="button" class="btn-download btn-ghost" @click="resetFilters">
          清除筛选
        </button>
      </div>

      <!-- 资源结果列表 -->
      <template v-else>
        <div class="resource-results-card">
          <article
            v-for="p in store.resourceProjects"
            :key="p.projectId"
            class="resource-item"
            @click="openResource(p)"
          >
            <div class="resource-item-icon">
              <img
                v-if="p.iconUrl && !failedIcons.has(p.projectId)"
                :src="p.iconUrl"
                :alt="p.title"
                @error="markIconFailed(p.projectId)"
              />
              <AlxIcon v-else :name="CAT_ICON[cat] ?? 'package'" :size="22" />
            </div>

            <div class="resource-item-main">
              <div class="resource-item-head">
                <span class="resource-item-title">{{ p.title }}</span>
                <span v-if="projectTags(p).length" class="resource-item-tags">
                  <button
                    v-for="c in projectTags(p)"
                    :key="c"
                    type="button"
                    class="resource-tag"
                    :title="`按类型「${categoryLabel(c)}」筛选`"
                    @click.stop="filterByCategory(c)"
                  >
                    {{ categoryLabel(c) }}
                  </button>
                </span>
              </div>
              <div class="resource-item-desc">{{ p.description }}</div>
              <div class="resource-item-meta">
                <span class="resource-meta-item">
                  <AlxIcon name="user" :size="12" />
                  {{ p.author ?? '未知作者' }}
                </span>
                <span v-if="projectVersionSummary(p)" class="resource-meta-item">
                  <AlxIcon name="columns" :size="12" />
                  {{ projectVersionSummary(p) }}
                </span>
                <span class="resource-meta-item">
                  <AlxIcon name="download" :size="12" />
                  {{ formatDownloads(p.downloads) }}
                </span>
                <span class="resource-meta-item">
                  <AlxIcon name="clock" :size="12" />
                  {{ formatDate(p.dateModified) }}
                </span>
              </div>
            </div>

            <AlxIcon name="chevron-right" :size="18" class="resource-item-chevron" />
          </article>
        </div>

        <!-- 翻页（PCL 式：首页 / 上一页 / 页码 / 下一页 / 末页） -->
        <div class="resource-pager">
          <button
            type="button"
            class="icon-btn"
            title="第一页"
            :disabled="!canPrev"
            @click="goPage(0)"
          >
            <AlxIcon name="chevrons-left" :size="16" />
          </button>
          <button
            type="button"
            class="icon-btn"
            title="上一页"
            :disabled="!canPrev"
            @click="goPage(currentPage - 1)"
          >
            <AlxIcon name="chevron-left" :size="16" />
          </button>
          <span class="resource-page-info">{{ currentPage + 1 }} / {{ totalPages }}</span>
          <button
            type="button"
            class="icon-btn"
            title="下一页"
            :disabled="!canNext"
            @click="goPage(currentPage + 1)"
          >
            <AlxIcon name="chevron-right" :size="16" />
          </button>
          <button
            type="button"
            class="icon-btn"
            title="最后一页"
            :disabled="!canNext"
            @click="goPage(totalPages - 1)"
          >
            <AlxIcon name="chevrons-right" :size="16" />
          </button>
        </div>
      </template>
    </template>
  </div>
</template>
