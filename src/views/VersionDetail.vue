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
import AlxIcon from '../components/AlxIcon.vue'

const props = defineProps<{ versionId: string }>()

const store = useAppStore()

/** 可叠加的加载器（安装仍走原版管线，加载器自动安装接入前仅展示版本列表）。 */
const LOADERS = [
  { key: 'forge', name: 'Forge' },
  { key: 'neoforge', name: 'NeoForge' },
  { key: 'fabric', name: 'Fabric' },
  { key: 'optifine', name: 'OptiFine' },
] as const

type LoaderKey = (typeof LOADERS)[number]['key']

/** 展开状态（PCL 式：点击加载器行展开其版本列表）。 */
const expandedLoaders = ref(new Set<string>())

/** 该加载器组的加载状态（store 缓存按 `loader:mcVersion` 维度）。 */
function loaderState(key: LoaderKey) {
  return store.loaderVersions[`${key}:${props.versionId}`]
}

function toggleLoader(key: LoaderKey) {
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
  const st = loaderState(key)
  if (!st) return '可以添加'
  if (st.loading) return '加载中…'
  if (st.error) return '加载失败'
  return `${st.versions.length} 个版本`
}

/** 下载指定加载器版本（内核加载器安装管线接入前提示）。 */
function installLoader(loaderName: string, loaderVersion: string) {
  toast.info(`${loaderName} ${loaderVersion} 的自动安装即将开放，当前可先下载原版核心`)
}

const installing = computed(() => store.installing !== null)

function goBack() {
  store.pageBack()
}

/** 开始下载：安装原版核心，成功 / 失败均给反馈。 */
async function startDownload() {
  await store.installVersion(props.versionId)
  const err = store.installError
  if (err) toast.error(`安装失败：${err}`)
  else toast.success(`已下载 ${props.versionId}，可在「启动」页一键启动`)
}
</script>

<template>
  <div class="page-view active sub-page">
    <!-- 顶部：返回 + 版本号 -->
    <div class="version-hero">
      <button type="button" class="icon-btn" title="返回" @click="goBack">
        <AlxIcon name="arrow-left" :size="18" />
      </button>
      <div class="item-icon">
        <AlxIcon name="columns" :size="24" />
      </div>
      <div class="version-hero-name">{{ versionId }}</div>
    </div>

    <!-- 加载器列表（可展开） -->
    <div
      v-for="l in LOADERS"
      :key="l.key"
      class="loader-group"
      :class="{ open: expandedLoaders.has(l.key) }"
    >
      <button type="button" class="loader-item" @click="toggleLoader(l.key)">
        <span class="loader-name">{{ l.name }}</span>
        <span class="loader-hint">{{ loaderHint(l.key) }}</span>
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
              class="list-item loader-version-row"
            >
              <div class="item-info">
                <div class="item-title">{{ lv }}</div>
              </div>
              <div class="item-right">
                <button type="button" class="btn-download" @click="installLoader(l.name, lv)">添加</button>
              </div>
            </div>
          </template>
        </div>
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
