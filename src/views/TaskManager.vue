<script setup lang="ts">
/**
 * 任务管理（副页面）：下载任务 + 启动日志。
 *
 * 数据全部来自 store（downloadState / launchLogs），这里只做展示；
 * 下载进度由 store 的安装流程实时写入，启动日志由 pushLaunchLog 追加。
 */
import { computed } from 'vue'
import { useAppStore } from '../stores/app'
import type { DownloadTaskState } from '../lib/types'
import AlxIcon from '../components/AlxIcon.vue'
import PageHeader from '../components/PageHeader.vue'

const store = useAppStore()

/** 下载任务清单。 */
const tasks = computed(() => store.downloadState?.tasks ?? [])

/** 任务状态 → 中文文案。 */
const STATUS_LABEL: Record<DownloadTaskState['status'], string> = {
  pending: '等待中',
  downloading: '下载中',
  done: '已完成',
  failed: '失败',
}

/** 把字节数转成人话。 */
function human(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/** 任务进度百分比（总大小未知时为 0）。 */
function pct(t: DownloadTaskState): number {
  return t.total > 0 ? Math.min(100, Math.round((t.received / t.total) * 100)) : 0
}

/** 任务副文案：失败原因 / 已传字节 / 排队提示。 */
function taskDesc(t: DownloadTaskState): string {
  if (t.status === 'failed') return t.error ?? '下载失败'
  if (t.status === 'done') return t.total > 0 ? human(t.total) : '下载完成'
  if (t.total > 0) return `${human(t.received)} / ${human(t.total)}`
  return '等待中 = 排队中'
}
</script>

<template>
  <div class="page-view active sub-page">
    <PageHeader title="任务管理">
      <button
        v-if="tasks.length > 0"
        type="button"
        class="btn-download btn-ghost"
        @click="store.setView('download')"
      >
        前往下载页
      </button>
    </PageHeader>

    <div class="section-title">下载任务</div>

    <!-- 汇总行：完成 / 失败 / 等待 -->
    <div v-if="tasks.length > 0" style="display: flex; gap: 8px; margin-bottom: 12px">
      <span class="tag">完成 {{ store.downloadState.done }}</span>
      <span class="tag">失败 {{ store.downloadState.failed }}</span>
      <span class="tag">等待 {{ store.downloadState.pending }}</span>
    </div>

    <!-- 空态 -->
    <div v-if="tasks.length === 0" class="empty-state">
      <AlxIcon name="download" :size="32" />
      <div>暂无下载任务</div>
      <div>下载游戏版本或社区资源时，任务会显示在这里。</div>
    </div>

    <!-- 任务列表 -->
    <template v-else>
      <div v-for="t in tasks" :key="t.id" class="list-item">
        <div class="item-left" style="flex: 1; min-width: 0">
          <div class="item-info" style="flex: 1">
            <div class="item-title">{{ t.name }}</div>
            <div class="item-desc">{{ taskDesc(t) }}</div>
            <!-- 小型进度条：等待中为 0%，完成后为 100% -->
            <div class="progress-track" style="width: 220px; margin-top: 8px">
              <div class="progress-fill" :style="{ width: `${pct(t)}%` }" />
            </div>
          </div>
        </div>
        <div class="item-right">
          <span class="tag">{{ STATUS_LABEL[t.status] }}</span>
        </div>
      </div>
    </template>

    <div class="section-title">启动日志</div>

    <!-- 清空按钮（无日志时禁用） -->
    <div style="display: flex; justify-content: flex-end; margin-bottom: 8px">
      <button
        type="button"
        class="btn-download btn-ghost"
        :disabled="store.launchLogs.length === 0"
        @click="store.clearLaunchLogs()"
      >
        清空
      </button>
    </div>

    <div v-if="store.launchLogs.length === 0" class="empty-state">
      <AlxIcon name="info" :size="32" />
      <div>暂无启动日志，启动游戏后相关记录会显示在这里。</div>
    </div>
    <div v-else class="setting-group" style="padding: 12px 16px">
      <div
        v-for="(line, i) in store.launchLogs"
        :key="i"
        :style="{
          fontFamily: 'var(--aelux-font-mono)',
          fontSize: '12px',
          lineHeight: '1.8',
          color: 'var(--text-sub)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }"
      >
        {{ line }}
      </div>
    </div>
  </div>
</template>
