<script setup lang="ts">
/**
 * 版本详情页（副页面，原版下载二级页）：
 *   顶部卡片 = 返回 + 版本图标 + 版本号；下方加载器行（可添加）；
 *   底部「开始下载」执行原版安装（任务进度见任务管理页）。
 * props 由 App.vue 的舞台层按路由参数注入。
 */
import { computed } from 'vue'
import { useAppStore } from '../stores/app'
import { toast } from '../lib/toast'
import AlxIcon from '../components/AlxIcon.vue'

const props = defineProps<{ versionId: string }>()

const store = useAppStore()

/** 可叠加的加载器（内核加载器自动安装就绪前仅提示）。 */
const LOADERS = ['Forge', 'NeoForge', 'Fabric', 'OptiFine'] as const

/** 该版本是否已有同名实例（version 与版本 id 一致即视为已安装）。 */
const installed = computed(() => store.instances.some((i) => i.version === props.versionId))

/** 安装中（任意版本安装期间全局互斥）。 */
const installing = computed(() => store.installing !== null)

function goBack() {
  store.pageBack()
}

function pickLoader(name: string) {
  toast.info(`${name} 自动安装开发中，当前可先下载原版核心`)
}

/** 开始下载：安装原版核心，成功 / 失败均给反馈。 */
async function startDownload() {
  await store.installVersion(props.versionId)
  const err = store.installError
  if (err) toast.error(`安装失败：${err}`)
  else toast.success(`已安装 ${props.versionId}，可在「启动」页一键启动`)
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

    <!-- 加载器列表 -->
    <button
      v-for="name in LOADERS"
      :key="name"
      type="button"
      class="loader-item"
      @click="pickLoader(name)"
    >
      <span class="loader-name">{{ name }}</span>
      <span class="loader-hint">可以添加</span>
      <AlxIcon name="chevron-right" :size="18" class="loader-chevron" />
    </button>

    <!-- 底部动作 -->
    <div class="version-actions">
      <button
        type="button"
        class="version-start-btn"
        :class="installed ? 'btn-ghost' : ''"
        :disabled="installed || installing"
        @click="startDownload"
      >
        <AlxIcon :name="installed ? 'check' : 'download'" :size="18" />
        {{ installed ? '已安装' : installing ? '下载中…' : '开始下载' }}
      </button>
    </div>
  </div>
</template>
