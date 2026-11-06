<script setup lang="ts">
/**
 * 导出面板：整合包信息 + 导出内容列表 + 高级选项（手风琴）。
 *
 * 导出树 / 计划生成等纯逻辑落在 instanceMeta.ts（原 lib 形状重建），
 * 这里只负责表单状态与展示。
 */
import { ref } from 'vue'
import { toast } from '../../lib/toast'
import { useAppStore } from '../../stores/app'
import type { GameInstance } from '../../lib/types'
import AlxIcon from '../../components/AlxIcon.vue'
import AlxToggle from '../../components/AlxToggle.vue'
import AlxSelect from '../../components/AlxSelect.vue'
import ExportTree from './ExportTree.vue'
import { EXPORT_TREE, toggleTree, versionSummary, type ExportOption } from '../instanceMeta'

const props = defineProps<{ instance: GameInstance }>()

const store = useAppStore()

const tree = ref<ExportOption[]>(EXPORT_TREE)
const name = ref(props.instance.name)
const version = ref('1.0.0')
const format = ref<'mcpack' | 'mrpack'>('mcpack')
const includeResources = ref(true)
const modrinthOnly = ref(false)
const advanceOpen = ref(false)
const exporting = ref(false)

/** 整合包格式下拉选项。 */
const FORMAT_OPTIONS = [
  { value: 'mcpack', label: 'mcpack（Minecraft 本地格式）' },
  { value: 'mrpack', label: 'mrpack（Modrinth 格式）' },
]

/** 勾选 / 取消勾选某个导出项。 */
function onToggle(id: string, checked: boolean) {
  tree.value = toggleTree(tree.value, id, checked)
}

/** 开始导出：调用内核打包（mods / config / resourcepacks / shaderpacks / saves 快照）。 */
async function startExport() {
  exporting.value = true
  try {
    const path = await store.exportModpack(props.instance.id)
    if (path) toast.success(`导出完成：${path}`)
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <!-- ---------------------- 整合包信息 ---------------------- -->
  <div class="setting-group">
    <div class="setting-group-title">整合包信息</div>
    <div class="setting-row">
      <div class="setting-label">整合包名称</div>
      <input v-model="name" class="setting-input" placeholder="默认使用实例名" />
    </div>
    <div class="setting-row">
      <div class="setting-label">整合包版本</div>
      <input v-model="version" class="setting-input" placeholder="1.0.0" />
    </div>
  </div>

  <!-- ---------------------- 导出内容列表 ---------------------- -->
  <div class="setting-group">
    <div class="setting-group-title">导出内容列表</div>
    <div class="setting-row" style="flex-direction: column; align-items: stretch">
      <ExportTree
        :nodes="tree"
        :depth="0"
        :game-label="`游戏本体 ${versionSummary(instance).join(', ')}`"
        @toggle="onToggle"
      />
    </div>
  </div>

  <!-- ---------------------- 高级选项（手风琴） ---------------------- -->
  <div class="accordion-item" :class="advanceOpen ? 'active' : ''" @click="advanceOpen = !advanceOpen">
    <div class="accordion-header">
      高级选项
      <AlxIcon name="chevron-down" :size="16" />
    </div>
    <div class="accordion-content" style="color: var(--text-main)" @click.stop>
      <div class="setting-row" style="padding-left: 0; padding-right: 0">
        <div class="setting-label">整合包格式</div>
        <AlxSelect
          :model-value="format"
          :options="FORMAT_OPTIONS"
          @update:model-value="(v: string) => (format = v as 'mcpack' | 'mrpack')"
        />
      </div>
      <div style="display: flex; flex-direction: column; gap: 12px; padding-top: 12px">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px">
          <span style="font-size: 14px">包含资源包与光影包</span>
          <AlxToggle v-model="includeResources" />
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px">
          <span style="font-size: 14px">仅打包社区源上有的文件</span>
          <AlxToggle v-model="modrinthOnly" />
        </div>
      </div>
    </div>
  </div>

  <!-- 底部：开始导出 -->
  <div style="display: flex; justify-content: center; margin-top: 4px">
    <button
      type="button"
      class="btn-download"
      style="flex: none; padding: 9px 24px"
      :disabled="exporting"
      @click="startExport"
    >
      <AlxIcon name="package" :size="15" style="vertical-align: -2px; margin-right: 6px" />
      {{ exporting ? '正在导出…' : '开始导出' }}
    </button>
  </div>
</template>
