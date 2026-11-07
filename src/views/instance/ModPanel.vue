<script setup lang="ts">
/**
 * Mod 面板：搜索 + 工具行 + Mod 列表（多选 / 行内操作 / 更新与删除二级确认）。
 *
 * 清单来自内核 `list_content`（mods 目录扫描 + jar 元数据解析），
 * 启用/禁用、删除、导入都会真实修改磁盘。
 */
import { computed, ref, watch } from 'vue'
import { useAppStore } from '../../stores/app'
import { toast } from '../../lib/toast'
import { openDialog } from '../../lib/dialogs'
import type { GameInstance, ModUpdate, ResourceQuery } from '../../lib/types'
import AlxIcon from '../../components/AlxIcon.vue'
import AlxModal from '../../components/AlxModal.vue'
import AlxSearchBar from '../../components/AlxSearchBar.vue'
import SettingGroup from '../../components/SettingGroup.vue'
import {
  deleteLocalContent,
  formatContentSize,
  formatModifiedAgo,
  importLocalContent,
  localModsRepo,
  openFolderInExplorer,
  resolveInstanceDir,
  setContentEnabled,
  type LocalMod,
} from '../instanceMeta'

const props = defineProps<{ instance: GameInstance }>()

const store = useAppStore()

/** 列表行模型：字段对齐下载页的 resource-item（主副标题 / 标签 / 描述 / 元信息）。 */
interface ModRow {
  id: string
  name: string
  enName: string
  desc: string
  tags: string[]
  version: string
  newVersion: string
  size: string
  updated: string
  source: string
  fileName: string
  enabled: boolean
}

const query = ref('')
const mods = ref<LocalMod[]>([])
/** 多选：id → 是否选中。 */
const selected = ref<Record<string, boolean>>({})
/** Modrinth 更新结果：本地文件名 → 更新信息。 */
const updates = ref<Record<string, ModUpdate>>({})
const checking = ref(false)

/** 检查 Mod 更新（按文件哈希反查 Modrinth）。 */
async function checkUpdates() {
  if (checking.value) return
  checking.value = true
  try {
    const list = await store.checkModUpdates(props.instance.id)
    updates.value = Object.fromEntries(list.map((u) => [u.fileName, u]))
    if (list.length === 0) toast.info('没有检测到可用更新（或本地 Mod 未收录到 Modrinth）')
    else toast.success(`发现 ${list.length} 个可更新的 Mod`)
  } finally {
    checking.value = false
  }
}

/** 读取该实例的本地 Mod 清单。 */
async function loadMods() {
  try {
    mods.value = await localModsRepo.list(props.instance.id)
  } catch (e) {
    mods.value = []
    toast.warning(`读取 Mod 列表失败：${(e as Error).message}`)
  }
}

/** 当前分类筛选：全部 / 可更新 / 已禁用 / 已启用。 */
type ModFilter = 'all' | 'update' | 'disabled' | 'enabled'
const filter = ref<ModFilter>('all')

function resetLocalState() {
  selected.value = {}
  filter.value = 'all'
}

watch(
  () => props.instance.id,
  async () => {
    resetLocalState()
    await loadMods()
  },
  { immediate: true },
)

// 侧栏「刷新」：重新读取本地 Mod 清单，并清空筛选与多选。
watch(
  () => store.instanceReloads.mod ?? 0,
  async (tick) => {
    if (!tick) return
    query.value = ''
    resetLocalState()
    await loadMods()
    toast.success('Mod 列表已重新加载')
  },
)

/** 全量行（含筛选外的条目，多选操作基于它）。 */
const allRows = computed<ModRow[]>(() =>
  mods.value.map((m) => ({
    id: m.id,
    name: m.name,
    enName: '',
    desc: m.description || m.fileName,
    tags: [m.loader ?? props.instance.loader].filter(Boolean),
    version: m.version || '—',
    newVersion: updates.value[m.fileName]?.latestVersion ?? '',
    size: formatContentSize(m.sizeBytes),
    updated: formatModifiedAgo(m.modifiedSecs),
    source: '本地',
    fileName: m.fileName,
    enabled: m.enabled,
  })),
)

/** 当前搜索过滤结果（分类筛选在其上叠加）。 */
const searchedRows = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return allRows.value
  return allRows.value.filter(
    (m) =>
      m.name.toLowerCase().includes(keyword) ||
      m.enName.toLowerCase().includes(keyword) ||
      m.desc.toLowerCase().includes(keyword) ||
      m.tags.some((t) => t.toLowerCase().includes(keyword)),
  )
})

/** 只有存在被禁用的 Mod 时，才提供「已禁用 / 已启用」分类。 */
const hasDisabled = computed(() => allRows.value.some((m) => !m.enabled))

/** 各分类数量（跟随搜索框结果变化）。 */
const filterCounts = computed(() => ({
  all: searchedRows.value.length,
  update: searchedRows.value.filter((m) => !!m.newVersion).length,
  disabled: searchedRows.value.filter((m) => !m.enabled).length,
  enabled: searchedRows.value.filter((m) => m.enabled).length,
}))

/** 列表最终展示行：搜索 + 分类过滤。 */
const rows = computed(() => {
  const base = searchedRows.value
  if (filter.value === 'update') return base.filter((m) => !!m.newVersion)
  if (filter.value === 'disabled') return base.filter((m) => !m.enabled)
  if (filter.value === 'enabled') return base.filter((m) => m.enabled)
  return base
})

// 禁用 Mod 全部恢复启用后，隐藏的分类自动退回「全部」，避免停留在空列表。
watch(hasDisabled, (visible) => {
  if (!visible && (filter.value === 'disabled' || filter.value === 'enabled')) {
    filter.value = 'all'
  }
})

const selectedCount = computed(() => Object.values(selected.value).filter(Boolean).length)

/** 加载器 → 列表图标（按实例的版本加载器显示，未知回落到原版方块）。 */
const LOADER_ICON: Record<string, string> = {
  vanilla: 'minecraft',
  fabric: 'fabric',
  forge: 'forge',
  neoforge: 'neoforge',
  quilt: 'quilt',
  optifine: 'optifine',
}
const loaderIcon = computed(() => LOADER_ICON[props.instance.loader] ?? 'minecraft')

/* ------------------------------ 多选 ------------------------------ */

function toggleSelect(id: string) {
  selected.value = { ...selected.value, [id]: !selected.value[id] }
}

function isSelected(id: string): boolean {
  return !!selected.value[id]
}

function clearSelection() {
  selected.value = {}
}

/** 全选：只选中当前分类（含搜索过滤）里可见的行。 */
function selectAll() {
  const next: Record<string, boolean> = {}
  for (const row of rows.value) next[row.id] = true
  selected.value = next
  toast.success(`已选中 ${rows.value.length} 个 Mod`)
}

/* ------------------------- 启用 / 禁用 ------------------------- */

/** 批量启用 / 禁用：直接改磁盘文件名（`.disabled` 后缀），失败时回滚界面。 */
async function setEnabled(ids: string[], enabled: boolean) {
  if (ids.length === 0) return
  const targets = mods.value.filter((m) => ids.includes(m.id))
  if (targets.length === 0) return
  try {
    for (const item of targets) {
      await setContentEnabled(props.instance.id, 'mods', item.fileName, enabled)
    }
    mods.value = mods.value.map((m) =>
      targets.some((t) => t.id === m.id) ? { ...m, enabled } : m,
    )
    toast.success(`已${enabled ? '启用' : '禁用'} ${targets.length} 个 Mod`)
  } catch (e) {
    toast.warning(`操作失败：${(e as Error).message}`)
  }
}

function toggleEnabled(row: ModRow) {
  setEnabled([row.id], !row.enabled)
}

/* ------------------------- 详情 / 打开位置 ------------------------- */

const detailTarget = ref<ModRow | null>(null)

async function openModLocation(row?: ModRow | null) {
  try {
    const dir = await resolveInstanceDir(props.instance.id)
    await openFolderInExplorer(`${dir}/mods`)
    toast.success(row ? `已打开「${row.name}」所在文件夹` : '已打开 Mod 文件夹')
  } catch (e) {
    toast.warning(`Mod 文件夹尚未生成：${(e as Error).message}`)
  }
}

function openModsFolder() {
  openModLocation(null)
}

/* ------------------------- 更新（二级确认） ------------------------- */

const updateTargets = ref<ModRow[]>([])
const updateStage = ref<0 | 1 | 2>(0)

function requestUpdate() {
  const ids = Object.keys(selected.value).filter((id) => selected.value[id])
  const targets = allRows.value.filter((m) => ids.includes(m.id) && m.newVersion)
  if (targets.length === 0) {
    toast.info('所选 Mod 已是最新版本')
    return
  }
  if (targets.length < ids.length) {
    toast.info(`已跳过 ${ids.length - targets.length} 个没有可用更新的 Mod`)
  }
  updateTargets.value = targets
  updateStage.value = 1
}

function closeUpdate() {
  updateStage.value = 0
  updateTargets.value = []
}

function viewChangelog() {
  const first = updateTargets.value[0]
  const changelog = first ? updates.value[first.fileName]?.changelog : null
  toast.info(changelog ? `更新日志：${changelog.slice(0, 400)}` : '该版本未提供更新日志')
}

/** 依次应用更新（下载新文件 → 删除旧文件）。 */
async function confirmUpdate() {
  const targets = updateTargets.value
  closeUpdate()
  for (const target of targets) {
    const update = updates.value[target.fileName]
    if (update) await store.applyModUpdate(props.instance.id, update)
  }
  updates.value = {}
  await loadMods()
}

/* ------------------------- 删除（二级确认） ------------------------- */

const deleteTargets = ref<ModRow[]>([])
const deleteStage = ref<0 | 1 | 2>(0)

function requestDelete(ids: string[]) {
  const targets = allRows.value.filter((m) => ids.includes(m.id))
  if (targets.length === 0) return
  deleteTargets.value = targets
  deleteStage.value = 1
}

function deleteSelected() {
  requestDelete(Object.keys(selected.value).filter((id) => selected.value[id]))
}

function closeDelete() {
  deleteStage.value = 0
  deleteTargets.value = []
}

/** 删除：逐个移除磁盘文件后重新读取列表。 */
async function confirmDelete() {
  const targets = deleteTargets.value
  if (targets.length === 0) return
  try {
    for (const item of targets) {
      await deleteLocalContent(props.instance.id, 'mods', item.fileName)
    }
    const removedIds = new Set(targets.map((t) => t.id))
    selected.value = Object.fromEntries(
      Object.entries(selected.value).filter(([id]) => !removedIds.has(id)),
    )
    await loadMods()
    toast.success(`已删除 ${targets.length} 个 Mod`)
  } catch (e) {
    toast.warning(`删除失败：${(e as Error).message}`)
  }
  closeDelete()
}

/* ------------------------- 其它工具 ------------------------- */

/** Mod 搜索页可筛选的加载器（vanilla / optifine 等不参与筛选）。 */
const MOD_LOADER_FILTERS = ['forge', 'neoforge', 'fabric', 'quilt']

/**
 * 「下载新 Mod」：前往模组下载页，并默认按当前实例的游戏版本与加载器检索
 * （显式动作，不受下载设置里的自动筛选开关影响）。
 */
function downloadNewMods() {
  const patch: Partial<ResourceQuery> = { gameVersion: props.instance.version }
  if (MOD_LOADER_FILTERS.includes(props.instance.loader)) {
    patch.loader = props.instance.loader
  }
  store.setResourceQuery(patch)
  void store.routerPush('/download/mod')
}

async function installFromFile() {
  try {
    const picked = await openDialog({
      multiple: true,
      filters: [{ name: 'Mod 文件', extensions: ['jar'] }],
    })
    const files = Array.isArray(picked) ? picked : picked ? [picked] : []
    if (files.length === 0) return
    for (const file of files) {
      await importLocalContent(props.instance.id, 'mods', file)
    }
    await loadMods()
    toast.success(`已导入 ${files.length} 个 Mod`)
  } catch (e) {
    toast.warning(`导入失败：${(e as Error).message}`)
  }
}
</script>

<template>
  <!-- 搜索 + 工具行 -->
  <div class="panel-toolbar">
    <AlxSearchBar v-model="query" placeholder="搜索 Mod" />
    <div class="panel-actions">
      <button type="button" class="btn-sub" @click="openModsFolder">打开文件夹</button>
      <button type="button" class="btn-sub" @click="installFromFile">从文件安装</button>
      <button type="button" class="btn-sub" :disabled="checking" @click="checkUpdates">
        {{ checking ? '检查中…' : '检查更新' }}
      </button>
      <button type="button" class="btn-sub" @click="downloadNewMods">
        下载新 Mod
      </button>
      <button type="button" class="btn-sub" @click="selectAll">全选</button>
    </div>
  </div>

  <!-- Mod 列表 -->
  <SettingGroup class="mod-list-group" title="" :collapsible="false">
    <template #head>
      <div class="filter-chip-row">
        <button
          type="button"
          class="filter-chip"
          :class="{ active: filter === 'all' }"
          @click="filter = 'all'"
        >
          全部 ({{ filterCounts.all }})
        </button>
        <button
          type="button"
          class="filter-chip"
          :class="{ active: filter === 'update' }"
          @click="filter = 'update'"
        >
          可更新 ({{ filterCounts.update }})
        </button>
        <template v-if="hasDisabled">
          <button
            type="button"
            class="filter-chip"
            :class="{ active: filter === 'disabled' }"
            @click="filter = 'disabled'"
          >
            已禁用 ({{ filterCounts.disabled }})
          </button>
          <button
            type="button"
            class="filter-chip"
            :class="{ active: filter === 'enabled' }"
            @click="filter = 'enabled'"
          >
            已启用 ({{ filterCounts.enabled }})
          </button>
        </template>
      </div>
    </template>
    <div v-if="rows.length === 0" class="empty-state">
      <AlxIcon name="package" :size="32" />
      <span>没有符合条件的 Mod</span>
    </div>
    <template v-else>
      <article
        v-for="m in rows"
        :key="m.id"
        class="resource-item mod-row"
        :class="{ 'mod-selected': isSelected(m.id), 'mod-disabled': !m.enabled }"
        @click="toggleSelect(m.id)"
      >
        <div class="resource-item-icon">
          <AlxIcon :name="loaderIcon" :size="22" />
        </div>

        <div class="resource-item-main">
          <span class="resource-item-title">
            <span class="resource-title-primary">{{ m.name }}</span>
            <template v-if="m.enName">
              <span class="resource-title-sep">|</span>
              <span class="resource-title-secondary">{{ m.enName }}</span>
            </template>
          </span>
          <div class="resource-item-sub">
            <span class="resource-item-tags">
              <span v-for="t in m.tags" :key="t" class="resource-tag">{{ t }}</span>
            </span>
            <span class="resource-item-desc">{{ m.desc }}</span>
          </div>
          <div class="resource-item-meta">
            <span class="resource-meta-item">
              <AlxIcon name="clock" :size="12" />{{ m.updated }}
            </span>
            <span class="resource-meta-item">v{{ m.version }}</span>
            <span v-if="m.newVersion" class="resource-meta-item mod-update-badge">
              可更新至 v{{ m.newVersion }}
            </span>
            <span class="resource-meta-item">
              <AlxIcon name="download" :size="12" />{{ m.size }}
            </span>
            <span class="resource-meta-item">
              <AlxIcon name="globe" :size="12" />{{ m.source }}
            </span>
            <span v-if="!m.enabled" class="resource-meta-item mod-disabled-tag">已禁用</span>
          </div>
        </div>

        <!-- 行末操作：hover 淡入 -->
        <div class="mod-row-actions">
          <button
            type="button"
            class="icon-btn"
            title="详情"
            @click.stop="detailTarget = m"
          >
            <AlxIcon name="info" :size="16" />
          </button>
          <button
            type="button"
            class="icon-btn"
            title="打开此文件位置"
            @click.stop="openModLocation(m)"
          >
            <AlxIcon name="folder" :size="16" />
          </button>
          <button
            type="button"
            class="icon-btn"
            :title="m.enabled ? '禁用' : '启用'"
            @click.stop="toggleEnabled(m)"
          >
            <AlxIcon :name="m.enabled ? 'minus' : 'check'" :size="16" />
          </button>
          <button
            type="button"
            class="icon-btn mod-remove"
            title="删除"
            @click.stop="requestDelete([m.id])"
          >
            <AlxIcon name="trash" :size="16" />
          </button>
        </div>
      </article>
    </template>
  </SettingGroup>

  <!-- 多选操作条 -->
  <Teleport to="body">
    <div v-if="selectedCount > 0" class="mod-selection-layer">
      <div class="mod-selection-bar">
        <div class="mod-selection-count">已选择 {{ selectedCount }} 个文件</div>
        <div class="mod-selection-actions">
          <button type="button" class="mod-bar-btn" @click="requestUpdate">
            <AlxIcon name="download" :size="16" />
            <span>更新</span>
          </button>
          <button
            type="button"
            class="mod-bar-btn"
            @click="setEnabled(Object.keys(selected).filter((id) => selected[id]), true)"
          >
            <AlxIcon name="check" :size="16" />
            <span>启用</span>
          </button>
          <button
            type="button"
            class="mod-bar-btn"
            @click="setEnabled(Object.keys(selected).filter((id) => selected[id]), false)"
          >
            <AlxIcon name="minus" :size="16" />
            <span>禁用</span>
          </button>
          <button type="button" class="mod-bar-btn mod-bar-danger" @click="deleteSelected">
            <AlxIcon name="trash" :size="16" />
            <span>删除</span>
          </button>
          <button type="button" class="mod-bar-btn" @click="clearSelection">
            <AlxIcon name="x" :size="16" />
            <span>取消选择</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 详情弹窗 -->
  <AlxModal
    :open="!!detailTarget"
    :title="detailTarget ? `Mod 详情 · ${detailTarget.name}` : 'Mod 详情'"
    @close="detailTarget = null"
  >
    <div v-if="detailTarget" class="mod-detail">
      <div class="mod-detail-row"><span>文件名</span><b>{{ detailTarget.fileName }}</b></div>
      <div class="mod-detail-row"><span>版本</span><b>v{{ detailTarget.version }}</b></div>
      <div class="mod-detail-row"><span>标签</span><b>{{ detailTarget.tags.join(' / ') }}</b></div>
      <div class="mod-detail-row"><span>来源</span><b>{{ detailTarget.source }}</b></div>
      <div class="mod-detail-row">
        <span>状态</span><b>{{ detailTarget.enabled ? '已启用' : '已禁用' }}</b>
      </div>
      <p class="mod-detail-desc">{{ detailTarget.desc }}</p>
    </div>
    <template #actions>
      <button type="button" class="btn-sub" @click="openModLocation(detailTarget)">
        打开此文件位置
      </button>
      <button type="button" class="btn-sub" @click="detailTarget = null">关闭</button>
    </template>
  </AlxModal>

  <!-- 更新一级确认 -->
  <AlxModal :open="updateStage === 1" title="Mod 更新确认" @close="closeUpdate">
    <p class="mod-update-lead">是否更新以下 Mod？</p>
    <div class="mod-update-list">
      <div v-for="m in updateTargets" :key="m.id" class="mod-update-line">
        <span class="mod-update-name">{{ m.name }}</span>
        <span class="mod-update-version">
          v{{ m.version }}<span class="mod-update-arrow">→</span><b>v{{ m.newVersion }}</b>
        </span>
      </div>
    </div>
    <p class="mod-update-hint">
      更新可能引入新的前置依赖或改动配置，建议先查看更新日志并备份存档。
    </p>
    <template #actions>
      <button type="button" class="btn-sub" @click="viewChangelog">查看更新日志</button>
      <button type="button" class="btn-sub" @click="closeUpdate">取消</button>
      <button type="button" class="btn-download" @click="updateStage = 2">悉知风险</button>
    </template>
  </AlxModal>

  <!-- 更新二级警告 -->
  <AlxModal
    :open="updateStage === 2"
    title="Mod 更新警告"
    variant="danger"
    @close="closeUpdate"
  >
    <div class="mod-warn-text">
      <p>升级 Mod 版本后，可能出现新版本与当前存档或其他 Mod 不兼容的情况，导致游戏启动失败、存档损坏，甚至无法恢复。</p>
      <p>如果你正在使用整合包，请勿自行更新其中的 Mod，以免与整合包配置冲突。</p>
      <p class="mod-warn-strong">更新前请先备份存档，并查看更新日志确认变更内容。</p>
      <p>若更新后出现问题，可从回收站找回旧版本的 Mod 文件。</p>
    </div>
    <template #actions>
      <button type="button" class="btn-download btn-danger-outline" @click="confirmUpdate">
        我已了解风险，继续更新
      </button>
      <button type="button" class="btn-sub" @click="closeUpdate">取消</button>
    </template>
  </AlxModal>

  <!-- 删除一级确认 -->
  <AlxModal :open="deleteStage === 1" title="删除 Mod" @close="closeDelete">
    <p class="mod-update-lead">即将删除以下 {{ deleteTargets.length }} 个 Mod：</p>
    <div class="mod-delete-list">
      <div v-for="m in deleteTargets" :key="m.id" class="mod-delete-line">
        <AlxIcon name="package" :size="14" />
        <span class="mod-delete-name">{{ m.name }}</span>
        <span class="mod-delete-file">{{ m.fileName }}</span>
      </div>
    </div>
    <p class="mod-update-hint">
      删除后 Mod 文件会从当前版本移除，游戏内对应的内容也会失效。
    </p>
    <template #actions>
      <button type="button" class="btn-sub" @click="closeDelete">取消</button>
      <button type="button" class="btn-download btn-danger" @click="deleteStage = 2">
        继续删除
      </button>
    </template>
  </AlxModal>

  <!-- 删除二级警告 -->
  <AlxModal
    :open="deleteStage === 2"
    title="删除 Mod 警告"
    variant="danger"
    @close="closeDelete"
  >
    <div class="mod-warn-text">
      <p>删除后该 Mod 将从当前版本移除，依赖它的存档、配置文件与其他 Mod 可能无法正常工作。</p>
      <p>误删的 Mod 文件可以从系统回收站找回，但被覆盖的配置无法恢复。</p>
    </div>
    <template #actions>
      <button type="button" class="btn-download btn-danger-outline" @click="confirmDelete">
        我已了解，删除 Mod
      </button>
      <button type="button" class="btn-sub" @click="closeDelete">取消</button>
    </template>
  </AlxModal>
</template>
