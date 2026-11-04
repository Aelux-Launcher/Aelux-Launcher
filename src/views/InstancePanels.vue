<script setup lang="ts">
/**
 * 「版本设置」子页的面板分发：
 * 按当前标签渲染 概览 / 设置 / 修改 / Mod 管理 / 导出 面板，
 * 各面板本体拆在本目录的 instance/ 下的 SFC 里。
 *
 * 数据归属：
 *   - 实例设置（Java、内存、服务器、高级选项）一律走 store 的
 *     loadInstanceSettings / updateInstanceSettings（patch 回调）；
 *   - 外观偏好（图标 / 分类 / 收藏 / 名称 / 描述 / 认证服务器）走本地 KV（setUi 回调）。
 */
import type { GameInstance } from '../lib/types'
import OverviewPanel from './instance/OverviewPanel.vue'
import SetupPanel from './instance/SetupPanel.vue'
import ModifyPanel from './instance/ModifyPanel.vue'
import ModPanel from './instance/ModPanel.vue'
import ExportPanel from './instance/ExportPanel.vue'
import type { InstanceSettings, InstanceUi } from './instanceMeta'

defineProps<{
  tab: string
  instance: GameInstance
  /** 该实例的设置（来自 store.instanceSettings） */
  settings: InstanceSettings
  /** 写回实例设置 */
  patch: (p: Partial<InstanceSettings>) => void
  /** 外观偏好 */
  ui: InstanceUi
  /** 写回外观偏好 */
  setUi: (p: InstanceUi) => void
}>()
</script>

<template>
  <OverviewPanel
    v-if="tab === 'overall'"
    :instance="instance"
    :settings="settings"
    :ui="ui"
    :set-ui="setUi"
  />
  <SetupPanel
    v-else-if="tab === 'setup'"
    :instance="instance"
    :settings="settings"
    :patch="patch"
    :ui="ui"
    :set-ui="setUi"
  />
  <ModifyPanel v-else-if="tab === 'modify'" :instance="instance" />
  <ModPanel v-else-if="tab === 'mod'" :instance="instance" />
  <ExportPanel v-else-if="tab === 'export'" :instance="instance" />
</template>
