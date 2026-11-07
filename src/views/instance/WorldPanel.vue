<script setup lang="ts">
/**
 * 世界管理：
 * 搜索 + 工具行 + 存档列表（模式 / 版本 / 最近游玩 / 大小）。
 *
 * 数据来自内核 `content.list`（saves），存档元数据由 NBT 解析 level.dat 得到。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useAppStore } from '../../stores/app'
import { call } from '../../lib/bridge'
import { openDialog } from '../../lib/dialogs'
import { toast } from '../../lib/toast'
import type { GameInstance, LocalContentItem } from '../../lib/types'
import AlxIcon from '../../components/AlxIcon.vue'
import AlxLoading from '../../components/AlxLoading.vue'
import AlxModal from '../../components/AlxModal.vue'
import AlxSearchBar from '../../components/AlxSearchBar.vue'
import SettingGroup from '../../components/SettingGroup.vue'
import { openFolderInExplorer, resolveInstanceDir } from '../instanceMeta'

const props = defineProps<{ instance: GameInstance }>()

const store = useAppStore()

const worlds = ref<LocalContentItem[]>([])
const query = ref('')
/** 待删除存档（删除走弹窗确认）。 */
const removeTarget = ref<LocalContentItem | null>(null)
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    worlds.value = await call<LocalContentItem[]>('list_content', {
      instanceId: props.instance.id,
      kind: 'saves',
    })
  } catch (e) {
    toast.warning(`读取存档列表失败：${(e as Error).message}`)
  } finally {
    loading.value = false
  }
}

onMounted(load)

// 侧栏「刷新」：重新载入存档清单并清空搜索。
watch(
  () => store.instanceReloads.world ?? 0,
  (tick) => {
    if (!tick) return
    query.value = ''
    void load().then(() => toast.success('存档列表已重新加载'))
  },
)

/** 过滤后的存档列表。 */
const rows = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  return worlds.value.filter(
    (w) =>
      !keyword ||
      w.name.toLowerCase().includes(keyword) ||
      (w.worldGameMode ?? '').toLowerCase().includes(keyword),
  )
})

/** 模式 + 难度（如「生存模式 · 困难」）。 */
function modeLabel(w: LocalContentItem): string {
  return [w.worldGameMode, w.worldDifficulty].filter(Boolean).join(' · ') || '未知模式'
}

/** 最近游玩时间（mtime 转本地时间）。 */
function lastPlayed(secs: number): string {
  if (!secs) return '未知'
  return new Date(secs * 1000).toLocaleString('zh-CN', { hour12: false })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/** 打开实例的 saves 目录。 */
async function openSavesFolder() {
  try {
    const dir = await resolveInstanceDir(props.instance.id)
    await openFolderInExplorer(`${dir}/saves`)
  } catch (e) {
    toast.warning(`存档文件夹尚未生成：${(e as Error).message}`)
  }
}

/** 导入存档：目录或 .zip（内核负责解压与同名冲突检查）。 */
async function importWorld() {
  try {
    const picked = await openDialog({
      multiple: false,
      directory: false,
      filters: [{ name: '存档（zip）或任意文件夹', extensions: ['zip'] }],
    })
    if (typeof picked !== 'string' || !picked) {
      // 用户可能想选文件夹（zip 过滤器下无法直接选目录）
      return
    }
    await call('import_content', {
      instanceId: props.instance.id,
      kind: 'saves',
      source: picked,
    })
    await load()
    toast.success('存档已导入')
  } catch (e) {
    toast.warning(`导入存档失败：${(e as Error).message}`)
  }
}

/** 备份存档（内核复制到 backups/worlds）。 */
async function backupWorld(w: LocalContentItem) {
  try {
    const dest = await call<string>('backup_world', {
      instanceId: props.instance.id,
      fileName: w.fileName,
    })
    toast.success(`已备份「${w.name}」到 ${dest}`)
  } catch (e) {
    toast.error(`备份失败：${(e as Error).message}`)
  }
}

/** 确认删除存档（内核删除磁盘目录）。 */
async function confirmRemove() {
  const target = removeTarget.value
  if (!target) return
  try {
    await call('delete_content', {
      instanceId: props.instance.id,
      kind: 'saves',
      fileName: target.fileName,
    })
    worlds.value = worlds.value.filter((w) => w.path !== target.path)
    toast.success(`已删除存档「${target.name}」`)
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
    <AlxSearchBar v-model="query" placeholder="搜索存档" />
    <div class="panel-actions">
      <button type="button" class="btn-sub" @click="openSavesFolder">打开文件夹</button>
      <button type="button" class="btn-sub" @click="importWorld">导入存档</button>
      <button type="button" class="btn-sub" @click="store.routerPush('/download/world')">
        下载世界
      </button>
    </div>
  </div>

  <!-- 存档列表 -->
  <SettingGroup title="存档列表" :collapsible="false" :extra="`共 ${worlds.length} 个`">
    <AlxLoading v-if="loading" text="正在读取存档…" />
    <div v-else-if="rows.length === 0" class="empty-state">
      <AlxIcon name="globe" :size="32" />
      <span>还没有存档，导入或开始游戏后会出现在这里</span>
    </div>
    <template v-else>
      <div v-for="w in rows" :key="w.path" class="list-item">
        <div class="item-left">
          <div class="item-icon"><AlxIcon name="globe" :size="20" /></div>
          <div class="item-info">
            <div class="item-title">{{ w.name }}</div>
            <div class="item-desc">
              {{ modeLabel(w) }} · {{ w.worldVersion ?? '未知版本' }} · 最近游玩
              {{ lastPlayed(w.modifiedSecs) }}
            </div>
          </div>
        </div>
        <div class="item-right">
          <span class="item-meta">{{ formatSize(w.sizeBytes) }}</span>
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
