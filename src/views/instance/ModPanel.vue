<script setup lang="ts">
/**
 * Mod 面板：搜索 + 工具行 + Mod 列表（多选 / 行内操作 / 更新与删除二级确认）。
 *
 * 本地 Mod 清单由 localModsRepo 提供（lib 移除后暂返回空列表），
 * 读不到时用演示数据兜底撑起界面。
 */
import { computed, ref, watch } from 'vue'
import { useAppStore } from '../../stores/app'
import { toast } from '../../lib/toast'
import type { GameInstance } from '../../lib/types'
import AlxIcon from '../../components/AlxIcon.vue'
import AlxModal from '../../components/AlxModal.vue'
import AlxSearchBar from '../../components/AlxSearchBar.vue'
import SettingGroup from '../../components/SettingGroup.vue'
import { localModsRepo, openFolderInExplorer, resolveInstanceDir, type LocalMod } from '../instanceMeta'

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

/** 演示用 Mod 清单（本地没有安装 Mod 时用于撑起界面）。 */
const DEMO_MODS: ModRow[] = [
  {
    id: 'demo-0',
    name: '钠 渲染优化',
    enName: 'Sodium',
    desc: '现代化渲染引擎，大幅提升帧率并降低显存占用',
    tags: ['fabric', 'quilt'],
    version: '0.5.11',
    newVersion: '0.6.0',
    size: '1.2 M',
    updated: '3 天前',
    source: 'Modrinth',
    fileName: 'sodium-fabric-0.5.11.jar',
    enabled: true,
  },
  {
    id: 'demo-1',
    name: '锂 性能优化',
    enName: 'Lithium',
    desc: '优化游戏物理与 AI 逻辑，减少卡顿',
    tags: ['fabric'],
    version: '0.14.1',
    newVersion: '',
    size: '612 K',
    updated: '12 天前',
    source: 'Modrinth',
    fileName: 'lithium-fabric-0.14.1.jar',
    enabled: true,
  },
  {
    id: 'demo-2',
    name: '鸢尾花 光影',
    enName: 'Iris',
    desc: '为 Sodium 提供光影支持的可选加载器',
    tags: ['fabric'],
    version: '1.9.2',
    newVersion: '1.10.0',
    size: '2.4 M',
    updated: '6 天前',
    source: 'Modrinth',
    fileName: 'iris-fabric-1.9.2.jar',
    enabled: true,
  },
  {
    id: 'demo-3',
    name: 'Mod 菜单',
    enName: 'Mod Menu',
    desc: '统一的模组配置界面，可在游戏内直接调整设置',
    tags: ['fabric', 'quilt'],
    version: '11.0.3',
    newVersion: '',
    size: '498 K',
    updated: '20 天前',
    source: 'Modrinth',
    fileName: 'modmenu-11.0.3.jar',
    enabled: true,
  },
  {
    id: 'demo-4',
    name: 'JEI 物品管理器',
    enName: 'Just Enough Items',
    desc: 'Item and recipe viewing mod for Minecraft.',
    tags: ['forge', 'fabric', 'neoforge'],
    version: '15.2.0',
    newVersion: '',
    size: '329 K',
    updated: '12 天前',
    source: 'Modrinth',
    fileName: 'jei-1.20.1-forge-15.2.0.jar',
    enabled: true,
  },
  {
    id: 'demo-5',
    name: '传送石',
    enName: 'Waystones',
    desc: '新增传送石与传送门，方便快速移动',
    tags: ['forge', 'fabric'],
    version: '14.0.0',
    newVersion: '',
    size: '1.8 M',
    updated: '1 个月前',
    source: 'CurseForge',
    fileName: 'waystones-14.0.0.jar',
    enabled: true,
  },
  {
    id: 'demo-6',
    name: '家具与装饰',
    enName: 'Furniture & Decor',
    desc: '上百种家具与装饰方块',
    tags: ['forge'],
    version: '6.9.2',
    newVersion: '7.0.0',
    size: '5.6 M',
    updated: '8 天前',
    source: 'CurseForge',
    fileName: 'furniture-6.9.2.jar',
    enabled: false,
  },
  {
    id: 'demo-7',
    name: '实体动画',
    enName: 'Not Enough Animations',
    desc: '扩展实体模型与动画表现',
    tags: ['fabric'],
    version: '1.8.3',
    newVersion: '',
    size: '734 K',
    updated: '25 天前',
    source: 'Modrinth',
    fileName: 'notenoughanimations-1.8.3.jar',
    enabled: true,
  },
  {
    id: 'demo-8',
    name: '环境音效',
    enName: 'AmbientSounds',
    desc: '为不同环境加入沉浸式环境音效',
    tags: ['fabric', 'forge'],
    version: '0.6.0',
    newVersion: '',
    size: '3.1 M',
    updated: '2 个月前',
    source: 'CurseForge',
    fileName: 'ambientsounds-0.6.0.jar',
    enabled: true,
  },
  {
    id: 'demo-9',
    name: '自动备份',
    enName: 'Auto Backup',
    desc: '定时备份存档，避免误删进度',
    tags: ['forge'],
    version: '1.4.2',
    newVersion: '',
    size: '96 K',
    updated: '5 个月前',
    source: 'CurseForge',
    fileName: 'autobackup-1.4.2.jar',
    enabled: false,
  },
  {
    id: 'demo-10',
    name: '示例整合包',
    enName: 'Example Pack',
    desc: '包含全部模组配置的整合包',
    tags: ['fabric'],
    version: '1.0',
    newVersion: '',
    size: '—',
    updated: '—',
    source: '本地',
    fileName: 'example-pack.zip',
    enabled: true,
  },
]

const query = ref('')
const mods = ref<LocalMod[]>([])
/** 多选：id → 是否选中。 */
const selected = ref<Record<string, boolean>>({})
/** 启用状态覆盖（演示数据用，刷新后重置）。 */
const enabledState = ref<Record<string, boolean>>({})
/** 已更新到的版本覆盖（更新成功后隐藏「可更新」标记）。 */
const upgraded = ref<Record<string, string>>({})
/** 已删除的演示条目（刷新后重置）。 */
const removed = ref<Record<string, boolean>>({})

/** 读取该实例的本地 Mod 清单（读不到 / 为空时用演示数据兜底）。 */
async function loadMods() {
  mods.value = await localModsRepo.list(props.instance.id)
}

function resetLocalState() {
  selected.value = {}
  enabledState.value = {}
  upgraded.value = {}
  removed.value = {}
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
const allRows = computed<ModRow[]>(() => {
  const base: ModRow[] =
    mods.value.length > 0
      ? mods.value.map((m) => ({
          id: m.id,
          name: m.name,
          enName: '',
          desc: m.description || m.fileName,
          tags: [props.instance.loader],
          version: '—',
          newVersion: '',
          size: '—',
          updated: '本地文件',
          source: '本地',
          fileName: m.fileName,
          enabled: true,
        }))
      : DEMO_MODS.map((m) => ({ ...m }))

  return base
    .filter((m) => !removed.value[m.id])
    .map((m) => ({
      ...m,
      enabled: enabledState.value[m.id] ?? m.enabled,
      version: upgraded.value[m.id] ?? m.version,
      newVersion: upgraded.value[m.id] ? '' : m.newVersion,
    }))
})

/** 当前搜索过滤结果。 */
const rows = computed(() => {
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

function selectAll() {
  const next: Record<string, boolean> = {}
  for (const row of rows.value) next[row.id] = true
  selected.value = next
  toast.success(`已选中 ${rows.value.length} 个 Mod`)
}

/* ------------------------- 启用 / 禁用 ------------------------- */

function setEnabled(ids: string[], enabled: boolean) {
  if (ids.length === 0) return
  const next = { ...enabledState.value }
  for (const id of ids) next[id] = enabled
  enabledState.value = next
  toast.success(`已${enabled ? '启用' : '禁用'} ${ids.length} 个 Mod`)
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
  toast.info('更新日志尚未接入内核，请前往 Mod 发布页查看')
}

function confirmUpdate() {
  const next = { ...upgraded.value }
  for (const m of updateTargets.value) if (m.newVersion) next[m.id] = m.newVersion
  upgraded.value = next
  toast.success(`已更新 ${updateTargets.value.length} 个 Mod`)
  closeUpdate()
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

function confirmDelete() {
  const ids = deleteTargets.value.map((m) => m.id)
  const nextRemoved = { ...removed.value }
  const nextSelected = { ...selected.value }
  for (const id of ids) {
    nextRemoved[id] = true
    delete nextSelected[id]
  }
  removed.value = nextRemoved
  selected.value = nextSelected
  toast.success(`已删除 ${ids.length} 个 Mod`)
  closeDelete()
}

/* ------------------------- 其它工具 ------------------------- */

async function installFromFile() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const picked = await open({
      multiple: true,
      filters: [{ name: 'Mod 文件', extensions: ['jar'] }],
    })
    const files = Array.isArray(picked) ? picked : picked ? [picked] : []
    if (files.length === 0) return
    toast.info(`已选择 ${files.length} 个文件，请放入 Mod 文件夹后重启游戏`)
  } catch (e) {
    toast.warning(`选择文件失败：${(e as Error).message}`)
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
      <button type="button" class="btn-sub" @click="store.routerPush('/download/mod')">
        下载新 Mod
      </button>
      <button type="button" class="btn-sub" @click="selectAll">全选</button>
    </div>
  </div>

  <!-- Mod 列表 -->
  <SettingGroup title="模组列表" :collapsible="false" :extra="`已选 ${selectedCount}`">
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
