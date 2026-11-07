<script setup lang="ts">
/**
 * 原理图管理：
 * 搜索 + 工具行 + 原理图列表（尺寸 / 文件格式）。
 *
 * 数据来自内核 `content.list`（schematics），尺寸由 NBT 解析得到。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useAppStore } from '../../stores/app'
import { call } from '../../lib/bridge'
import { openDialog } from '../../lib/dialogs'
import { toast } from '../../lib/toast'
import type { GameInstance, LocalContentItem } from '../../lib/types'
import AlxIcon from '../../components/AlxIcon.vue'
import AlxModal from '../../components/AlxModal.vue'
import AlxSearchBar from '../../components/AlxSearchBar.vue'
import SettingGroup from '../../components/SettingGroup.vue'
import { openFolderInExplorer, resolveInstanceDir } from '../instanceMeta'

const props = defineProps<{ instance: GameInstance }>()

const store = useAppStore()

const schematics = ref<LocalContentItem[]>([])
const query = ref('')
/** 待移除原理图（移除走弹窗确认）。 */
const removeTarget = ref<LocalContentItem | null>(null)
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    schematics.value = await call<LocalContentItem[]>('list_content', {
      instanceId: props.instance.id,
      kind: 'schematics',
    })
  } catch (e) {
    toast.warning(`读取原理图列表失败：${(e as Error).message}`)
  } finally {
    loading.value = false
  }
}

onMounted(load)

// 侧栏「刷新」：重新载入原理图清单并清空搜索。
watch(
  () => store.instanceReloads.schematic ?? 0,
  (tick) => {
    if (!tick) return
    query.value = ''
    void load().then(() => toast.success('原理图列表已重新加载'))
  },
)

/** 过滤后的原理图列表。 */
const rows = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  return schematics.value.filter(
    (s) =>
      !keyword ||
      s.name.toLowerCase().includes(keyword) ||
      s.fileName.toLowerCase().includes(keyword),
  )
})

/** 文件格式（取扩展名）。 */
function formatOf(item: LocalContentItem): string {
  const idx = item.fileName.lastIndexOf('.')
  return idx >= 0 ? item.fileName.slice(idx) : '未知'
}

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
    const picked = await openDialog({
      multiple: true,
      filters: [{ name: '原理图', extensions: ['litematic', 'schematic'] }],
    })
    const files = Array.isArray(picked) ? picked : picked ? [picked] : []
    if (files.length === 0) return
    for (const path of files) {
      await call('import_content', {
        instanceId: props.instance.id,
        kind: 'schematics',
        source: path,
      })
    }
    await load()
    toast.success(`已导入 ${files.length} 个原理图`)
  } catch (e) {
    toast.warning(`导入原理图失败：${(e as Error).message}`)
  }
}

/** 确认移除原理图（内核删除磁盘文件）。 */
async function confirmRemove() {
  const target = removeTarget.value
  if (!target) return
  try {
    await call('delete_content', {
      instanceId: props.instance.id,
      kind: 'schematics',
      fileName: target.fileName,
    })
    schematics.value = schematics.value.filter((s) => s.path !== target.path)
    toast.success(`已移除原理图「${target.name}」`)
  } catch (e) {
    toast.error(`删除失败：${(e as Error).message}`)
  } finally {
    removeTarget.value = null
  }
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
  <SettingGroup title="原理图列表" :collapsible="false" :extra="`共 ${schematics.length} 个`">
    <div v-if="rows.length === 0" class="empty-state">
      <AlxIcon name="grid" :size="32" />
      <span>{{ loading ? '正在读取原理图…' : '还没有原理图，导入后出现在这里' }}</span>
    </div>
    <template v-else>
      <div v-for="s in rows" :key="s.path" class="list-item">
        <div class="item-left">
          <div class="item-icon"><AlxIcon name="grid" :size="20" /></div>
          <div class="item-info">
            <div class="item-title">{{ s.name }}</div>
            <div class="item-desc">{{ s.description ?? '未解析到尺寸信息' }}</div>
          </div>
        </div>
        <div class="item-right">
          <span class="item-meta">{{ formatOf(s) }}</span>
          <button type="button" class="icon-btn" title="移除" @click="removeTarget = s">
            <AlxIcon name="trash" :size="16" />
          </button>
        </div>
      </div>
    </template>
  </SettingGroup>

  <!-- 移除确认 -->
  <AlxModal :open="removeTarget !== null" title="移除原理图" @close="removeTarget = null">
    确定移除原理图「{{ removeTarget?.name }}」？该文件将一并移除，此操作不可撤销。
    <template #actions>
      <button type="button" class="btn-download btn-danger" @click="confirmRemove">移除</button>
      <button type="button" class="btn-sub" @click="removeTarget = null">取消</button>
    </template>
  </AlxModal>
</template>
