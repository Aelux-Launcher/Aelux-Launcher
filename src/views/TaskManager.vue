<script setup lang="ts">
/**
 * 下载状态页（副页面，/tasks）：只展示本次下载/安装的进度。
 *
 * 布局参考同类启动器的任务窗口，但按本启动器的极简黑白风格重做：
 *   左栏 = 总进度 / 下载速度 / 剩余文件；
 *   右栏 = 本次安装的步骤清单（已完成打勾、下载中显示百分比、等待中为省略号）。
 * 数据全部来自 store 的 downloadState / installing / installError。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useAppStore } from '../stores/app'
import type { DownloadTaskState } from '../lib/types'
import AlxIcon from '../components/AlxIcon.vue'

const store = useAppStore()

/** 用户主动取消后的状态（用于区分「失败」与「已取消」）。 */
const isCancelled = computed(() => store.cancelRequested && !store.installing)

/** 下载任务清单。 */
const tasks = computed(() => store.downloadState?.tasks ?? [])

/** 剩余文件数（等待 + 下载中）。 */
const remainingFiles = computed(
  () => tasks.value.filter((t) => t.status === 'pending' || t.status === 'downloading').length,
)

/** 已接收 / 总字节（总大小未知的任务不计入总进度）。 */
const receivedBytes = computed(() => tasks.value.reduce((sum, t) => sum + Math.max(0, t.received), 0))
const totalBytes = computed(() => tasks.value.reduce((sum, t) => sum + (t.total > 0 ? t.total : 0), 0))

/** 总进度：有总大小时按字节算，成功结束时固定 100%（失败不显示 100%）。 */
const overallPct = computed(() => {
  if (store.downloadState.finished && store.downloadState.failed === 0) return 100
  if (totalBytes.value <= 0) return 0
  return Math.min(100, Math.round((receivedBytes.value / totalBytes.value) * 100))
})

/** 标题：正在安装的版本名。 */
const jobTitle = computed(() => (store.installing ? `${store.installing} 安装` : '下载任务'))

/* ------------------------------ 启动进度 ------------------------------ */

/** 启动阶段（与内核 LaunchProgress.stage 一一对应）。 */
const LAUNCH_STAGES = [
  { stage: 'prepare', label: '准备启动' },
  { stage: 'version', label: '读取版本信息' },
  { stage: 'natives', label: '补齐 natives' },
  { stage: 'files', label: '检查 / 补全文件' },
  { stage: 'auth', label: '验证账户' },
  { stage: 'java', label: '准备 Java' },
  { stage: 'classpath', label: '组装启动参数' },
  { stage: 'spawn', label: '启动游戏进程' },
] as const

const launch = computed(() => store.launchProgress)

const launchFailed = computed(() => !!launch.value?.done && !!launch.value?.error)

/** 启动中显示；启动完成后只在没有下载任务时保留结果。 */
const showLaunchPanel = computed(
  () => !!launch.value && (store.launchActive || (launch.value.done && tasks.value.length === 0)),
)

const launchPct = computed(() => {
  const state = launch.value
  if (!state) return 0
  if (state.done && !state.error) return 100
  if (state.total <= 0) return 0
  return Math.min(100, Math.round((state.current / state.total) * 100))
})

const launchTargetName = computed(() => {
  const id = launch.value?.instanceId
  return store.instances.find((i) => i.id === id)?.name ?? id ?? ''
})

/** 阶段状态：当前阶段高亮，之前的打勾。 */
function launchStageClass(index: number): string {
  const state = launch.value
  if (!state) return 'pending'
  if (state.done) {
    if (state.error) return index < state.current ? 'done' : 'pending'
    return 'done'
  }
  if (index < state.current) return 'done'
  if (index === state.current) return 'downloading'
  return 'pending'
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

/* ------------------------------ 下载速度 ------------------------------ */

/** 每秒采样一次已接收字节，计算瞬时速度（内核暂未直接上报速度）。 */
const speed = ref(0)
let speedTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  let lastReceived = receivedBytes.value
  let lastAt = performance.now()
  speedTimer = setInterval(() => {
    const now = performance.now()
    const current = receivedBytes.value
    const seconds = (now - lastAt) / 1000
    speed.value = seconds > 0 ? Math.max(0, (current - lastReceived) / seconds) : 0
    lastReceived = current
    lastAt = now
  }, 1000)
})

onUnmounted(() => {
  if (speedTimer) clearInterval(speedTimer)
})

/** 速度文案（没有流量时显示占位符）。 */
const speedLabel = computed(() => (speed.value > 0 ? `${human(speed.value)}/s` : '—'))
</script>

<template>
  <div class="page-view active sub-page">
    <!-- 启动进度：PCL 式的阶段清单，失败时在面板内保留错误信息 -->
    <div v-if="showLaunchPanel" class="task-status-layout">
      <aside class="task-stats">
        <div class="task-stat">
          <div class="task-stat-label">启动进度</div>
          <div class="task-stat-value">{{ launchFailed ? '失败' : `${launchPct} %` }}</div>
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: `${launchPct}%` }" />
          </div>
        </div>
        <div class="task-stat">
          <div class="task-stat-label">当前步骤</div>
          <div class="task-stat-value">{{ launch?.message || '准备中' }}</div>
        </div>
        <div class="task-stat">
          <div class="task-stat-label">启动实例</div>
          <div class="task-stat-value">{{ launchTargetName }}</div>
        </div>
        <div v-if="tasks.length > 0" class="task-stat">
          <div class="task-stat-label">文件下载</div>
          <div class="task-stat-value">{{ overallPct }} %</div>
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: `${overallPct}%` }" />
          </div>
        </div>
      </aside>

      <section class="task-panel">
        <div class="task-panel-head">
          <span class="task-panel-title">启动进度</span>
          <div class="task-panel-actions">
            <span class="tag">
              {{ launchFailed ? '启动失败' : store.launchActive ? '启动中' : '已启动' }}
            </span>
          </div>
        </div>

        <div v-if="launchFailed" class="install-error-card task-launch-error">
          <AlxIcon name="alert-circle" :size="22" />
          <div class="install-error-body">
            <div class="install-error-title">启动失败</div>
            <div class="install-error-text">{{ launch?.error }}</div>
          </div>
        </div>

        <div class="task-step-list">
          <div
            v-for="(s, i) in LAUNCH_STAGES"
            :key="s.stage"
            class="task-step"
            :class="launchStageClass(i + 1)"
          >
            <span class="task-step-mark">
              <AlxIcon
                :name="launchStageClass(i + 1) === 'done' ? 'check' : 'more-horizontal'"
                :size="14"
              />
            </span>
            <span class="task-step-name">{{ s.label }}</span>
          </div>
        </div>
      </section>
    </div>

    <!-- 失败提示：安装/下载失败后保留错误信息，不再只依赖一次性 toast -->
    <div v-if="store.installError && !store.installing" class="install-error-card">
      <AlxIcon :name="isCancelled ? 'x' : 'alert-circle'" :size="22" />
      <div class="install-error-body">
        <div class="install-error-title">{{ isCancelled ? '下载已取消' : '下载失败' }}</div>
        <div class="install-error-text">{{ store.installError }}</div>
      </div>
      <button type="button" class="btn-download" @click="store.setView('download')">
        返回下载页重试
      </button>
    </div>

    <!-- 空态：安装刚开始时任务清单还没生成，先显示准备中 -->
    <div v-if="tasks.length === 0 && !showLaunchPanel" class="empty-state">
      <AlxIcon v-if="store.installError" name="alert-circle" :size="32" />
      <AlxIcon v-else name="download" :size="32" />
      <div v-if="store.installing">正在准备 {{ store.installing }} 的下载任务…</div>
      <template v-else-if="store.installError">
        <div>本次下载没有产生任何文件</div>
        <div>请按上方错误信息检查网络或配置后重试。</div>
      </template>
      <template v-else>
        <div>暂无下载任务</div>
        <div>下载游戏版本或社区资源时，进度会显示在这里。</div>
      </template>
    </div>

    <!-- 下载状态：左栏统计 + 右栏步骤清单 -->
    <div v-else class="task-status-layout">
      <aside class="task-stats">
        <div class="task-stat">
          <div class="task-stat-label">总进度</div>
          <div class="task-stat-value">{{ overallPct }} %</div>
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: `${overallPct}%` }" />
          </div>
        </div>
        <div class="task-stat">
          <div class="task-stat-label">下载速度</div>
          <div class="task-stat-value">{{ speedLabel }}</div>
        </div>
        <div class="task-stat">
          <div class="task-stat-label">剩余文件</div>
          <div class="task-stat-value">{{ remainingFiles }}</div>
        </div>
      </aside>

      <section class="task-panel">
        <div class="task-panel-head">
          <span class="task-panel-title">{{ jobTitle }}</span>
          <div class="task-panel-actions">
            <span class="tag">
              {{
                isCancelled
                  ? '已取消'
                  : store.downloadState.failed > 0
                    ? '已失败'
                    : store.downloadState.finished
                      ? '已完成'
                      : '进行中'
              }}
            </span>
            <button
              v-if="!store.downloadState.finished"
              type="button"
              class="btn-download btn-ghost task-cancel-btn"
              @click="store.cancelDownload()"
            >
              取消下载
            </button>
          </div>
        </div>

        <div class="task-step-list">
          <div v-for="t in tasks" :key="t.id" class="task-step" :class="t.status">
            <span class="task-step-mark">
              <AlxIcon v-if="t.status === 'done'" name="check" :size="14" />
              <AlxIcon v-else-if="t.status === 'failed'" name="x" :size="14" />
              <span v-else-if="t.status === 'downloading'" class="task-step-pct">{{ pct(t) }}%</span>
              <AlxIcon v-else name="more-horizontal" :size="14" />
            </span>
            <span class="task-step-name" :title="t.name">{{ t.name }}</span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
