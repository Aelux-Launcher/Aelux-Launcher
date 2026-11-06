<script setup lang="ts">
/**
 * 原理图管理（参考 HMCL 的原理图页）：
 * 搜索 + 工具行 + 原理图列表（尺寸 / 方块数 / 文件格式）。
 *
 * 本地清单尚未接入内核目录列举（同 ModPanel，读不到时用演示数据撑起界面）。
 */
import { computed, ref } from 'vue'
import { toast } from '../../lib/toast'
import type { GameInstance } from '../../lib/types'
import AlxIcon from '../../components/AlxIcon.vue'
import AlxModal from '../../components/AlxModal.vue'
import AlxSearchBar from '../../components/AlxSearchBar.vue'
import { openFolderInExplorer, resolveInstanceDir } from '../instanceMeta'

const props = defineProps<{ instance: GameInstance }>()

interface SchematicEntry {
  id: string
  name: string
  desc: string
  format: string
}

/** 演示原理图（本地清单为空时撑起界面）。 */
const schematics = ref<SchematicEntry[]>([
  { id: 's0', name: '小型农舍', desc: '12×9×10 · 1,204 方块', format: '.litematic' },
  { id: 's1', name: '刷怪塔', desc: '9×9×24 · 1,860 方块', format: '.schematic' },
  { id: 's2', name: '红石电梯', desc: '5×5×18 · 412 方块', format: '.litematic' },
  { id: 's3', name: '城堡主塔', desc: '24×24×48 · 15,320 方块', format: '.schematic' },
])

const query = ref('')
/** 待移除原理图（移除走弹窗确认）。 */
const removeTarget = ref<SchematicEntry | null>(null)

/** 过滤后的原理图列表。 */
const rows = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  return schematics.value.filter(
    (s) => !keyword || s.name.toLowerCase().includes(keyword) || s.format.toLowerCase().includes(keyword),
  )
})

/** 打开实例的 schematics 目录。 */
async function openSchematicFolder() {
  try {
    const dir = await resolveInstanceDir(props.instance.id)
    await openFolderInExplorer(`${dir}/schematics`)
  } catch (e) {
    toast.warning(`原理图文件夹尚未生成：${(e as Error).message}`)
  }
}

/** 导入原理图文件（.litematic / .schematic）。 */
async function importSchematic() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const picked = await open({
      multiple: true,
      filters: [{ name: '原理图', extensions: ['litematic', 'schematic'] }],
    })
    const files = Array.isArray(picked) ? picked : picked ? [picked] : []
    if (files.length === 0) return
    toast.info(`已选择 ${files.length} 个原理图，请放入 schematics 文件夹`)
  } catch (e) {
    toast.warning(`选择文件失败：${(e as Error).message}`)
  }
}

/** 确认移除原理图（仅移出列表的占位实现，不删除磁盘文件）。 */
function confirmRemove() {
  const target = removeTarget.value
  if (!target) return
  schematics.value = schematics.value.filter((s) => s.id !== target.id)
  removeTarget.value = null
  toast.success(`已移除原理图「${target.name}」（未删除本地文件）`)
}
</script>

<template>
  <!-- 搜索 + 工具行 -->
  <div class="panel-toolbar">
    <AlxSearchBar v-model="query" placeholder="搜索原理图" />
    <div class="panel-actions">
      <button type="button" class="btn-sub" @click="openSchematicFolder">打开文件夹</button>
      <button type="button" class="btn-sub" @click="importSchematic">导入原理图</button>
    </div>
  </div>

  <!-- 原理图列表 -->
  <div class="setting-group">
    <div class="setting-group-title">
      原理图列表
      <span class="panel-counter">共 {{ schematics.length }} 个</span>
    </div>
    <div v-if="rows.length === 0" class="empty-state">
      <AlxIcon name="grid" :size="32" />
      <span>没有符合条件的原理图</span>
    </div>
    <template v-else>
      <div v-for="s in rows" :key="s.id" class="list-item">
        <div class="item-left">
          <div class="item-icon"><AlxIcon name="grid" :size="20" /></div>
          <div class="item-info">
            <div class="item-title">{{ s.name }}</div>
            <div class="item-desc">{{ s.desc }}</div>
          </div>
        </div>
        <div class="item-right">
          <span class="item-meta">{{ s.format }}</span>
          <button type="button" class="icon-btn" title="移除" @click="removeTarget = s">
            <AlxIcon name="trash" :size="16" />
          </button>
        </div>
      </div>
    </template>
  </div>

  <!-- 移除确认 -->
  <AlxModal :open="removeTarget !== null" title="移除原理图" @close="removeTarget = null">
    确定移除原理图「{{ removeTarget?.name }}」？该文件将一并移除，此操作不可撤销。
    <template #actions>
      <button type="button" class="btn-download btn-danger" @click="confirmRemove">移除</button>
      <button type="button" class="btn-sub" @click="removeTarget = null">取消</button>
    </template>
  </AlxModal>
</template>
