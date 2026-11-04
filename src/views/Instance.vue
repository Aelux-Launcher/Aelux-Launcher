<script setup lang="ts">
/**
 * 实例设置子页（版本设置，从主页「版本设置」或版本选择页进入）。
 *
 * 页头右侧五个标签：概览 / 设置 / 修改 / Mod 管理 / 导出，
 * 按当前标签渲染对应面板（InstancePanels.vue 分发）。
 *
 * 实例设置（Java、内存、服务器、高级选项）由 store 的
 * loadInstanceSettings / updateInstanceSettings 负责持久化，
 * 视图只通过回调读写；外观偏好走 instanceMeta 的本地 KV。
 */
import { computed, ref, watch } from 'vue'
import { useAppStore } from '../stores/app'
import type { GameInstance, InstanceTab } from '../lib/types'
import PageHeader from '../components/PageHeader.vue'
import AlxIcon from '../components/AlxIcon.vue'
import InstancePanels from './InstancePanels.vue'
import {
  DEFAULT_INSTANCE_UI,
  fallbackInstanceSettings,
  loadInstanceUiMap,
  saveInstanceUi,
  type InstanceSettings,
  type InstanceUi,
} from './instanceMeta'

const props = defineProps<{ instanceId: string; tab: string }>()

const store = useAppStore()

/** 页头右侧的五个标签，顺序与上游一致：概览 → 设置 → 修改 → Mod 管理 → 导出。 */
const TABS: { key: InstanceTab; title: string }[] = [
  { key: 'overall', title: '概览' },
  { key: 'setup', title: '设置' },
  { key: 'modify', title: '修改' },
  { key: 'mod', title: 'Mod 管理' },
  { key: 'export', title: '导出' },
]

/** 外观偏好（图标 / 分类 / 收藏等）。 */
const ui = ref<InstanceUi>({ ...DEFAULT_INSTANCE_UI })

// 进入实例页时读取该实例的设置。
watch(
  () => props.instanceId,
  (id) => {
    void store.loadInstanceSettings(id)
  },
  { immediate: true },
)

// 读取该实例的外观偏好（图标 / 分类 / 收藏等）。
watch(
  () => props.instanceId,
  (id, _prev, onCleanup) => {
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    void loadInstanceUiMap().then((map) => {
      if (cancelled) return
      ui.value = { ...DEFAULT_INSTANCE_UI, ...(map[id] ?? {}) }
    })
  },
  { immediate: true },
)

const instance = computed<GameInstance | undefined>(() =>
  store.instances.find((i) => i.id === props.instanceId),
)

/** 兜底后的实例设置（控件不会拿到 undefined）。 */
const settings = computed<InstanceSettings>(() =>
  fallbackInstanceSettings(store.instanceSettings[props.instanceId] as Partial<InstanceSettings>),
)

/** 写回实例设置（store 负责校验与落盘）。 */
function patch(p: Partial<InstanceSettings>) {
  void store.updateInstanceSettings(props.instanceId, p as Record<string, unknown>)
}

/** 写回外观偏好。 */
function setUi(p: InstanceUi) {
  ui.value = { ...ui.value, ...p }
  void saveInstanceUi(props.instanceId, p)
}

/** 切换标签（同一副页面内换内容，不动页面栈）。 */
function setTab(key: string) {
  store.setInstanceTab(key as InstanceTab)
}
</script>

<template>
  <div class="page-view active sub-page">
    <!-- 页头：标题 + 右侧标签切换 -->
    <PageHeader :title="instance ? `版本设置 - ${instance.name}` : '版本设置'">
      <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end">
        <button
          v-for="t in TABS"
          :key="t.key"
          type="button"
          :class="tab === t.key ? 'btn-sub active' : 'btn-sub'"
          :style="tab === t.key ? { borderColor: 'var(--text-main)', fontWeight: 600 } : undefined"
          @click="setTab(t.key)"
        >
          {{ t.title }}
        </button>
      </div>
    </PageHeader>

    <!-- 实例不存在（可能已被删除） -->
    <div v-if="!instance" class="empty-state">
      <AlxIcon name="alert-circle" :size="32" />
      <span>实例不存在</span>
    </div>

    <InstancePanels
      v-else
      :tab="tab"
      :instance="instance"
      :settings="settings"
      :patch="patch"
      :ui="ui"
      :set-ui="setUi"
    />
  </div>
</template>
