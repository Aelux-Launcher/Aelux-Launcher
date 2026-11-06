<script setup lang="ts">
/**
 * 下载页（极简黑白主题）：
 *   cat 由外壳路由参数传入（original / modpack / mod / world / resourcepack / datapack / shader）。
 *     · original：版本清单列表（分组折叠 + 一键进入版本详情）。
 *     · 其余六类：Modrinth 社区资源检索（PCL 式筛选卡片 + 分页 + 详情副页面）。
 * 布局与交互参考 PCL2 的 PageDownload / PageResource：
 *   名称 / 来源 / 游戏版本 / 加载器 / 类型 → 检索 → 结果列表 → 翻页。
 */
import { computed, ref, watch } from 'vue'
import type { ResourceKind, ResourceProject, ResourceSource } from '../lib/types'
import { useAppStore } from '../stores/app'
import { categoryLabel, formatDownloads, formatRelativeTime, RESOURCE_CATEGORIES } from '../lib/modrinth'
import { oldestMcVersion } from '../lib/mcVersion'
import { call } from '../lib/bridge'
import { toast } from '../lib/toast'
import { ensureMcmod, mcmodInfo } from '../lib/mcmod'
import type { McmodInfo } from '../lib/mcmod'
import AlxIcon from '../components/AlxIcon.vue'
import VersionRowActions from '../components/VersionRowActions.vue'
import { versionIcon, versionRowIcon } from '../lib/versionIcons'

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
  original: 'minecraft',
  modpack: 'package',
  mod: 'puzzle',
  world: 'globe',
  resourcepack: 'shirt',
  datapack: 'grid',
  shader: 'sun',
}

/** 加载器筛选选项（PCL 只在 Mod 页、且选了具体游戏版本时显示该行）。 */
const LOADER_OPTIONS: Partial<Record<ResourceKind, string[]>> = {
  mod: ['forge', 'neoforge', 'fabric', 'quilt'],
}

const LOADER_LABELS: Record<string, string> = {
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  quilt: 'Quilt',
}

/** 下载源选项：全部 / Modrinth / CurseForge。 */
const SOURCE_OPTIONS: Array<{ value: ResourceSource; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'modrinth', label: 'Modrinth' },
  { value: 'curseforge', label: 'CurseForge' },
]

const SOURCE_LABELS: Record<string, string> = {
  all: '全部',
  modrinth: 'Modrinth',
  curseforge: 'CurseForge',
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
    title: '快照版',
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

/** 折叠组展开状态（默认全部折叠，点击分组标题再展开） */
const expandedGroups = ref(new Set<string>())

function isGroupOpen(key: string): boolean {
  return expandedGroups.value.has(key)
}

function toggleGroup(key: string) {
  const next = new Set(expandedGroups.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedGroups.value = next
}

/** 按版本类型分组（正式版 / 预览版 / 远古版 / 愚人节版） */
const versionGroups = computed(() =>
  GROUP_DEFS.map((g) => ({
    key: g.key,
    title: g.title,
    items: store.versions.filter((v) => g.match(v)),
  })),
)

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

/** 当前下载源（全部 / Modrinth / CurseForge）。 */
const source = computed(() => store.resourceQuery.source)

function setSource(event: Event) {
  const value = (event.target as HTMLSelectElement).value as ResourceSource
  store.setResourceQuery({ source: value })
}

/** 列表项来源标签。 */
function sourceLabel(p: ResourceProject): string {
  return SOURCE_LABELS[p.source ?? 'modrinth'] ?? 'Modrinth'
}

/** 当前类型可用的加载器选项 */
const loaderOptions = computed(() => LOADER_OPTIONS[currentKind.value] ?? [])

/** PCL：加载器只在 Mod 页、且已选择具体游戏版本时显示 */
const showLoaderFilter = computed(
  () => currentKind.value === 'mod' && Boolean(store.resourceQuery.gameVersion),
)

/** 当前类型可用的分类标签（PCL 静态列表，中文文案 + Modrinth slug） */
const categoryOptions = computed(() => RESOURCE_CATEGORIES[currentKind.value] ?? [])

/** 游戏版本下拉选项（正式版清单，最新在前；首项是「全部版本」） */
const versionOptions = computed(() =>
  store.versions.filter((v) => v.kind === 'release').map((v) => v.id),
)

/** 世界分类：Modrinth 没有 world 类型，仅展示说明 */
const isWorld = computed(() => currentKind.value === 'world')

/** 是否有筛选条件（用于重置按钮与空状态） */
const hasActiveFilters = computed(
  () =>
    Boolean(store.resourceQuery.name.trim()) ||
    Boolean(store.resourceQuery.gameVersion.trim()) ||
    Boolean(store.resourceQuery.loader) ||
    Boolean(store.resourceQuery.category) ||
    store.resourceQuery.source !== 'all',
)

/** 执行检索（点击「搜索」或名称框回车，PCL 不随输入自动检索） */
function applyFilters() {
  void store.searchResources()
}

/** 重置条件：只清空输入，不自动检索（PCL 行为） */
function resetFilters() {
  store.resetResourceFilters()
}

/** 空状态里的「清除筛选」：清空并重新检索，避免列表停在旧条件 */
function clearFiltersAndSearch() {
  store.resetResourceFilters()
  void store.searchResources()
}

/** 进入分类时同步资源类型与结果（setResourceKind 会清空旧结果，避免串类）。 */
watch(
  () => props.cat,
  (c) => {
    if (c === 'original') return
    store.setResourceKind(c as ResourceKind)
    void store.searchResources()
  },
  { immediate: true },
)

/** 清空游戏版本时同步清空隐藏的加载器条件，避免「看不见但生效」。 */
watch(
  () => store.resourceQuery.gameVersion,
  (v) => {
    if (!v && store.resourceQuery.loader) store.setResourceQuery({ loader: '' })
  },
)

/** 进入分类 / 换页后，为列表项按需补齐 MC百科中文名（不阻塞检索）。 */
watch(
  () => store.resourceProjects,
  (list) => {
    for (const p of list) ensureMcmod(p.title)
  },
  { immediate: true },
)

/** 加载器顺序：运行环境摘要取第一个命中的加载器。 */
const LOADER_ORDER = ['forge', 'neoforge', 'fabric', 'quilt'] as const

/** 运行环境摘要：加载器 + 支持的最低游戏版本（如 `Fabric 1.13+`）。 */
function projectRuntime(p: ResourceProject): string {
  const loader = LOADER_ORDER.find((key) => p.categories.includes(key))
  const oldest = oldestMcVersion(p.versions ?? [])
  return [loader ? (LOADER_LABELS[loader] ?? loader) : '', oldest ? `${oldest}+` : '']
    .filter(Boolean)
    .join(' ')
}

/** 列表显示名：MC百科有中文时「中文 | 英文」，否则保持原名。 */
function projectName(p: ResourceProject): Pick<McmodInfo, 'primary' | 'secondary'> {
  const info = mcmodInfo(p.title)
  return info ?? { primary: p.title }
}

/** 「转到 MC百科」：仅在该项目被 MC百科收录时出现。 */
function openMcmod(p: ResourceProject) {
  const info = mcmodInfo(p.title)
  if (!info?.url) return
  void call('open_external', { url: info.url }).catch(() => toast.error('无法打开 MC百科'))
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

/** 翻页（PCL 只有首页 / 上一页 / 页码 / 下一页四个元素）。 */
const canPrev = computed(() => store.resourcePage > 0)
const canNext = computed(
  () => (store.resourcePage + 1) * store.resourcePageSize < store.resourceTotal,
)

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
      <!-- 版本清单加载中 -->
      <div v-if="store.versionsLoading" class="loading-hint">
        正在从版本清单源拉取可下载版本…
      </div>

      <!-- 版本清单加载失败 -->
      <div v-else-if="store.versionsError" class="empty-state">
        <AlxIcon name="alert-circle" :size="32" />
        <div>版本清单加载失败：{{ store.versionsError }}</div>
        <button type="button" class="btn-download btn-ghost" @click="store.loadVersions()">重试</button>
      </div>

      <template v-else>
        <!-- 最新版本卡片 -->
        <div v-if="latestRelease || latestSnapshot" class="version-card">
          <div class="version-card-title">最新版本</div>
          <div
            v-if="latestRelease"
            class="list-item list-clickable version-row"
            @click="openVersionPage(latestRelease.id)"
          >
            <div class="item-left">
              <div class="item-icon">
                <img :src="versionRowIcon('release')" width="20" height="20" alt="" />
              </div>
              <div class="item-info">
                <div class="item-title">{{ latestRelease.id }}</div>
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
                <img :src="versionRowIcon('snapshot')" width="20" height="20" alt="" />
              </div>
              <div class="item-info">
                <div class="item-title">{{ latestSnapshot.id }}</div>
                <div class="item-desc">最新快照版，发布于 {{ formatDateTime(latestSnapshot.releaseTime) }}</div>
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
              <img
                v-if="versionIcon(g.key)"
                :src="versionIcon(g.key) ?? undefined"
                width="18"
                height="18"
                alt=""
                class="version-group-icon"
              />
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
                    <img :src="versionRowIcon(g.key)" width="20" height="20" alt="" />
                  </div>
                  <div class="item-info">
                    <div class="item-title">{{ v.id }}</div>
                    <div class="item-desc">发布于 {{ formatDateTime(v.releaseTime) }}</div>
                  </div>
                </div>
                <VersionRowActions :version-id="v.id" />
              </div>
              <div v-if="g.items.length === 0" class="version-group-empty">暂无版本</div>
            </div>
          </div>
        </div>

        <div v-if="store.versions.length === 0" class="empty-state">
          <AlxIcon name="info" :size="32" />
          <div>版本清单为空，请稍后重试。</div>
        </div>
      </template>
    </template>

    <!-- ============ 社区资源（整合包 / 模组 / 世界 / 资源包 / 数据包 / 光影包） ============ -->
    <template v-else>
      <!-- 世界：当前源没有 world 类型时（正式链路）展示说明；预览数据可用时正常走列表 -->
      <div
        v-if="isWorld && !store.resourceLoading && store.resourceProjects.length === 0"
        class="resource-state-card"
      >
        <AlxIcon name="globe" :size="28" />
        <div class="resource-state-title">当前下载源暂未提供「世界」类项目</div>
        <div class="resource-state-desc">该分类等待接入支持世界资源的数据源。</div>
      </div>

      <template v-else>
        <!-- PCL 式筛选卡片：名称 + 来源 / 游戏版本 + 加载器 + 类型 / 按钮行 -->
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
                  @keydown.enter="applyFilters"
                />
              </div>
            </div>
            <div class="filter-field filter-field-source">
              <span class="filter-label">来源</span>
              <select class="filter-control" :value="source" @change="setSource">
                <option v-for="s in SOURCE_OPTIONS" :key="s.value" :value="s.value">{{ s.label }}</option>
              </select>
            </div>
          </div>

          <div class="resource-filter-row">
            <div class="filter-field filter-field-version">
              <span class="filter-label">游戏版本</span>
              <select v-model="gameVersion" class="filter-control">
                <option value="">全部版本</option>
                <option v-for="id in versionOptions" :key="id" :value="id">{{ id }}</option>
              </select>
            </div>
            <div v-if="showLoaderFilter" class="filter-field">
              <span class="filter-label">加载器</span>
              <select v-model="loader" class="filter-control">
                <option value="">任意 Mod 加载器</option>
                <option v-for="l in loaderOptions" :key="l" :value="l">{{ LOADER_LABELS[l] ?? l }}</option>
              </select>
            </div>
            <div v-if="categoryOptions.length" class="filter-field">
              <span class="filter-label">类型</span>
              <select v-model="category" class="filter-control">
                <option value="">全部类型</option>
                <option v-for="c in categoryOptions" :key="c.slug" :value="c.slug">{{ c.label }}</option>
              </select>
            </div>
          </div>

          <div class="resource-filter-actions">
            <button
              type="button"
              class="btn-download search-submit"
              :disabled="store.resourceLoading"
              @click="applyFilters"
            >
              搜索
            </button>
            <button type="button" class="btn-download btn-ghost" @click="resetFilters">重置条件</button>
            <button
              v-if="cat === 'modpack'"
              type="button"
              class="btn-download btn-ghost with-icon"
              @click="store.importModpack()"
            >
              <AlxIcon name="folder" :size="14" />
              <span>安装已有整合包</span>
            </button>
          </div>
        </section>

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
          <button v-if="hasActiveFilters" type="button" class="btn-download btn-ghost" @click="clearFiltersAndSearch">
            清除筛选
          </button>
        </div>

        <!-- 资源结果列表（PCL MyResourceItem：标题 + 标签 + 描述 / 版本范围 / 下载量 / 时间 / 来源） -->
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
                <span class="resource-item-title">
                  <span class="resource-title-primary">{{ projectName(p).primary }}</span>
                  <template v-if="projectName(p).secondary">
                    <span class="resource-title-sep">|</span>
                    <span class="resource-title-secondary">{{ projectName(p).secondary }}</span>
                  </template>
                </span>
                <div class="resource-item-sub">
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
                  <span class="resource-item-desc">{{ p.description }}</span>
                </div>
                <div class="resource-item-meta">
                  <span v-if="projectRuntime(p)" class="resource-meta-item">
                    <AlxIcon name="settings" :size="12" />
                    {{ projectRuntime(p) }}
                  </span>
                  <span class="resource-meta-item">
                    <AlxIcon name="download" :size="12" />
                    {{ formatDownloads(p.downloads) }}
                  </span>
                  <span class="resource-meta-item">
                    <AlxIcon name="clock" :size="12" />
                    {{ formatRelativeTime(p.dateModified) }}
                  </span>
                  <span class="resource-meta-item">
                    <AlxIcon name="globe" :size="12" />
                    {{ sourceLabel(p) }}
                  </span>
                  <button
                    v-if="mcmodInfo(p.title)?.url"
                    type="button"
                    class="resource-meta-link"
                    title="转到 MC百科"
                    @click.stop="openMcmod(p)"
                  >
                    <AlxIcon name="external" :size="12" />
                    MC百科
                  </button>
                </div>
              </div>

              <AlxIcon name="chevron-right" :size="18" class="resource-item-chevron" />
            </article>
          </div>

          <!-- 翻页（PCL 式：首页 / 上一页 / 页码 / 下一页） -->
          <div v-if="store.resourceTotal > store.resourcePageSize" class="resource-pager">
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
              @click="goPage(store.resourcePage - 1)"
            >
              <AlxIcon name="chevron-left" :size="16" />
            </button>
            <span class="resource-page-number">{{ store.resourcePage + 1 }}</span>
            <button
              type="button"
              class="icon-btn"
              title="下一页"
              :disabled="!canNext"
              @click="goPage(store.resourcePage + 1)"
            >
              <AlxIcon name="chevron-right" :size="16" />
            </button>
          </div>
        </template>
      </template>
    </template>
  </div>
</template>
