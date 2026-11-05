<script setup lang="ts">
/**
 * 社区资源详情页（副页面，极简黑白主题）。
 *
 * 布局对齐 PCL2 的 PageDownloadCompDetail：
 *   信息卡（图标 / 标题 / 标签 / 单行描述 / 版本范围·下载量·时间·来源 + 横向按钮）
 *   → 版本筛选 chip 卡（≥2 个版本才显示，只有游戏版本一行）
 *   → 按「加载器 + 版本」分组的版本卡（可折叠）：
 *       前置资源（必填依赖）→ 版本列表 → 版本行（点击或下载按钮保存文件）。
 */
import { computed, ref, watch } from 'vue'
import { useAppStore } from '../stores/app'
import { call } from '../lib/bridge'
import { toast } from '../lib/toast'
import type { ResourceProject, ResourceVersion } from '../lib/types'
import {
  categoryLabel,
  formatDownloads,
  formatRelativeTime,
  resourceKindForProjectType,
} from '../lib/modrinth'
import {
  compareMcVersions,
  groupVersionName,
  resolveVersionGrouping,
  sortVersionNamesDesc,
  uniqueVersionNames,
  versionRangeSummary,
} from '../lib/mcVersion'
import PageHeader from '../components/PageHeader.vue'
import AlxIcon from '../components/AlxIcon.vue'

const props = defineProps<{
  resourceKind: string
  projectId: string
  title: string
  gameVersion?: string
  loader?: string
}>()

const store = useAppStore()

/** 资源类型 → 中文名。 */
const KIND_TITLE: Record<string, string> = {
  mod: 'Mod',
  modpack: '整合包',
  datapack: '数据包',
  resourcepack: '资源包',
  shader: '光影包',
  world: '世界',
}

/** 资源类型 → 占位图标（见 icons.ts）。 */
const KIND_ICON: Record<string, string> = {
  mod: 'grid',
  modpack: 'folder',
  datapack: 'code',
  resourcepack: 'layout',
  shader: 'star',
  world: 'play',
}

/** 加载器 → 展示名（与 PCL 的加载器文案一致）。 */
const LOADER_LABELS: Record<string, string> = {
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  quilt: 'Quilt',
  iris: 'Iris',
  optifine: 'OptiFine',
  canvas: 'Canvas',
  datapack: '数据包',
  minecraft: '原版',
  paper: 'Paper',
  spigot: 'Spigot',
  bukkit: 'Bukkit',
  velocity: 'Velocity',
  waterfall: 'Waterfall',
}

/** 这些「标签」其实是加载器，不放进信息卡的分类标签里。 */
const LOADER_TAGS = new Set([
  'fabric',
  'forge',
  'neoforge',
  'quilt',
  'iris',
  'optifine',
  'canvas',
  'vanilla',
  'minecraft',
  'datapack',
  'paper',
  'spigot',
  'bukkit',
  'velocity',
  'waterfall',
])

/* ------------------------------ 详情数据 ------------------------------ */

const project = computed(() => store.resourceDetailData?.project ?? null)
const versions = computed(() => store.resourceDetailData?.versions ?? [])
const dependencies = computed(() => store.resourceDetailData?.dependencies ?? [])

/** 页头标题：优先取详情里的项目名，路由参数兜底。 */
const pageTitle = computed(() => project.value?.title || props.title || '资源详情')

/** 版本按发布时间倒序（分组与筛选都基于该顺序，最新在前）。 */
const sortedVersions = computed(() =>
  [...versions.value].sort((a, b) => {
    const at = new Date(a.datePublished).getTime()
    const bt = new Date(b.datePublished).getTime()
    return (Number.isNaN(bt) ? 0 : bt) - (Number.isNaN(at) ? 0 : at)
  }),
)

/** 该项目涉及的全部游戏版本（去重）。 */
const allGameVersions = computed(() => {
  const out: string[] = []
  for (const v of sortedVersions.value) {
    for (const g of v.gameVersions) {
      if (!out.includes(g)) out.push(g)
    }
  }
  return out
})

/** PCL 的四种分组组合：不分组 → drop 分组 → 折叠旧版 → drop + 折叠旧版。 */
const grouping = computed(() => resolveVersionGrouping(allGameVersions.value))

/** 版本筛选 chip（全部 / 1.21 / 26.1 / 快照版 / 远古版 …，最新在前）。 */
const versionFilterNames = computed(() =>
  sortVersionNamesDesc(
    uniqueVersionNames(allGameVersions.value, grouping.value.grouped, grouping.value.foldOld),
  ),
)

/** 只有一个版本时不显示筛选卡（PCL 行为）。 */
const showVersionFilter = computed(() => versionFilterNames.value.length >= 2)

/** 最新正式版 id（版本范围摘要的「+」判定）。 */
const latestReleaseId = computed(
  () => store.versions.find((v) => v.kind === 'release')?.id ?? '',
)

/** 信息卡的版本范围摘要：1.21+, 1.12-。 */
const rangeSummary = computed(() =>
  versionRangeSummary(allGameVersions.value, latestReleaseId.value),
)

/** 信息卡分类标签：最多 4 个，过滤掉加载器名。 */
const introTags = computed(() =>
  (project.value?.displayCategories ?? [])
    .filter((c) => !LOADER_TAGS.has(c.toLowerCase()))
    .slice(0, 4),
)

/* ------------------------------ 版本卡片 ------------------------------ */

interface VersionCard {
  /** 卡片标题（加载器 + 版本，或仅版本） */
  name: string
  /** 该卡对应的版本筛选名 */
  versionName: string
  /** 文件只对应一个加载器时用于卡片前缀 */
  loader: string
  versions: ResourceVersion[]
  /** 该卡涉及的前置资源（必填依赖） */
  dependencies: ResourceProject[]
}

/** 文件归组用的版本号：取第一个游戏版本（Modrinth 按最新在前返回）。 */
function cardVersionName(v: ResourceVersion): string {
  const first = v.gameVersions.find((g) => g) ?? '未知版本'
  return groupVersionName(first, grouping.value.grouped, grouping.value.foldOld)
}

/** 项目级前置资源索引。 */
const dependencyById = computed(
  () => new Map(dependencies.value.map((d) => [d.projectId, d])),
)

/** 单张卡的必填依赖（去重、保持版本顺序）。 */
function cardDependencies(card: VersionCard): ResourceProject[] {
  const ids = new Set<string>()
  for (const v of card.versions) {
    for (const d of v.dependencies ?? []) {
      if (d.type === 'required' && d.projectId) ids.add(d.projectId)
    }
  }
  return [...ids]
    .map((id) => dependencyById.value.get(id))
    .filter((d): d is ResourceProject => Boolean(d))
}

/** 所有版本卡：Mod 项目按「加载器 + 版本」拆分，其余只按版本拆分。 */
const allCards = computed<VersionCard[]>(() => {
  const map = new Map<string, VersionCard>()
  for (const v of sortedVersions.value) {
    const versionName = cardVersionName(v)
    const loader = v.loaders.length === 1 ? v.loaders[0] : ''
    const prefix = props.resourceKind === 'mod' && loader ? `${LOADER_LABELS[loader] ?? loader} ` : ''
    const name = `${prefix}${versionName}`
    let card = map.get(name)
    if (!card) {
      card = { name, versionName, loader, versions: [], dependencies: [] }
      map.set(name, card)
    }
    card.versions.push(v)
  }
  return [...map.values()]
    .map((card) => ({ ...card, dependencies: cardDependencies(card) }))
    .sort((a, b) => {
      const byVersion = compareMcVersions(b.versionName, a.versionName)
      if (byVersion !== 0) return byVersion
      return (LOADER_LABELS[a.loader] ?? a.loader).localeCompare(LOADER_LABELS[b.loader] ?? b.loader)
    })
})

/* ------------------------------ 筛选与展开 ------------------------------ */

/** 选中的游戏版本 chip（空串 = 全部）。 */
const selectedVersion = ref('')

/** 已展开的版本卡片名。 */
const openCards = ref(new Set<string>())

/** 是否已应用路由带来的预设筛选（每个项目只应用一次）。 */
let preselectApplied = false

/** 当前可见的版本卡（按版本筛选）。 */
const visibleCards = computed(() =>
  selectedVersion.value === ''
    ? allCards.value
    : allCards.value.filter((card) => card.versionName === selectedVersion.value),
)

/** 进入页面（或切换项目）时重置筛选并拉取资源详情。 */
watch(
  () => props.projectId,
  (id) => {
    preselectApplied = false
    selectedVersion.value = ''
    openCards.value = new Set()
    void store.loadResourceDetail(id)
  },
  { immediate: true },
)

/** 详情加载完成后应用列表页带来的版本 / 加载器预设（只用于默认展开）。 */
watch(
  [sortedVersions, allCards],
  () => {
    if (preselectApplied || versions.value.length === 0) return
    preselectApplied = true
    if (props.gameVersion) {
      const name = groupVersionName(props.gameVersion, grouping.value.grouped, grouping.value.foldOld)
      if (versionFilterNames.value.includes(name)) selectedVersion.value = name
    }
    const target =
      allCards.value.find((card) => {
        if (selectedVersion.value && card.versionName !== selectedVersion.value) return false
        if (props.loader && card.loader && card.loader !== props.loader) return false
        return true
      }) ?? visibleCards.value[0]
    if (target) openCards.value = new Set([target.name])
  },
)

/** chip 筛选后保证至少展开一张卡（否则用户看不到版本行）。 */
watch(selectedVersion, () => {
  const cards = visibleCards.value
  if (cards.length === 0) return
  const stillOpen = cards.find((card) => openCards.value.has(card.name))
  if (!stillOpen) openCards.value = new Set([cards[0].name])
})

function selectVersion(name: string) {
  selectedVersion.value = name
}

function isCardOpen(name: string): boolean {
  return openCards.value.has(name)
}

function toggleCard(name: string) {
  const next = new Set(openCards.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  openCards.value = next
}

/* ------------------------------ 版本行文案 ------------------------------ */

/** 去掉资源文件后缀（PCL 标题使用的展示名）。 */
function stripExtension(name: string): string {
  return name.replace(/\.(jar|zip|mrpack|litemod)$/i, '')
}

/** 版本主标题：重名时用文件名（PCL 的 IsBadDisplay 逻辑）。 */
function versionTitle(v: ResourceVersion, siblings: ResourceVersion[]): string {
  const base = stripExtension(v.versionNumber || v.name || v.fileName)
  const duplicate =
    siblings.filter((x) => stripExtension(x.versionNumber || x.name || x.fileName) === base).length > 1
  return duplicate ? stripExtension(v.fileName) : base
}

/** 测试版 / 早期测试版标识（正式版不显示）。 */
function releaseLabel(v: ResourceVersion): string {
  if (v.releaseType === 'beta') return '测试版'
  if (v.releaseType === 'alpha') return '早期测试版'
  return ''
}

function releaseIcon(v: ResourceVersion): string {
  if (v.releaseType === 'beta') return 'info'
  if (v.releaseType === 'alpha') return 'alert-circle'
  return 'package'
}

/** 版本行信息（PCL 顺序：加载器 / 文件名 / 前置数量 / 游戏版本 / 下载 / 更新时间）。 */
function versionInfo(v: ResourceVersion, card: VersionCard): string {
  const parts: string[] = []
  if (v.loaders.length > 0) {
    parts.push(v.loaders.map((l) => LOADER_LABELS[l] ?? l).join('、'))
  }
  const title = versionTitle(v, card.versions)
  if (v.fileName && stripExtension(v.fileName) !== title) parts.push(v.fileName)
  const required =
    v.dependencies?.filter((d) => d.type === 'required' && d.projectId).length ?? 0
  if (required > 0) parts.push(`${required} 项前置`)
  if (grouping.value.grouped && v.gameVersions.length > 0) {
    parts.push(v.gameVersions.slice(0, 6).join(', '))
  }
  parts.push(`下载 ${v.downloads} 次`)
  parts.push(`更新于 ${formatRelativeTime(v.datePublished)}`)
  return parts.join('，')
}

/** 依赖条目的类型标签（PCL 只显示一个分类标签）。 */
function dependencyTag(dep: ResourceProject): string {
  const raw = dep.displayCategories[0] ?? dep.categories[0] ?? ''
  return raw ? categoryLabel(raw) : ''
}

/* ------------------------------ 操作 ------------------------------ */

/** 打开 Modrinth 项目页。 */
async function openWebsite() {
  const slug = project.value?.slug ?? props.projectId
  const url = `https://modrinth.com/${props.resourceKind}/${encodeURIComponent(slug)}`
  try {
    await call('open_external', { url })
  } catch (e) {
    toast.error(`无法打开网页：${(e as Error).message}`)
  }
}

/** 复制项目名（剪贴板不可用时回退到 execCommand）。 */
async function copyName() {
  const text = pageTitle.value
  try {
    await navigator.clipboard.writeText(text)
    toast.success('已复制名称')
  } catch {
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      el.remove()
      if (!ok) throw new Error('浏览器拒绝了复制请求')
      toast.success('已复制名称')
    } catch (e) {
      toast.error(`复制失败：${(e as Error).message}`)
    }
  }
}

/** 点击前置资源 → 打开对应资源详情页（PCL 的依赖条目可交互）。 */
function openDependency(dep: ResourceProject) {
  const kind = resourceKindForProjectType(dep.projectType ?? 'mod', dep.categories)
  store.openSubPage({
    kind: 'resource',
    resourceKind: kind,
    projectId: dep.projectId,
    title: dep.title,
  })
}

/** 正在下载的版本 id。 */
const downloadingIds = ref(new Set<string>())

/** 保存版本文件（Tauri 下弹出保存对话框）。 */
async function downloadVersion(v: ResourceVersion) {
  if (!v.fileUrl || downloadingIds.value.has(v.id)) return
  downloadingIds.value = new Set(downloadingIds.value).add(v.id)
  try {
    const path = await store.saveResourceFile(v, KIND_TITLE[props.resourceKind] ?? '资源文件')
    if (path) toast.success(`已保存到 ${path}`)
  } catch (e) {
    toast.error(`下载失败：${(e as Error).message}`)
  } finally {
    const next = new Set(downloadingIds.value)
    next.delete(v.id)
    downloadingIds.value = next
  }
}

/** 加载失败后重试。 */
function retry() {
  void store.loadResourceDetail(props.projectId)
}

/** 封面加载失败时回退到占位图标。 */
const failedIcon = ref(false)
watch(
  () => props.projectId,
  () => {
    failedIcon.value = false
  },
)
</script>

<template>
  <PageHeader :title="pageTitle" />

  <!-- 加载中 -->
  <div v-if="store.resourceDetailLoading" class="resource-results-card">
    <div v-for="i in 3" :key="i" class="resource-skeleton" />
    <div class="loading-hint">正在获取版本列表...</div>
  </div>

  <!-- 加载失败 -->
  <div v-else-if="!project" class="resource-state-card">
    <AlxIcon name="alert-circle" :size="28" />
    <div class="resource-state-title">无法加载资源详情</div>
    <div class="resource-state-desc">请检查网络后重试，或返回列表选择其他资源。</div>
    <button type="button" class="btn-download btn-ghost" @click="retry">重试</button>
  </div>

  <template v-else>
    <!-- 信息卡（PCL CardIntro） -->
    <section class="resource-intro">
      <div class="resource-intro-body">
        <div class="resource-intro-icon">
          <img
            v-if="project.iconUrl && !failedIcon"
            :src="project.iconUrl"
            :alt="project.title"
            @error="failedIcon = true"
          />
          <AlxIcon v-else :name="KIND_ICON[props.resourceKind] ?? 'package'" :size="30" />
        </div>

        <div class="resource-intro-info">
          <div class="resource-intro-head">
            <span class="resource-intro-title">{{ project.title }}</span>
            <span class="resource-intro-slug">{{ project.slug }}</span>
          </div>

          <div v-if="introTags.length" class="resource-intro-tags">
            <span v-for="tag in introTags" :key="tag" class="resource-tag">
              {{ categoryLabel(tag) }}
            </span>
          </div>

          <div class="resource-intro-desc">{{ project.description }}</div>

          <div class="resource-intro-meta">
            <span v-if="rangeSummary" class="resource-meta-item">
              <AlxIcon name="columns" :size="12" />
              {{ rangeSummary }}
            </span>
            <span class="resource-meta-item">
              <AlxIcon name="download" :size="12" />
              {{ formatDownloads(project.downloads) }}
            </span>
            <span class="resource-meta-item">
              <AlxIcon name="clock" :size="12" />
              {{ formatRelativeTime(project.dateModified) }}
            </span>
            <span class="resource-meta-item">
              <AlxIcon name="globe" :size="12" />
              Modrinth
            </span>
          </div>
        </div>
      </div>

      <div class="resource-intro-actions">
        <button type="button" class="btn-download search-submit" @click="openWebsite">
          转到 Modrinth
        </button>
        <button type="button" class="btn-download btn-ghost with-icon" @click="copyName">
          <AlxIcon name="copy" :size="14" />
          <span>复制名称</span>
        </button>
      </div>
    </section>

    <!-- 版本筛选卡（PCL CardFilter）：只有游戏版本一行 -->
    <section v-if="showVersionFilter" class="resource-section-card resource-filter-card">
      <div class="filter-chip-row">
        <button
          type="button"
          class="filter-chip"
          :class="{ active: selectedVersion === '' }"
          @click="selectVersion('')"
        >
          全部
        </button>
        <button
          v-for="name in versionFilterNames"
          :key="name"
          type="button"
          class="filter-chip"
          :class="{ active: selectedVersion === name }"
          @click="selectVersion(name)"
        >
          {{ name }}
        </button>
      </div>
    </section>

    <!-- 无匹配版本 -->
    <div v-if="visibleCards.length === 0" class="resource-state-card">
      <AlxIcon name="alert-circle" :size="28" />
      <div class="resource-state-title">没有符合筛选的版本</div>
      <div class="resource-state-desc">试试选择其他游戏版本。</div>
    </div>

    <!-- 版本卡（PCL PanResults） -->
    <section
      v-for="card in visibleCards"
      :key="card.name"
      class="resource-section-card version-card"
    >
      <button
        type="button"
        class="version-card-head"
        :aria-expanded="isCardOpen(card.name)"
        @click="toggleCard(card.name)"
      >
        <span class="version-card-title">{{ card.name }}</span>
        <AlxIcon
          name="chevron-down"
          :size="16"
          class="version-card-chevron"
          :class="{ open: isCardOpen(card.name) }"
        />
      </button>

      <div v-show="isCardOpen(card.name)" class="version-card-body">
        <!-- 前置资源 -->
        <div v-if="card.dependencies.length" class="version-card-section">
          <div class="section-label">前置资源</div>
          <div class="dependency-list">
            <article
              v-for="dep in card.dependencies"
              :key="dep.projectId"
              class="dependency-item"
              @click="openDependency(dep)"
            >
              <div class="dependency-icon">
                <img v-if="dep.iconUrl" :src="dep.iconUrl" :alt="dep.title" loading="lazy" />
                <AlxIcon v-else name="package" :size="20" />
              </div>
              <div class="dependency-main">
                <div class="dependency-head">
                  <span class="dependency-title">{{ dep.title }}</span>
                  <span v-if="dependencyTag(dep)" class="resource-tag">{{ dependencyTag(dep) }}</span>
                  <span class="dependency-desc">{{ dep.description }}</span>
                </div>
                <div class="dependency-meta">
                  <span class="resource-meta-item">
                    <AlxIcon name="download" :size="12" />
                    {{ formatDownloads(dep.downloads) }}
                  </span>
                  <span class="resource-meta-item">
                    <AlxIcon name="clock" :size="12" />
                    {{ formatRelativeTime(dep.dateModified) }}
                  </span>
                  <span class="resource-meta-item">
                    <AlxIcon name="globe" :size="12" />
                    Modrinth
                  </span>
                </div>
              </div>
              <AlxIcon name="chevron-right" :size="16" class="dependency-chevron" />
            </article>
          </div>
        </div>

        <!-- 版本列表标题（有前置资源时 PCL 会显示） -->
        <div v-if="card.dependencies.length" class="section-label">版本列表</div>

        <!-- 版本行 -->
        <div class="version-file-list">
          <div
            v-for="v in card.versions"
            :key="v.id"
            class="version-file-row"
            @click="downloadVersion(v)"
          >
            <div class="version-file-icon">
              <AlxIcon :name="releaseIcon(v)" :size="16" />
            </div>
            <div class="version-file-main">
              <div class="version-file-title">
                <span class="version-file-name">{{ versionTitle(v, card.versions) }}</span>
                <span v-if="releaseLabel(v)" class="version-file-badge">{{ releaseLabel(v) }}</span>
              </div>
              <div class="version-file-info">{{ versionInfo(v, card) }}</div>
            </div>
            <button
              type="button"
              class="icon-btn version-file-download"
              :title="`另存为 ${v.fileName}`"
              :disabled="downloadingIds.has(v.id)"
              @click.stop="downloadVersion(v)"
            >
              <AlxIcon name="download" :size="16" />
            </button>
          </div>
        </div>
      </div>
    </section>
  </template>
</template>
