<script setup lang="ts">
/**
 * 「版本设置」子页的面板分发：
 * 按当前标签渲染 版本概览 / 游戏设置 / 自动安装 / 模组管理 / 资源包管理 /
 * 世界管理 / 原理图，各面板本体拆在本目录的 instance/ 下的 SFC 里。
 *
 * 数据归属：
 *   - 实例设置（Java、内存、服务器、高级选项）一律走 store 的
 *     loadInstanceSettings / updateInstanceSettings（patch 回调）；
 *   - 外观偏好（图标 / 分类 / 收藏 / 名称 / 描述 / 认证服务器）走本地 KV（setUi 回调）。
 */
import type { GameInstance } from '../lib/types'
import OverviewPanel from './instance/OverviewPanel.vue'
import SetupPanel from './instance/SetupPanel.vue'
import InstallPanel from './instance/InstallPanel.vue'
import ModPanel from './instance/ModPanel.vue'
import ResourcePackPanel from './instance/ResourcePackPanel.vue'
import WorldPanel from './instance/WorldPanel.vue'
import SchematicPanel from './instance/SchematicPanel.vue'
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
  <InstallPanel v-else-if="tab === 'install'" :instance="instance" />
  <ModPanel v-else-if="tab === 'mod'" :instance="instance" />
  <ResourcePackPanel v-else-if="tab === 'resourcepack'" :instance="instance" />
  <WorldPanel v-else-if="tab === 'world'" :instance="instance" />
  <SchematicPanel v-else-if="tab === 'schematic'" :instance="instance" />
</template>
