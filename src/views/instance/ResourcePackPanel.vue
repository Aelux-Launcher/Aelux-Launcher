<script setup lang="ts">
/**
 * 资源包管理：搜索 + 工具行 + 启用开关的资源包列表。
 *
 * 清单来自内核 `list_content`（resourcepacks 目录 + pack.mcmeta 解析），
 * 启用状态通过 `.disabled` 后缀落到磁盘，删除与导入都会真实操作文件。
 */
import { computed, ref, watch } from 'vue'
import { useAppStore } from '../../stores/app'
import { toast } from '../../lib/toast'
import type { GameInstance } from '../../lib/types'
import AlxIcon from '../../components/AlxIcon.vue'
import AlxModal from '../../components/AlxModal.vue'
import AlxSearchBar from '../../components/AlxSearchBar.vue'
import AlxToggle from '../../components/AlxToggle.vue'
import SettingGroup from '../../components/SettingGroup.vue'
import {
  deleteLocalContent,
  formatContentSize,
  formatModifiedAgo,
  importLocalContent,
  loadLocalContent,
  openFolderInExplorer,
  resolveInstanceDir,
  setContentEnabled,
  type LocalContent,
} from '../instanceMeta'

const props = defineProps<{ instance: GameInstance }>()

const store = useAppStore()

const packs = ref<LocalContent[]>([])
const query = ref('')
/** 待删除资源包（删除走弹窗确认）。 */
const removeTarget = ref<LocalContent | null>(null)

/** 读取实例的 resourcepacks 目录。 */
async function loadPacks() {
  packs.value = await loadLocalContent(props.instance.id, 'resourcepacks')
}

watch(
  () => props.instance.id,
  async () => {
    await loadPacks()
  },
  { immediate: true },
)

// 侧栏「刷新」：重新读取资源包清单。
watch(
  () => store.instanceReloads.resourcepack ?? 0,
  async (tick) => {
    if (!tick) return
    query.value = ''
    removeTarget.value = null
    await loadPacks()
    toast.success('资源包列表已重新加载')
  },
)

/** 过滤后的资源包列表。 */
const rows = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  return packs.value.filter(
    (p) =>
      !keyword ||
      p.name.toLowerCase().includes(keyword) ||
      p.fileName.toLowerCase().includes(keyword) ||
      (p.description ?? '').toLowerCase().includes(keyword),
  )
})

/** 已启用数量。 */
const enabledCount = computed(() => packs.value.filter((p) => p.enabled).length)

/** 启用 / 禁用（`.disabled` 重命名）。 */
async function togglePack(pack: LocalContent) {
  const next = !pack.enabled
  try {
    await setContentEnabled(props.instance.id, 'resourcepacks', pack.fileName, next)
    pack.enabled = next
  } catch (e) {
    toast.warning(`操作失败：${(e as Error).message}`)
  }
}

/** 删除资源包文件。 */
async function confirmRemove() {
  const target = removeTarget.value
  if (!target) return
  try {
    await deleteLocalContent(props.instance.id, 'resourcepacks', target.fileName)
    await loadPacks()
    toast.success(`已删除资源包「${target.name}」`)
  } catch (e) {
    toast.warning(`删除失败：${(e as Error).message}`)
  }
  removeTarget.value = null
}

/** 打开实例的 resourcepacks 目录。 */
async function openPackFolder() {
  try {
    const dir = await resolveInstanceDir(props.instance.id)
    await openFolderInExplorer(`${dir}/resourcepacks`)
  } catch (e) {
    toast.warning(`资源包文件夹尚未生成：${(e as Error).message}`)
  }
}

/** 从本地文件导入资源包（.zip）。 */
async function importPack() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const picked = await open({
      multiple: true,
      filters: [{ name: '资源包', extensions: ['zip'] }],
    })
    const files = Array.isArray(picked) ? picked : picked ? [picked] : []
    if (files.length === 0) return
    for (const file of files) {
      await importLocalContent(props.instance.id, 'resourcepacks', file)
    }
    await loadPacks()
    toast.success(`已导入 ${files.length} 个资源包`)
  } catch (e) {
    toast.warning(`导入失败：${(e as Error).message}`)
  }
}
</script>

<template>
  <!-- 搜索 + 工具行 -->
  <div class="panel-toolbar">
    <AlxSearchBar v-model="query" placeholder="搜索资源包" />
    <div class="panel-actions">
      <button type="button" class="btn-sub" @click="openPackFolder">打开文件夹</button>
      <button type="button" class="btn-sub" @click="importPack">从文件导入</button>
      <button type="button" class="btn-sub" @click="store.routerPush('/download/resourcepack')">
        下载新资源包
      </button>
    </div>
  </div>

  <!-- 资源包列表 -->
  <SettingGroup
    title="资源包列表"
    :collapsible="false"
    :extra="`已启用 ${enabledCount} / ${packs.length}`"
  >
    <div v-if="rows.length === 0" class="empty-state">
      <AlxIcon name="shirt" :size="32" />
      <span>没有符合条件的资源包</span>
    </div>
    <template v-else>
      <div v-for="p in rows" :key="p.id" class="list-item">
        <div class="item-left">
          <div class="item-icon"><AlxIcon name="shirt" :size="20" /></div>
          <div class="item-info">
            <div class="item-title">{{ p.name }}</div>
            <div class="item-desc">{{ p.description || p.fileName }}</div>
          </div>
        </div>
        <div class="item-right">
          <span class="item-meta">{{ formatContentSize(p.sizeBytes) }}</span>
          <span class="item-meta">{{ formatModifiedAgo(p.modifiedSecs) }}</span>
          <AlxToggle :model-value="p.enabled" @update:model-value="togglePack(p)" />
          <button type="button" class="icon-btn" title="删除资源包" @click="removeTarget = p">
            <AlxIcon name="trash" :size="16" />
          </button>
        </div>
      </div>
    </template>
  </SettingGroup>

  <!-- 删除确认 -->
  <AlxModal :open="removeTarget !== null" title="删除资源包" @close="removeTarget = null">
    确定删除资源包「{{ removeTarget?.name }}」？资源包文件将一并移除，此操作不可撤销。
    <template #actions>
      <button type="button" class="btn-download btn-danger" @click="confirmRemove">删除</button>
      <button type="button" class="btn-sub" @click="removeTarget = null">取消</button>
    </template>
  </AlxModal>
</template>
