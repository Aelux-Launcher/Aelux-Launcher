<script setup lang="ts">
/**
 * 版本详情页（副页面，原版下载二级页）：
 *   顶部卡片 = 返回 + 版本图标 + 版本号；下方加载器行（可展开看版本列表）；
 *   底部「开始下载」执行原版安装（任务进度见任务管理页）。
 * 不做「已安装」禁用：同版本可反复下载，最多是命名问题。
 * props 由 App.vue 的舞台层按路由参数注入。
 */
import { computed, ref } from 'vue'
import { useAppStore } from '../stores/app'
import { toast } from '../lib/toast'
import { call } from '../lib/bridge'
import AlxIcon from '../components/AlxIcon.vue'

const props = defineProps<{ versionId: string }>()

const store = useAppStore()

/** 可叠加的加载器（安装仍走原版管线，加载器自动安装接入前仅展示版本列表）。 */
const LOADERS = [
  { key: 'forge', name: 'Forge', icon: 'forge' },
  { key: 'neoforge', name: 'NeoForge', icon: 'neoforge' },
  { key: 'fabric', name: 'Fabric', icon: 'fabric' },
  { key: 'quilt', name: 'Quilt', icon: 'quilt' },
  { key: 'optifine', name: 'OptiFine', icon: 'optifine' },
] as const

type LoaderKey = (typeof LOADERS)[number]['key']

/** 展开状态（PCL 式：点击加载器行展开其版本列表）。 */
const expandedLoaders = ref(new Set<string>())
const selectedVersions = ref<Partial<Record<LoaderKey, string>>>({})
const modApiAuto = ref<Record<'fabric' | 'quilt', boolean>>({ fabric: true, quilt: true })

type PrimaryLoaderKey = Exclude<LoaderKey, 'optifine'>

const primarySelection = computed(() =>
  (['forge', 'neoforge', 'fabric', 'quilt'] as PrimaryLoaderKey[]).find((key) => selectedVersions.value[key]),
)

/** OptiFine 仅在较早版本的安装流程中展示；高版本统一标记为不可添加。 */
const optiFineSupported = computed(() => {
  const [major, minor] = props.versionId.split('.').map(Number)
  return major === 1 && Number.isFinite(minor) && minor <= 16
})

/** 加载器显示名（包名后缀用正式写法）。 */
const LOADER_NAMES: Record<LoaderKey, string> = {
  forge: 'Forge',
  neoforge: 'NeoForge',
  fabric: 'Fabric',
  quilt: 'Quilt',
  optifine: 'OptiFine',
}

/**
 * 包名 = 版本号-加载器_加载器版本（如 `1.21.4-Forge_54.1.17`，Fabric 为 `26.3-Fabric_0.20.1`）。
 * 未选加载器时就是纯版本号；该名字同时作为实例 / 文件夹名。
 */
const packageName = computed(() => {
  const parts: string[] = [props.versionId]
  const primary = primarySelection.value
  const primaryVersion = primary ? selectedVersions.value[primary] : undefined
  if (primary && primaryVersion) parts.push(`${LOADER_NAMES[primary]}_${primaryVersion}`)
  const optifineVersion = selectedVersions.value.optifine
  if (optifineVersion) parts.push(`OptiFine_${optifineVersion}`)
  return parts.join('-')
})

function isUnavailable(key: LoaderKey): boolean {
  if (key === 'optifine') return !optiFineSupported.value
  return Boolean(primarySelection.value && primarySelection.value !== key)
}

/** 该加载器组的加载状态（store 缓存按 `loader:mcVersion` 维度）。 */
function loaderState(key: LoaderKey) {
  return store.loaderVersions[`${key}:${props.versionId}`]
}

function toggleLoader(key: LoaderKey) {
  if (isUnavailable(key)) return
  const s = expandedLoaders.value
  if (s.has(key)) {
    s.delete(key)
  } else {
    s.add(key)
    void store.loadLoaderVersions(key, props.versionId)
  }
}

/** 加载器行右侧提示文案。 */
function loaderHint(key: LoaderKey): string {
  const selected = selectedVersions.value[key]
  if (selected) return selected
  if (isUnavailable(key)) return key === 'optifine' ? '此版本不建议使用' : '与已选加载器不兼容'
  const st = loaderState(key)
  if (!st) return '可以添加'
  if (st.loading) return '加载中…'
  if (st.error) return '加载失败'
  return '可以添加'
}

/** 点击版本行即完成选择；Forge / NeoForge / Fabric 互斥。 */
function selectLoaderVersion(loader: LoaderKey, version: string) {
  if (isUnavailable(loader)) return
  const next = { ...selectedVersions.value, [loader]: version }
  if (loader !== 'optifine') {
    for (const primary of ['forge', 'neoforge', 'fabric', 'quilt'] as PrimaryLoaderKey[]) {
      if (primary !== loader) delete next[primary]
    }
    if (loader !== 'fabric' && loader !== 'quilt') {
      modApiAuto.value = { fabric: false, quilt: false }
    }
  }
  selectedVersions.value = next
  expandedLoaders.value = new Set()
}

function clearLoader(loader: LoaderKey) {
  const next = { ...selectedVersions.value }
  delete next[loader]
  selectedVersions.value = next
  if (loader === 'fabric' || loader === 'quilt') modApiAuto.value = { ...modApiAuto.value, [loader]: false }
}

function hasModApi(loader: LoaderKey): loader is 'fabric' | 'quilt' {
  return loader === 'fabric' || loader === 'quilt'
}

function apiLabel(loader: LoaderKey) {
  return loader === 'fabric' ? 'Fabric API' : 'Quilt Standard Libraries'
}

function apiEnabled(loader: LoaderKey) {
  return hasModApi(loader) && modApiAuto.value[loader]
}

function toggleModApi(loader: LoaderKey) {
  if (!hasModApi(loader)) return
  modApiAuto.value = { ...modApiAuto.value, [loader]: !modApiAuto.value[loader] }
}

function openLoaderChangelog(loader: LoaderKey) {
  const urls: Record<LoaderKey, string> = {
    forge: 'https://files.minecraftforge.net/',
    neoforge: 'https://neoforged.net/',
    fabric: 'https://fabricmc.net/develop/',
    quilt: 'https://quiltmc.org/',
    optifine: 'https://optifine.net/changelog',
  }
  void call('open_external', { url: urls[loader] }).catch(() => toast.error('无法打开更新日志'))
}

const installing = computed(() => store.installing !== null)

function goBack() {
  store.pageBack()
}

/** 开始下载：安装原版核心，成功 / 失败均给反馈；实例名即包名。 */
async function startDownload() {
  const loader = primarySelection.value ?? (selectedVersions.value.optifine ? 'optifine' : 'vanilla')
  await store.installVersion(props.versionId, { name: packageName.value, loader })
  const err = store.installError
  if (err) toast.error(`安装失败：${err}`)
  else toast.success(`已下载 ${packageName.value}，可在「启动」页一键启动`)
}
</script>

<template>
  <div class="page-view active sub-page version-detail-page">
    <!-- 可滚动内容与固定操作区分离：展开大量版本时，主按钮始终可见。 -->
    <div class="version-detail-scroll">
      <!-- 顶部：返回 + 版本号 -->
      <div class="version-hero">
        <button type="button" class="icon-btn" title="返回" @click="goBack">
          <AlxIcon name="arrow-left" :size="18" />
        </button>
        <div class="item-icon">
          <AlxIcon name="minecraft" :size="24" />
        </div>
        <div class="version-hero-name">{{ packageName }}</div>
      </div>

      <!-- 加载器列表（可展开） -->
      <div
        v-for="l in LOADERS"
        :key="l.key"
        class="loader-group"
        :class="{ open: expandedLoaders.has(l.key), selected: !!selectedVersions[l.key], unavailable: isUnavailable(l.key) }"
      >
        <button type="button" class="loader-item" :disabled="isUnavailable(l.key)" @click="toggleLoader(l.key)">
          <AlxIcon :name="l.icon" :size="22" class="loader-brand-icon" />
          <span class="loader-name">{{ l.name }}</span>
          <span class="loader-hint">{{ loaderHint(l.key) }}</span>
          <AlxIcon
            v-if="selectedVersions[l.key]"
            name="x"
            :size="18"
            class="loader-cancel-icon"
            title="取消选择"
            @click.stop="clearLoader(l.key)"
          />
          <AlxIcon name="chevron-right" :size="18" class="loader-chevron" />
        </button>
        <div class="loader-expand">
          <div class="loader-expand-inner" :inert="!expandedLoaders.has(l.key)">
            <div v-if="loaderState(l.key)?.loading" class="loading-hint">正在获取版本列表…</div>
            <div v-else-if="loaderState(l.key)?.error" class="loader-expand-empty">
              加载失败：{{ loaderState(l.key)?.error }}
            </div>
            <div v-else-if="(loaderState(l.key)?.versions.length ?? 0) === 0" class="loader-expand-empty">
              暂无可用的{{ l.name }}版本
            </div>
            <template v-else>
              <div
                v-for="lv in loaderState(l.key)?.versions"
                :key="lv"
                :class="['list-item', 'loader-version-row', selectedVersions[l.key] === lv && 'selected']"
                role="button"
                tabindex="0"
                @click="selectLoaderVersion(l.key, lv)"
                @keydown.enter="selectLoaderVersion(l.key, lv)"
              >
                <div class="item-info">
                  <AlxIcon :name="l.icon" :size="19" class="loader-version-icon" />
                  <div class="item-title">{{ lv }}</div>
                </div>
                <div class="loader-row-actions">
                  <button type="button" class="icon-btn" title="另存为（下载功能接入后可用）" disabled>
                    <AlxIcon name="folder" :size="16" />
                  </button>
                  <button type="button" class="icon-btn" title="更新日志" @click.stop="openLoaderChangelog(l.key)">
                    <AlxIcon name="info" :size="16" />
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>
        <button
          v-if="(l.key === 'fabric' || l.key === 'quilt') && selectedVersions[l.key]"
          type="button"
          class="fabric-api-choice"
          :class="{ selected: apiEnabled(l.key) }"
          @click="toggleModApi(l.key)"
        >
          <AlxIcon :name="l.icon" :size="18" />
          <span>{{ apiLabel(l.key) }}</span>
          <span class="fabric-api-hint">{{ apiEnabled(l.key) ? '自动选择最新兼容版 · 下载到 mods' : '不安装' }}</span>
          <AlxIcon v-if="apiEnabled(l.key)" name="check" :size="16" />
        </button>
      </div>
    </div>

    <!-- 底部动作 -->
    <div class="version-actions">
      <button type="button" class="version-start-btn" :disabled="installing" @click="startDownload">
        <AlxIcon name="download" :size="18" />
        {{ installing ? '下载中…' : '开始下载' }}
      </button>
    </div>
  </div>
</template>
