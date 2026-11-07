<script setup lang="ts">
/**
 * 社区资源详情页（副页面，极简黑白主题）。
 *
 * 布局参考同类启动器的资源详情页：
 *   信息卡（资源条目 + 下方按钮行）
 *   → 版本筛选 chip 卡（≥2 个版本才显示）
 *   → 版本卡（整行竖向堆叠、可折叠）：
 *       卡内先前置资源（必填依赖），再版本列表。
 *
 * 分组规则：
 *   - 按文件的「每一个游戏版本」建卡（不是只取第一个版本）；
 *   - 项目有多个加载器且是 Mod、版本号为标准格式时，按「加载器 + 版本」拆卡；
 *   - 从列表页带版本 / 加载器进入时，置顶一张「…（所选版本）」卡。
 */
import { computed, ref, watch } from 'vue'
import { useAppStore } from '../stores/app'
import { call } from '../lib/bridge'
import { toast } from '../lib/toast'
import { confirmDialog } from '../lib/dialog'
import { ensureMcmod, mcmodInfo } from '../lib/mcmod'
import type { ResourceKind, ResourceProject, ResourceVersion } from '../lib/types'
import { curseForgeProjectUrl } from '../lib/curseforge'
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
import AlxModal from '../components/AlxModal.vue'
/* 版本发布类型图标（素材取自 PCL 的 ReleaseTypes：Alpha / Beta / Release）。 */
import ALPHA_ICON from '../assets/release-types/alpha.png'
import BETA_ICON from '../assets/release-types/beta.png'
import RELEASE_ICON from '../assets/release-types/release.png'

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
  mod: 'puzzle',
  modpack: 'minecraft',
  datapack: 'grid',
  resourcepack: 'image',
  shader: 'sun',
  world: 'globe',
}

/** 加载器 → 展示名（与加载器文案一致）。 */
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

/** 特殊版本分组（排序时排在所有正式版本之后）。 */
const SPECIAL_VERSION_NAMES = new Set(['快照版', '远古版', '未知版本'])

/* ------------------------------ 详情数据 ------------------------------ */

const project = computed(() => store.resourceDetailData?.project ?? null)
const versions = computed(() => store.resourceDetailData?.versions ?? [])
const dependencies = computed(() => store.resourceDetailData?.dependencies ?? [])

/** 页头标题：优先取详情里的项目名，路由参数兜底。 */
const pageTitle = computed(() => project.value?.title || props.title || '资源详情')

/** MC百科信息（中文名 + 条目地址）；未收录为 undefined。 */
const mcInfo = computed(() => (project.value ? mcmodInfo(project.value.title) : undefined))

/** 展示名：MC百科有中文时「中文 | 英文」，否则退回「标题 | slug」。 */
const displayName = computed(() => {
  const info = mcInfo.value
  if (info) return { primary: info.primary, secondary: info.secondary }
  return { primary: project.value?.title || props.title || '', secondary: project.value?.slug }
})

/** 项目就绪 / 切换时补齐 MC百科信息（后台请求，不阻塞详情加载）。 */
watch(
  () => project.value?.title,
  (title) => {
    if (title) ensureMcmod(title)
  },
  { immediate: true },
)

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

/** 四种分组组合：不分组 → drop 分组 → 折叠旧版 → drop + 折叠旧版。 */
const grouping = computed(() => resolveVersionGrouping(allGameVersions.value))

/** 版本筛选 chip（全部 / 1.21 / 26.1 / 快照版 / 远古版 …，最新在前）。 */
const versionFilterNames = computed(() =>
  sortVersionNamesDesc(
    uniqueVersionNames(allGameVersions.value, grouping.value.grouped, grouping.value.foldOld),
  ),
)

/** 只有一个版本时不显示筛选卡。 */
const showVersionFilter = computed(() => versionFilterNames.value.length >= 2)

/** 项目级加载器集合（用项目级加载器数量决定卡片是否带加载器前缀）。 */
const projectLoaders = computed(() => {
  const out = new Set<string>()
  for (const v of versions.value) {
    for (const l of v.loaders) {
      if (l) out.add(l)
    }
  }
  return [...out]
})

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
  /** 唯一键（加载器 + 游戏版本）。 */
  key: string
  /** 卡片标题（加载器 + 版本，或仅版本）。 */
  name: string
  /** 该卡对应的完整游戏版本。 */
  gameVersion: string
  /** 卡片标题里的加载器（空串 = 无前缀）。 */
  loader: string
  /** 是否是「（所选版本）」置顶卡。 */
  targeted: boolean
  versions: ResourceVersion[]
  /** 该卡涉及的前置资源（必填依赖）。 */
  dependencies: ResourceProject[]
}

/** 标准版本号（1.21.4 / 26.1）。 */
function isStandardVersion(name: string): boolean {
  return /^\d+(?:\.\d+)+$/.test(name)
}

/** 特殊版本（快照版 / 远古版 / 未知版本）。 */
function isSpecialVersion(name: string): boolean {
  return SPECIAL_VERSION_NAMES.has(groupVersionName(name, false, false))
}

/** 项目级前置资源索引。 */
const dependencyById = computed(
  () => new Map(dependencies.value.map((d) => [d.projectId, d])),
)

/** 单张卡的前置资源（整合包不显示；其余按项目 ID 排序）。 */
function cardDependencies(card: VersionCard): ResourceProject[] {
  if (props.resourceKind === 'modpack') return []
  const ids = new Set<string>()
  for (const v of card.versions) {
    for (const d of v.dependencies ?? []) {
      if (d.projectId) ids.add(d.projectId)
    }
  }
  return [...ids]
    .sort((a, b) => a.localeCompare(b))
    .map((id) => dependencyById.value.get(id))
    .filter((d): d is ResourceProject => Boolean(d))
}

/** 卡片排序（正式版降序，特殊版最后，再按标题）。 */
function compareCards(a: VersionCard, b: VersionCard): number {
  if (a.targeted !== b.targeted) return a.targeted ? -1 : 1
  const aSpecial = isSpecialVersion(a.gameVersion)
  const bSpecial = isSpecialVersion(b.gameVersion)
  if (aSpecial !== bSpecial) return aSpecial ? 1 : -1
  if (!aSpecial) {
    const byVersion = compareMcVersions(b.gameVersion, a.gameVersion)
    if (byVersion !== 0) return byVersion
  }
  return a.name.localeCompare(b.name)
}

/** 全部版本卡：按文件的每一个游戏版本建卡，多加载器 Mod 再按加载器拆分。 */
const baseCards = computed<VersionCard[]>(() => {
  const splitByLoader = props.resourceKind === 'mod' && projectLoaders.value.length > 1
  const map = new Map<string, VersionCard>()
  for (const v of sortedVersions.value) {
    const gameVersions = v.gameVersions.length ? v.gameVersions : ['未知版本']
    for (const gameVersion of gameVersions) {
      const loaders =
        splitByLoader && isStandardVersion(gameVersion) && v.loaders.length > 0
          ? v.loaders.map((l) => LOADER_LABELS[l] ?? l)
          : ['']
      for (const loader of loaders) {
        const key = `${loader}|${gameVersion}`
        let card = map.get(key)
        if (!card) {
          card = {
            key,
            name: loader ? `${loader} ${gameVersion}` : gameVersion,
            gameVersion,
            loader,
            targeted: false,
            versions: [],
            dependencies: [],
          }
          map.set(key, card)
        }
        if (!card.versions.some((x) => x.id === v.id)) card.versions.push(v)
      }
    }
  }
  return [...map.values()]
    .map((card) => ({ ...card, dependencies: cardDependencies(card) }))
    .sort(compareCards)
})

/* ------------------------------ 筛选与展开 ------------------------------ */

/** 选中的游戏版本 chip（空串 = 全部）。 */
const selectedVersion = ref('')

/** 已展开的版本卡片 key。 */
const openCards = ref(new Set<string>())

/** 从列表页带来的「所选版本」卡片标题。 */
const targetCardName = computed(() => {
  if (!props.gameVersion && !props.loader) return ''
  const loader = props.loader ? LOADER_LABELS[props.loader] ?? props.loader : ''
  return `${loader ? `${loader} ` : ''}${props.gameVersion ?? ''}（所选版本）`
})

/** 置顶卡包含的版本（版本与加载器同时匹配）。 */
const targetedVersions = computed(() => {
  if (!targetCardName.value) return []
  return sortedVersions.value.filter((v) => {
    if (props.gameVersion && !v.gameVersions.includes(props.gameVersion)) return false
    if (props.loader && !v.loaders.includes(props.loader)) return false
    return true
  })
})

/** 置顶卡是否可见（所选版本的分组必须命中当前筛选）。 */
const showTargeted = computed(() => {
  if (!targetCardName.value || targetedVersions.value.length === 0) return false
  if (!selectedVersion.value) return true
  if (!props.gameVersion) return false
  const group = groupVersionName(props.gameVersion, grouping.value.grouped, grouping.value.foldOld)
  return group.startsWith(selectedVersion.value)
})

/** 普通版本卡（按 chip 筛选；隐藏与置顶卡同名的普通卡）。 */
const normalCards = computed(() => {
  let cards = baseCards.value
  if (selectedVersion.value) {
    cards = cards.filter(
      (card) =>
        groupVersionName(card.gameVersion, grouping.value.grouped, grouping.value.foldOld) ===
        selectedVersion.value,
    )
  }
  if (targetCardName.value) {
    const skipName = targetCardName.value.replace('（所选版本）', '')
    cards = cards.filter((card) => card.name !== skipName)
  }
  return cards
})

/** 最终展示的卡片：置顶卡 + 普通卡。 */
const visibleCards = computed<VersionCard[]>(() => {
  const cards: VersionCard[] = []
  if (showTargeted.value) {
    const targeted: VersionCard = {
      key: 'targeted',
      name: targetCardName.value,
      gameVersion: props.gameVersion ?? '',
      loader: props.loader ? LOADER_LABELS[props.loader] ?? props.loader : '',
      targeted: true,
      versions: targetedVersions.value,
      dependencies: [],
    }
    targeted.dependencies = cardDependencies(targeted)
    cards.push(targeted)
  }
  cards.push(...normalCards.value)
  return cards
})

/** 是否已应用路由带来的预设筛选（每个项目只应用一次）。 */
let preselectApplied = false

/** 进入页面（或切换项目）时重置筛选并拉取资源详情。 */
watch(
  () => props.projectId,
  (id) => {
    preselectApplied = false
    selectedVersion.value = ''
    openCards.value = new Set()
    void store.loadResourceDetail(id, props.resourceKind as ResourceKind)
  },
  { immediate: true },
)

/** 详情加载完成后：自动选中目标版本 chip，并按约定决定默认展开的卡片。 */
watch(
  [sortedVersions, visibleCards],
  () => {
    if (preselectApplied || versions.value.length === 0) return
    preselectApplied = true
    if (
      props.gameVersion &&
      versions.value.some((v) => v.gameVersions.includes(props.gameVersion!))
    ) {
      const name = groupVersionName(
        props.gameVersion,
        grouping.value.grouped,
        grouping.value.foldOld,
      )
      if (versionFilterNames.value.includes(name)) selectedVersion.value = name
    }
    const cards = visibleCards.value
    if (showTargeted.value) openCards.value = new Set(['targeted'])
    else if (cards.length === 1) openCards.value = new Set([cards[0].key])
  },
)

/** 切换版本筛选（重建卡片列表，全部折叠）。 */
function selectVersion(name: string) {
  selectedVersion.value = name
  openCards.value = new Set()
  const cards = visibleCards.value
  if (showTargeted.value) openCards.value = new Set(['targeted'])
  else if (cards.length === 1) openCards.value = new Set([cards[0].key])
}

function isCardOpen(key: string): boolean {
  return openCards.value.has(key)
}

function toggleCard(key: string) {
  const next = new Set(openCards.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  openCards.value = next
}

/* ------------------------------ 版本行文案 ------------------------------ */

/** 去掉资源文件后缀（标题使用的展示名）。 */
function stripExtension(name: string): string {
  return name.replace(/\.(jar|zip|mrpack|litemod)$/i, '')
}

/** 项目内重复的展示名（同名版本改用文件名）。 */
const duplicatedDisplays = computed(() => {
  const counts = new Map<string, number>()
  for (const v of versions.value) {
    const display = stripExtension(v.name || v.versionNumber || v.fileName)
    counts.set(display, (counts.get(display) ?? 0) + 1)
  }
  return new Set([...counts].filter(([, n]) => n > 1).map(([display]) => display))
})

/** 版本主标题（版本 name 字段去扩展名）。 */
function versionTitle(v: ResourceVersion): string {
  const display = stripExtension(v.name || v.versionNumber || v.fileName)
  return duplicatedDisplays.value.has(display) ? stripExtension(v.fileName) : display
}

/** 测试版 / 早期测试版标识（正式版不显示）。 */
function releaseLabel(v: ResourceVersion): string {
  if (v.releaseType === 'beta') return '测试版'
  if (v.releaseType === 'alpha') return '早期测试版'
  return ''
}

/** 版本发布类型图标（Alpha / Beta / Release 各一种）。 */
function releaseIcon(v: ResourceVersion): string {
  if (v.releaseType === 'beta') return BETA_ICON
  if (v.releaseType === 'alpha') return ALPHA_ICON
  return RELEASE_ICON
}

/** 非标准游戏版本判定（快照 / pre / rc 等）。 */
function isNonStandardGameVersion(version: string): boolean {
  if (!version.includes('.')) return true
  const lower = version.toLowerCase()
  return ['w', 'snapshot', 'rc', 'pre', 'experimental', '-'].some((s) => lower.includes(s))
}

/** 下载次数文案（大于 10 万时按万取整）。 */
function downloadCount(n: number): string {
  return n > 100000 ? `${Math.round(n / 10000)} 万` : String(n)
}

/** 版本行信息（顺序与版本行一致）。 */
function versionInfo(v: ResourceVersion): string {
  const parts: string[] = []
  if (v.loaders.length > 0) {
    parts.push(v.loaders.map((l) => LOADER_LABELS[l] ?? l).join('、'))
  }
  const title = versionTitle(v)
  const fileBase = stripExtension(v.fileName)
  if (v.fileName && title !== fileBase) parts.push(fileBase)
  const required = v.dependencies?.length ?? 0
  if (required > 0) parts.push(`${required} 项前置`)
  if (v.gameVersions.length > 0 && v.gameVersions.every(isNonStandardGameVersion)) {
    parts.push(`游戏版本 ${v.gameVersions.join('、')}`)
  }
  if (v.downloads > 0) parts.push(`下载 ${downloadCount(v.downloads)}次`)
  parts.push(`更新于 ${formatRelativeTime(v.datePublished)}`)
  const release = releaseLabel(v)
  if (release) parts.push(release)
  return parts.join('，')
}

/** 依赖条目的类型标签（只显示一个分类标签）。 */
function dependencyTag(dep: ResourceProject): string {
  const raw = dep.displayCategories[0] ?? dep.categories[0] ?? ''
  return raw ? categoryLabel(raw) : ''
}

/* ------------------------------ 操作 ------------------------------ */

/** 打开资源项目页（Modrinth 或 CurseForge）。 */
async function openWebsite() {
  const slug = project.value?.slug ?? props.projectId
  const url =
    project.value?.source === 'curseforge'
      ? curseForgeProjectUrl(props.resourceKind as ResourceKind, slug)
      : `https://modrinth.com/${props.resourceKind}/${encodeURIComponent(slug)}`
  try {
    await call('open_external', { url })
  } catch (e) {
    toast.error(`无法打开网页：${(e as Error).message}`)
  }
}

/** 打开 MC百科条目页（仅项目被收录时可用）。 */
async function openMcmodPage() {
  const url = mcInfo.value?.url
  if (!url) return
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

/** 点击前置资源 → 打开对应资源详情页（依赖条目可交互）。 */
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

/** 资源类型 → 可安装的内核内容目录（不含整合包 / 数据包）。 */
const INSTALL_KIND: Record<string, string> = {
  mod: 'mods',
  resourcepack: 'resourcepacks',
  shader: 'shaderpacks',
  world: 'saves',
}

/** 待安装版本 + 目标实例选择弹窗。 */
const installTarget = ref<ResourceVersion | null>(null)
const installing = ref(false)

/** 是否支持一键安装进实例。 */
function canInstall(): boolean {
  return props.resourceKind === 'modpack' || !!INSTALL_KIND[props.resourceKind]
}

/** 整合包安装中（新建实例，不需要选目标实例）。 */
const installingModpack = ref(false)

function requestInstall(v: ResourceVersion) {
  if (!v.fileUrl) return
  if (props.resourceKind === 'modpack') {
    void installModpack(v)
    return
  }
  installTarget.value = v
}

/** 整合包：确认后下载并按清单新建实例。 */
async function installModpack(v: ResourceVersion) {
  if (!v.fileUrl || installingModpack.value) return
  const name = project.value?.title ?? ''
  const ok = await confirmDialog({
    title: '安装整合包',
    message: `将下载整合包「${name}」并新建一个实例，随后可在大厅中启动。确定继续？`,
    confirmText: '安装',
  })
  if (!ok) return
  installingModpack.value = true
  try {
    await store.installModpackFromUrl(v.fileUrl, name || null)
  } finally {
    installingModpack.value = false
  }
}

/** 安装到所选实例（内核下载并落盘到对应目录）。 */
async function installTo(instanceId: string) {
  const version = installTarget.value
  if (!version) return
  installing.value = true
  try {
    await store.installResource(
      instanceId,
      INSTALL_KIND[props.resourceKind],
      version.fileUrl,
      version.fileName,
      null,
    )
    installTarget.value = null
  } finally {
    installing.value = false
  }
}

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
  void store.loadResourceDetail(props.projectId, props.resourceKind as ResourceKind)
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
  <div class="page-view active sub-page">
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
      <!-- 信息卡（资源条目 + 按钮行） -->
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
              <span class="resource-intro-title">{{ displayName.primary }}</span>
              <template v-if="displayName.secondary">
                <span class="resource-intro-divider">|</span>
                <span class="resource-intro-slug">{{ displayName.secondary }}</span>
              </template>
            </div>

            <div class="resource-intro-line">
              <span v-for="tag in introTags" :key="tag" class="resource-tag">
                {{ categoryLabel(tag) }}
              </span>
              <span class="resource-intro-desc">{{ project.description }}</span>
            </div>

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
          <button
            v-if="mcInfo?.url"
            type="button"
            class="btn-download btn-ghost with-icon"
            @click="openMcmodPage"
          >
            <AlxIcon name="external" :size="14" />
            <span>转到 MC百科</span>
          </button>
          <button type="button" class="btn-download search-submit" @click="openWebsite">
            转到 Modrinth
          </button>
          <button type="button" class="btn-download btn-ghost with-icon" @click="copyName">
            <AlxIcon name="copy" :size="14" />
            <span>复制名称</span>
          </button>
        </div>
      </section>

      <!-- 版本筛选卡：只有游戏版本一行 -->
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

      <!-- 版本卡 -->
      <section
        v-for="card in visibleCards"
        :key="card.key"
        class="resource-section-card version-card"
      >
        <button
          type="button"
          class="version-card-head"
          :aria-expanded="isCardOpen(card.key)"
          @click="toggleCard(card.key)"
        >
          <span class="version-card-title">{{ card.name }}</span>
          <AlxIcon
            name="chevron-down"
            :size="16"
            class="version-card-chevron"
            :class="{ open: isCardOpen(card.key) }"
          />
        </button>

        <div v-show="isCardOpen(card.key)" class="version-card-body">
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
                  <AlxIcon v-else name="package" :size="22" />
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

          <!-- 版本列表标题（有前置资源时显示） -->
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
                <img
                  :src="releaseIcon(v)"
                  :alt="releaseLabel(v) || '正式版'"
                  :title="releaseLabel(v) || '正式版'"
                  loading="lazy"
                />
              </div>
              <div class="version-file-main">
                <div class="version-file-title">
                  <span class="version-file-name">{{ versionTitle(v) }}</span>
                </div>
                <div class="version-file-info">{{ versionInfo(v) }}</div>
              </div>
              <button
                v-if="canInstall()"
                type="button"
                class="icon-btn version-file-download"
                :title="
                  props.resourceKind === 'modpack'
                    ? `安装整合包（新建实例，${v.fileName}）`
                    : `安装到实例（${v.fileName}）`
                "
                :disabled="installingModpack"
                @click.stop="requestInstall(v)"
              >
                <AlxIcon name="plus" :size="16" />
              </button>
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

    <!-- 安装到实例：选择目标实例 -->
    <AlxModal
      :open="installTarget !== null"
      :title="`安装 ${installTarget?.fileName ?? ''}`"
      @close="installTarget = null"
    >
      <p class="mod-update-lead">选择要安装到的实例：</p>
      <div v-if="store.instances.length === 0" class="empty-state">
        <AlxIcon name="info" :size="28" />
        <span>还没有实例，请先创建一个版本</span>
      </div>
      <div v-else class="loader-picker-list">
        <button
          v-for="inst in store.instances"
          :key="inst.id"
          type="button"
          class="list-item loader-picker-item"
          :disabled="installing"
          @click="installTo(inst.id)"
        >
          <div class="item-info">
            <AlxIcon name="minecraft" :size="20" />
            <div class="item-title">{{ inst.name }}</div>
            <span class="item-meta">{{ inst.version }} · {{ inst.loader }}</span>
          </div>
          <AlxIcon name="chevron-right" :size="16" />
        </button>
      </div>
      <template #actions>
        <button type="button" class="btn-sub" @click="installTarget = null">取消</button>
      </template>
    </AlxModal>
  </div>
</template>
