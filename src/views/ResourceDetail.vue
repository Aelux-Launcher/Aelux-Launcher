<script setup lang="ts">
/**
 * 社区资源详情页（副页面，极简黑白新版设计）。
 *
 * 数据全部走 store.loadResourceDetail（Modrinth 项目详情 + 版本列表）：
 *   - 头部信息区：56px 大图标 / 标题 / 作者·下载量 / 分类 tag；
 *   - 正文：resourceDetailData.body 为 Markdown，暂以纯文本（pre-wrap）渲染；
 *   - 「版本列表」节：每条右侧「下载」按钮在内核下载管理就绪前仅提示。
 * props 由 App.vue 的舞台层按路由参数注入。
 */
import { computed, watch } from 'vue'
import { useAppStore } from '../stores/app'
import { toast } from '../lib/toast'
import type { ResourceVersion } from '../lib/types'
import PageHeader from '../components/PageHeader.vue'
import AlxIcon from '../components/AlxIcon.vue'

const props = defineProps<{
  resourceKind: string
  projectId: string
  title: string
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

// 进入页面（或切换项目）时拉取资源详情。
watch(
  () => props.projectId,
  (id) => {
    void store.loadResourceDetail(id)
  },
  { immediate: true },
)

const project = computed(() => store.resourceDetailData?.project ?? null)
const versions = computed(() => store.resourceDetailData?.versions ?? [])

/** 页头标题：优先取详情里的项目名，路由参数兜底。 */
const pageTitle = computed(() => project.value?.title || props.title || '资源详情')

/** 下载量 → `12.3 万` / `8,214`。 */
function fmtDownloads(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 万`
  return n.toLocaleString('zh-CN')
}

/** ISO 时间 → `2026/10/21`（本地时区日期）。 */
function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

/** 版本副文本：`游戏版本 · 加载器 · 发布日期`。 */
function versionInfo(v: ResourceVersion): string {
  const parts = [v.gameVersions[0] ?? '', v.loaders.join(', '), fmtDate(v.datePublished)]
  return parts.filter(Boolean).join(' · ')
}

/** 版本列表 key：加载器 + 游戏版本 + 版本 id。 */
function versionKey(v: ResourceVersion): string {
  return `${v.loaders[0] ?? ''}-${v.gameVersions[0] ?? ''}-${v.id}`
}

/** 版本「下载」：内核下载管理就绪前仅提示。 */
function handleDownload() {
  toast.info('资源下载将在内核下载管理就绪后开放')
}

/** 加载失败后重试（仅错误且无数据时展示入口）。 */
function retry() {
  void store.loadResourceDetail(props.projectId)
}
</script>

<template>
  <div class="page-view active sub-page">
    <PageHeader :title="pageTitle" />

    <!-- 加载中 -->
    <div v-if="store.resourceDetailLoading" class="loading-hint">正在加载资源详情…</div>

    <!-- 加载失败（成功后残留的旧错误不影响展示，故加 !resourceDetailData 条件） -->
    <div v-else-if="store.resourceError && !store.resourceDetailData" class="empty-state">
      <AlxIcon name="alert-circle" :size="32" />
      <span>加载失败：{{ store.resourceError }}</span>
      <button type="button" class="btn-download btn-ghost" @click="retry">重试</button>
    </div>

    <!-- 无数据 -->
    <div v-else-if="!store.resourceDetailData" class="empty-state">
      <AlxIcon name="info" :size="32" />
      <span>暂无资源数据</span>
    </div>

    <template v-else>
      <!-- 头部信息区 -->
      <div>
        <div style="display: flex; align-items: center; gap: 16px">
          <div class="item-icon" style="width: 56px; height: 56px">
            <img v-if="project?.iconUrl" :src="project.iconUrl" alt="" />
            <AlxIcon v-else :name="KIND_ICON[resourceKind] ?? 'package'" :size="26" />
          </div>
          <div style="flex: 1; min-width: 0">
            <div class="item-title" style="font-size: 17px">{{ project?.title ?? title }}</div>
            <div class="item-desc">
              {{ project?.author ? `作者 ${project.author} · ` : '' }}下载量
              {{ fmtDownloads(project?.downloads ?? 0) }}
            </div>
          </div>
        </div>
        <div
          v-if="KIND_TITLE[resourceKind] || (project && project.categories.length > 0)"
          style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px"
        >
          <span v-if="KIND_TITLE[resourceKind]" class="tag">{{ KIND_TITLE[resourceKind] }}</span>
          <span v-for="c in project?.categories" :key="c" class="tag">{{ c }}</span>
        </div>
        <p
          v-if="project?.description"
          style="margin: 12px 0 0; font-size: 13px; line-height: 1.7; color: var(--text-sub)"
        >
          {{ project.description }}
        </p>
      </div>

      <!-- 详细介绍：Markdown 暂以纯文本渲染，等待解析能力接入后升级 -->
      <div class="section-title">详细介绍</div>
      <div
        v-if="store.resourceDetailData.body"
        style="white-space: pre-wrap; font-size: 13px; line-height: 1.7; color: var(--text-main)"
      >{{ store.resourceDetailData.body }}</div>
      <div v-else class="empty-state"><span>该项目暂无详细介绍。</span></div>

      <!-- 版本列表 -->
      <div class="section-title">版本列表</div>
      <div v-if="versions.length === 0" class="empty-state">
        <span>该项目暂无可安装的版本。</span>
      </div>
      <template v-else>
        <div v-for="v in versions" :key="versionKey(v)" class="list-item">
          <div class="item-left">
            <div class="item-icon"><AlxIcon name="package" :size="20" /></div>
            <div class="item-info">
              <div class="item-title">{{ v.versionNumber }}</div>
              <div class="item-desc">{{ versionInfo(v) }}</div>
            </div>
          </div>
          <div class="item-right">
            <button type="button" class="btn-download btn-ghost" @click="handleDownload">下载</button>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
