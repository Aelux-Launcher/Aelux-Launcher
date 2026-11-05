<script setup lang="ts">
/**
 * 社区资源详情页（副页面，极简黑白主题）。
 *
 * 布局参考 PCL2 的 PageDownloadCompDetail：
 *   顶部信息卡（图标 / 标题 / 作者 / 下载量 / 分类 / 跳转 Modrinth）
 *   → 介绍（Markdown 渲染）
 *   → 游戏版本 / 加载器筛选 chip
 *   → 按游戏版本分组的版本卡片（可折叠，默认展开第一组）
 *   → 每个文件可下载（Tauri 下弹出保存对话框）。
 * props 由 App.vue 的舞台层按路由参数注入（含列表页带来的版本 / 加载器预设）。
 */
import { computed, ref, watch } from 'vue'
import { useAppStore } from '../stores/app'
import { call } from '../lib/bridge'
import { toast } from '../lib/toast'
import type { ResourceVersion } from '../lib/types'
import { categoryLabel, formatDownloads } from '../lib/modrinth'
import { groupVersionName, shouldGroupVersions, uniqueVersionNames } from '../lib/mcVersion'
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

/** 资源类型 → 占位图标（无封面图时用，见 icons.ts）。 */
const KIND_ICON: Record<string, string> = {
  mod: 'grid',
  modpack: 'folder',
  datapack: 'code',
  resourcepack: 'layout',
  shader: 'star',
  world: 'play',
}

/** 加载器 → 展示名。 */
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

/* ------------------------------ 详情加载 ------------------------------ */

const project = computed(() => store.resourceDetailData?.project ?? null)
const versions = computed(() => store.resourceDetailData?.versions ?? [])

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

/** 版本数量 ≥ 9 时折叠为 drop（1.21.4 → 1.21），与 PCL 一致。 */
const groupedByDrop = computed(() => shouldGroupVersions(allGameVersions.value))

/** 游戏版本筛选 chip（全部 / 快照版 / 1.21 / 远古版 …）。 */
const versionFilterNames = computed(() =>
  uniqueVersionNames(allGameVersions.value, groupedByDrop.value, true),
)

/** 可用加载器（去重；多于一个时才显示加载器筛选行）。 */
const loaderNames = computed(() => {
  const out: string[] = []
  for (const v of sortedVersions.value) {
    for (const l of v.loaders) {
      if (!out.includes(l)) out.push(l)
    }
  }
  return out
})

/* ------------------------------ 筛选状态 ------------------------------ */

/** 选中的游戏版本 chip（空串 = 全部）。 */
const selectedVersion = ref('')

/** 选中的加载器（空串 = 全部）。 */
const selectedLoader = ref('')

/** 已展开的版本分组卡片名。 */
const openCards = ref(new Set<string>())

/** 是否已应用路由带来的预设筛选（每个项目只应用一次）。 */
let preselectApplied = false

/** 进入页面（或切换项目）时重置筛选并拉取资源详情。 */
watch(
  () => props.projectId,
  (id) => {
    preselectApplied = false
    selectedVersion.value = ''
    selectedLoader.value = ''
    openCards.value = new Set()
    void store.loadResourceDetail(id)
  },
  { immediate: true },
)

/** 详情加载完成后，应用列表页带来的版本 / 加载器预设。 */
watch(
  [sortedVersions, groupedByDrop],
  () => {
    if (preselectApplied || versions.value.length === 0) return
    preselectApplied = true
    if (props.gameVersion) {
      selectedVersion.value = groupVersionName(props.gameVersion, groupedByDrop.value, true)
    }
    if (props.loader && loaderNames.value.includes(props.loader)) {
      selectedLoader.value = props.loader
    }
  },
  { immediate: true },
)

function versionFilterName(id: string): string {
  return groupVersionName(id, groupedByDrop.value, true)
}

/** 版本是否命中当前游戏版本筛选。 */
function matchesVersionFilter(v: ResourceVersion): boolean {
  if (!selectedVersion.value) return true
  return v.gameVersions.some((g) => versionFilterName(g) === selectedVersion.value)
}

/** 版本是否命中当前加载器筛选。 */
function matchesLoaderFilter(v: ResourceVersion): boolean {
  return !selectedLoader.value || v.loaders.includes(selectedLoader.value)
}

/** 当前筛选后的版本列表。 */
const filteredVersions = computed(() =>
  sortedVersions.value.filter((v) => matchesVersionFilter(v) && matchesLoaderFilter(v)),
)

interface VersionCard {
  name: string
  versions: ResourceVersion[]
}

/**
 * 按游戏版本分组（PCL 式卡片）。
 * 选中某个版本 chip 时，文件归到命中的那个游戏版本，避免同一文件在多组重复。
 */
const versionCards = computed<VersionCard[]>(() => {
  const map = new Map<string, ResourceVersion[]>()
  for (const v of filteredVersions.value) {
    let key = v.gameVersions[0] ?? '未知版本'
    if (selectedVersion.value) {
      key = v.gameVersions.find((g) => versionFilterName(g) === selectedVersion.value) ?? key
    }
    const list = map.get(key)
    if (list) list.push(v)
    else map.set(key, [v])
  }
  return [...map.entries()].map(([name, list]) => ({ name, versions: list }))
})

/** 结果变化时保留仍存在的展开组；若无展开组则默认展开第一组。 */
watch(versionCards, (cards) => {
  const next = new Set([...openCards.value].filter((name) => cards.some((c) => c.name === name)))
  if (next.size === 0 && cards.length > 0) next.add(cards[0].name)
  openCards.value = next
})

function isCardOpen(name: string): boolean {
  return openCards.value.has(name)
}

function toggleCard(name: string) {
  const next = new Set(openCards.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  openCards.value = next
}

/** 是否有版本筛选（用于「清除筛选」按钮）。 */
const hasVersionFilter = computed(() => Boolean(selectedVersion.value || selectedLoader.value))

function clearVersionFilters() {
  selectedVersion.value = ''
  selectedLoader.value = ''
}

/* ------------------------------ 展示 / 动作 ------------------------------ */

/** ISO 时间 → `2026/10/21`（本地时区日期）。 */
function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

/** 加载器 → 展示名。 */
function loaderLabel(loader: string): string {
  return LOADER_LABELS[loader] ?? loader
}

/** 正在下载的版本 id（按钮进入禁用态，避免重复点击）。 */
const downloadingIds = ref(new Set<string>())

/** 下载某个文件：保存对话框 → 内核下载。 */
async function handleDownload(v: ResourceVersion) {
  if (downloadingIds.value.has(v.id)) return
  const pending = new Set(downloadingIds.value)
  pending.add(v.id)
  downloadingIds.value = pending
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

/** 加载失败后重试。 */
function retry() {
  void store.loadResourceDetail(props.projectId)
}

/* ------------------------------ Markdown 渲染 ------------------------------ */

/** 转义 HTML（后续只插入受控标签）。 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 行内 Markdown：图片 / 链接 / 粗体 / 斜体 / 删除线 / 行内代码。
 * URL 仅允许 http(s)，源文本已在入口处转义 HTML。
 */
function inlineMarkdown(text: string): string {
  const codes: string[] = []
  let out = text.replace(/`([^`]+)`/g, (_, code: string) => {
    codes.push(code)
    return `\u0001${codes.length - 1}\u0002`
  })
  out = out.replace(
    /!\[([^\]]*)\]\((https?:[^\s)]+)\)/g,
    '<img src="$2" alt="$1" loading="lazy" />',
  )
  out = out.replace(
    /\[([^\]]+)\]\((https?:[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  )
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>')
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  out = out.replace(/\u0001(\d+)\u0002/g, (_, index: string) => `<code>${codes[Number(index)]}</code>`)
  return out
}

/** 极简 Markdown → HTML（标题 / 段落 / 列表 / 引用 / 代码块 / 分隔线）。 */
function renderMarkdown(source: string): string {
  if (!source.trim()) return ''
  const lines = escapeHtml(source.replace(/\r\n/g, '\n')).split('\n')
  const blocks: string[] = []
  let paragraph: string[] = []
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null
  let quote: string[] = []
  let code: string[] | null = null

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    blocks.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`)
    paragraph = []
  }
  const flushList = () => {
    if (!list) return
    blocks.push(`<${list.tag}>${list.items.map((item) => `<li>${item}</li>`).join('')}</${list.tag}>`)
    list = null
  }
  const flushQuote = () => {
    if (quote.length === 0) return
    blocks.push(`<blockquote>${inlineMarkdown(quote.join(' '))}</blockquote>`)
    quote = []
  }
  const flushAll = () => {
    flushParagraph()
    flushList()
    flushQuote()
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/g, '')

    if (code !== null) {
      if (/^\s*```/.test(line)) {
        blocks.push(`<pre><code>${code.join('\n')}</code></pre>`)
        code = null
      } else {
        code.push(rawLine)
      }
      continue
    }

    if (/^\s*```/.test(line)) {
      flushAll()
      code = []
      continue
    }

    if (!line.trim()) {
      flushAll()
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      flushAll()
      const level = heading[1].length
      blocks.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`)
      continue
    }

    if (/^\s*([-*_])\s*\1\s*\1.*$/.test(line)) {
      flushAll()
      blocks.push('<hr />')
      continue
    }

    const quoteMatch = /^\s*&gt;\s?(.*)$/.exec(line)
    if (quoteMatch) {
      flushParagraph()
      flushList()
      quote.push(quoteMatch[1])
      continue
    }

    const unordered = /^\s*[-*•]\s+(.*)$/.exec(line)
    if (unordered) {
      flushParagraph()
      flushQuote()
      if (!list || list.tag !== 'ul') {
        flushList()
        list = { tag: 'ul', items: [] }
      }
      list.items.push(inlineMarkdown(unordered[1]))
      continue
    }

    const ordered = /^\s*[0-9]+\.\s+(.*)$/.exec(line)
    if (ordered) {
      flushParagraph()
      flushQuote()
      if (!list || list.tag !== 'ol') {
        flushList()
        list = { tag: 'ol', items: [] }
      }
      list.items.push(inlineMarkdown(ordered[1]))
      continue
    }

    flushList()
    flushQuote()
    paragraph.push(line.trim())
  }

  if (code !== null) blocks.push(`<pre><code>${code.join('\n')}</code></pre>`)
  flushAll()
  return blocks.join('')
}

/** 介绍内容（Markdown → HTML）。 */
const bodyHtml = computed(() => renderMarkdown(store.resourceDetailData?.body ?? ''))
</script>

<template>
  <div class="page-view active sub-page">
    <PageHeader :title="pageTitle" />

    <!-- 加载中 -->
    <div v-if="store.resourceDetailLoading" class="loading-hint">正在加载资源详情…</div>

    <!-- 加载失败（成功后残留的旧错误不影响展示，故加 !resourceDetailData 条件） -->
    <div v-else-if="store.resourceError && !store.resourceDetailData" class="resource-state-card">
      <AlxIcon name="alert-circle" :size="28" />
      <div class="resource-state-title">加载失败</div>
      <div class="resource-state-desc">{{ store.resourceError }}</div>
      <button type="button" class="btn-download btn-ghost" @click="retry">重试</button>
    </div>

    <!-- 无数据 -->
    <div v-else-if="!store.resourceDetailData" class="resource-state-card">
      <AlxIcon name="info" :size="28" />
      <div class="resource-state-title">暂无资源数据</div>
    </div>

    <template v-else>
      <!-- 顶部信息卡 -->
      <section class="resource-hero">
        <div class="resource-hero-top">
          <div class="resource-hero-icon">
            <img v-if="project?.iconUrl" :src="project.iconUrl" alt="" />
            <AlxIcon v-else :name="KIND_ICON[resourceKind] ?? 'package'" :size="30" />
          </div>

          <div class="resource-hero-main">
            <div class="resource-hero-title">{{ pageTitle }}</div>
            <div class="resource-hero-sub">
              <span v-if="project?.author" class="resource-meta-item">
                <AlxIcon name="user" :size="12" />
                {{ project.author }}
              </span>
              <span class="resource-meta-item">
                <AlxIcon name="download" :size="12" />
                {{ formatDownloads(project?.downloads ?? 0) }}
              </span>
              <span v-if="project?.dateModified" class="resource-meta-item">
                <AlxIcon name="clock" :size="12" />
                更新于 {{ fmtDate(project.dateModified) }}
              </span>
            </div>
            <div class="resource-hero-tags">
              <span class="tag">{{ KIND_TITLE[resourceKind] ?? resourceKind }}</span>
              <span v-for="c in project?.categories ?? []" :key="c" class="tag">{{ categoryLabel(c) }}</span>
            </div>
          </div>

          <div class="resource-hero-actions">
            <button type="button" class="btn-download btn-ghost with-icon" @click="openWebsite">
              <AlxIcon name="external" :size="14" />
              <span>Modrinth</span>
            </button>
            <button type="button" class="icon-btn" title="复制名称" @click="copyName">
              <AlxIcon name="copy" :size="16" />
            </button>
          </div>
        </div>

        <p v-if="project?.description" class="resource-hero-desc">{{ project.description }}</p>
      </section>

      <!-- 介绍 -->
      <section class="resource-section-card">
        <div class="resource-card-title">介绍</div>
        <div v-if="bodyHtml" class="md-body" v-html="bodyHtml" />
        <div v-else class="resource-inline-empty">该项目暂无详细介绍。</div>
      </section>

      <!-- 版本列表 -->
      <div class="resource-section-head">
        <div class="resource-section-title">
          版本列表
          <span class="resource-section-count">{{ filteredVersions.length }} / {{ versions.length }}</span>
        </div>
        <button v-if="hasVersionFilter" type="button" class="resource-filter-clear" @click="clearVersionFilters">
          清除筛选
        </button>
      </div>

      <div v-if="versions.length > 0" class="resource-version-filter">
        <div class="filter-chip-row">
          <span class="filter-chip-label">游戏版本</span>
          <button
            type="button"
            class="filter-chip"
            :class="{ active: !selectedVersion }"
            @click="selectedVersion = ''"
          >
            全部
          </button>
          <button
            v-for="name in versionFilterNames"
            :key="name"
            type="button"
            class="filter-chip"
            :class="{ active: selectedVersion === name }"
            @click="selectedVersion = name"
          >
            {{ name }}
          </button>
        </div>
        <div v-if="loaderNames.length > 1" class="filter-chip-row">
          <span class="filter-chip-label">加载器</span>
          <button
            type="button"
            class="filter-chip"
            :class="{ active: !selectedLoader }"
            @click="selectedLoader = ''"
          >
            全部
          </button>
          <button
            v-for="l in loaderNames"
            :key="l"
            type="button"
            class="filter-chip"
            :class="{ active: selectedLoader === l }"
            @click="selectedLoader = l"
          >
            {{ loaderLabel(l) }}
          </button>
        </div>
      </div>

      <div v-if="versions.length === 0" class="resource-inline-empty">该项目暂无可安装的版本。</div>
      <div v-else-if="filteredVersions.length === 0" class="resource-inline-empty">
        当前筛选条件下没有可用版本，试试切换游戏版本或加载器。
      </div>
      <div v-else class="resource-version-cards">
        <div
          v-for="card in versionCards"
          :key="card.name"
          class="version-card version-group"
          :class="{ open: isCardOpen(card.name) }"
        >
          <button type="button" class="version-group-header" @click="toggleCard(card.name)">
            <span class="version-group-title">
              {{ card.name }}
              <span class="version-group-count">{{ card.versions.length }}</span>
            </span>
            <AlxIcon name="chevron-down" :size="18" class="version-group-chevron" />
          </button>
          <div class="version-group-body">
            <div class="version-group-inner" :inert="isCardOpen(card.name) ? undefined : true">
              <div v-for="v in card.versions" :key="v.id" class="list-item version-file-row">
                <div class="item-left">
                  <div class="item-icon"><AlxIcon name="package" :size="20" /></div>
                  <div class="item-info">
                    <div class="item-title">
                      {{ v.versionNumber }}
                      <span v-for="l in v.loaders" :key="l" class="tag">{{ loaderLabel(l) }}</span>
                    </div>
                    <div class="item-desc">
                      {{ v.fileName || v.name }}
                      <template v-if="v.datePublished"> · {{ fmtDate(v.datePublished) }}</template>
                    </div>
                  </div>
                </div>
                <div class="item-right">
                  <span class="version-file-downloads">{{ formatDownloads(v.downloads) }}</span>
                  <button
                    type="button"
                    class="btn-download with-icon"
                    :disabled="downloadingIds.has(v.id)"
                    @click="handleDownload(v)"
                  >
                    <AlxIcon name="download" :size="14" />
                    <span>{{ downloadingIds.has(v.id) ? '下载中' : '下载' }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
