<script setup lang="ts">
/**
 * 世界管理（参考 PCL 的存档页）：
 * 搜索 + 工具行 + 存档列表（模式 / 版本 / 最近游玩 / 大小）。
 *
 * 本地存档清单尚未接入内核目录列举（同 ModPanel，读不到时用演示数据撑起界面）。
 */
import { computed, ref } from 'vue'
import { toast } from '../../lib/toast'
import type { GameInstance } from '../../lib/types'
import AlxIcon from '../../components/AlxIcon.vue'
import AlxModal from '../../components/AlxModal.vue'
import AlxSearchBar from '../../components/AlxSearchBar.vue'
import SettingGroup from '../../components/SettingGroup.vue'
import { openFolderInExplorer, resolveInstanceDir } from '../instanceMeta'

const props = defineProps<{ instance: GameInstance }>()

interface WorldEntry {
  id: string
  name: string
  mode: string
  version: string
  lastPlayed: string
  size: string
}

/** 演示存档（本地清单为空时撑起界面）。 */
const worlds = ref<WorldEntry[]>([
  { id: 'w0', name: '新的世界', mode: '生存模式', version: '1.21.4', lastPlayed: '2026/1/3 21:40', size: '86 MB' },
  { id: 'w1', name: '空岛生存', mode: '生存模式 · 困难', version: '1.21.4', lastPlayed: '2026/1/2 19:12', size: '42 MB' },
  { id: 'w2', name: '创造测试场', mode: '创造模式', version: '1.21.4', lastPlayed: '2025/12/28 16:03', size: '128 MB' },
  { id: 'w3', name: '建筑存档', mode: '创造模式 · 和平', version: '1.21.1', lastPlayed: '2025/12/20 11:35', size: '310 MB' },
])

const query = ref('')
/** 待删除存档（删除走弹窗确认）。 */
const removeTarget = ref<WorldEntry | null>(null)

/** 过滤后的存档列表。 */
const rows = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  return worlds.value.filter(
    (w) => !keyword || w.name.toLowerCase().includes(keyword) || w.mode.toLowerCase().includes(keyword),
  )
})

/** 打开实例的 saves 目录。 */
async function openSavesFolder() {
  try {
    const dir = await resolveInstanceDir(props.instance.id)
    await openFolderInExplorer(`${dir}/saves`)
  } catch (e) {
    toast.warning(`存档文件夹尚未生成：${(e as Error).message}`)
  }
}

/** 导入存档压缩包。 */
async function importWorld() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const picked = await open({
      multiple: false,
      filters: [{ name: '存档压缩包', extensions: ['zip'] }],
    })
    if (!picked) return
    toast.info('已选择存档，请解压到 saves 文件夹后重启游戏')
  } catch (e) {
    toast.warning(`选择文件失败：${(e as Error).message}`)
  }
}

/** 备份存档（内核备份命令未接入前先提示）。 */
function backupWorld(w: WorldEntry) {
  toast.info(`「${w.name}」的备份将在内核存档能力接入后开放`)
}

/** 确认删除存档（仅移出列表的占位实现，不删除磁盘文件）。 */
function confirmRemove() {
  const target = removeTarget.value
  if (!target) return
  worlds.value = worlds.value.filter((w) => w.id !== target.id)
  removeTarget.value = null
  toast.success(`已移除存档「${target.name}」（未删除本地文件）`)
}
</script>

<template>
  <!-- 搜索 + 工具行 -->
  <div class="panel-toolbar">
    <AlxSearchBar v-model="query" placeholder="搜索存档" />
    <div class="panel-actions">
      <button type="button" class="btn-sub" @click="openSavesFolder">打开文件夹</button>
      <button type="button" class="btn-sub" @click="importWorld">导入存档</button>
    </div>
  </div>

  <!-- 存档列表 -->
  <SettingGroup title="存档列表" :collapsible="false">
    <template #extra>共 {{ worlds.length }} 个</template>
    <div v-if="rows.length === 0" class="empty-state">
      <AlxIcon name="globe" :size="32" />
      <span>没有符合条件的存档</span>
    </div>
    <template v-else>
      <div v-for="w in rows" :key="w.id" class="list-item">
        <div class="item-left">
          <div class="item-icon"><AlxIcon name="globe" :size="20" /></div>
          <div class="item-info">
            <div class="item-title">{{ w.name }}</div>
            <div class="item-desc">{{ w.mode }} · {{ w.version }} · 最近游玩 {{ w.lastPlayed }}</div>
          </div>
        </div>
        <div class="item-right">
          <span class="item-meta">{{ w.size }}</span>
          <button type="button" class="icon-btn" title="备份存档" @click="backupWorld(w)">
            <AlxIcon name="copy" :size="16" />
          </button>
          <button type="button" class="icon-btn" title="删除存档" @click="removeTarget = w">
            <AlxIcon name="trash" :size="16" />
          </button>
        </div>
      </div>
    </template>
  </SettingGroup>

  <!-- 删除确认 -->
  <AlxModal :open="removeTarget !== null" title="删除存档" @close="removeTarget = null">
    确定删除存档「{{ removeTarget?.name }}」？存档文件将一并移除，此操作不可撤销。
    <template #actions>
      <button type="button" class="btn-download btn-danger" @click="confirmRemove">删除</button>
      <button type="button" class="btn-sub" @click="removeTarget = null">取消</button>
    </template>
  </AlxModal>
</template>
