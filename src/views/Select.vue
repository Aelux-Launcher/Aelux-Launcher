<script setup lang="ts">
/**
 * 版本选择页（副页面）：
 *   侧栏 = 文件夹列表（见 SideNav 的子页面板）；本页内容 = 按加载器分组的版本，
 *   当前文件夹显示内核实例，其它文件夹显示扫描到的本地版本（只读）。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useAppStore } from '../stores/app'
import AlxIcon from '../components/AlxIcon.vue'
import AlxModal from '../components/AlxModal.vue'
import { toast } from '../lib/toast'
import { call } from '../lib/bridge'
import { loaderIconUrl } from '../lib/loaderIcons'
import type { GameInstance, ScannedVersion } from '../lib/types'
import { loadInstanceUiMap, saveInstanceUi } from './instanceMeta'

const store = useAppStore()

/** 清单版本类型 → 中文（快照 = 预览版，旧版统一归为远古版）。 */
const KIND_LABEL: Record<string, string> = {
  release: '正式版',
  snapshot: '快照版',
  old_beta: '远古版',
  old_alpha: '远古版',
}

const LOADER_ORDER = ['vanilla', 'fabric', 'forge', 'neoforge', 'quilt'] as const

const LOADER_TITLE: Record<(typeof LOADER_ORDER)[number], string> = {
  vanilla: '原版版本',
  fabric: 'Fabric 版本',
  forge: 'Forge 版本',
  neoforge: 'NeoForge 版本',
  quilt: 'Quilt 版本',
}

const LOADER_SHORT: Record<string, string> = {
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  quilt: 'Quilt',
}

/** 验证方式（跟随当前账户；未登录时跟随偏好设置）。 */
function verifyLabel(): string {
  const type = store.session?.type ?? (store.loginMode === 'official' ? 'microsoft' : store.loginMode)
  if (type === 'microsoft') return '正版验证'
  if (type === 'third') return 'Authlib 验证'
  return '离线验证'
}

/** 加载器段：`Forge_54.1.17`（loaderVersion 缺失时从包名后缀解析）。 */
function loaderText(instance: GameInstance): string {
  const key = instance.loader || 'vanilla'
  if (key === 'vanilla') return ''
  const label = LOADER_SHORT[key] ?? key
  const lv =
    instance.loaderVersion ||
    (instance.name.includes('_') ? instance.name.slice(instance.name.lastIndexOf('_') + 1) : '')
  return lv ? `${label}_${lv}` : label
}

/** 实例行副文本：`正式版 1.21.4，Forge_54.1.17，离线验证`。 */
function instanceDesc(instance: GameInstance): string {
  const entry = store.versions.find((v) => v.id === instance.version)
  const kind = entry ? (KIND_LABEL[entry.kind] ?? entry.kind) : '正式版'
  return [`${kind} ${instance.version}`, loaderText(instance), verifyLabel()].filter(Boolean).join('，')
}

/** 实例图标跟随加载器：原版用草方块，其余用品牌图标；缺素材回退矢量图标。 */
function loaderIconSrc(instance: GameInstance): string | null {
  return loaderIconUrl(instance.loader || 'vanilla')
}

function loaderIcon(instance: GameInstance): string {
  const key = instance.loader || 'vanilla'
  return key === 'vanilla' ? 'minecraft' : key
}

/** 收藏状态（持久化在实例外观偏好里）。 */
const favorites = ref<Record<string, boolean>>({})

/** 按加载器分组的实例（空组隐藏）；收藏夹固定在最顶部。 */
const instanceGroups = computed(() => {
  const favorited = store.instances.filter((i) => favorites.value[i.id])
  const groups = LOADER_ORDER.map((key) => ({
    key: key as string,
    title: LOADER_TITLE[key],
    items: store.instances.filter((i) => (i.loader || 'vanilla') === key),
  })).filter((g) => g.items.length > 0)
  return favorited.length
    ? [{ key: 'favorites', title: '收藏夹', items: favorited }, ...groups]
    : groups
})

/** 分组折叠状态（默认全部展开，收起后记住）。 */
const collapsedGroups = ref(new Set<string>())

function isGroupOpen(key: string): boolean {
  return !collapsedGroups.value.has(key)
}

function toggleGroup(key: string) {
  const s = collapsedGroups.value
  if (s.has(key)) s.delete(key)
  else s.add(key)
}

/* ------------------------------ 文件夹扫描 ------------------------------ */

/** 当前文件夹（侧栏选中项）。 */
const currentFolder = computed(
  () => store.gameFolders.find((f) => f.id === store.selectedFolderId) ?? null,
)
const isCurrentFolder = computed(() => currentFolder.value?.type === 'current')
const scanState = computed(() => store.folderScans[store.selectedFolderId] ?? null)
const scannedVersions = computed(() => scanState.value?.items ?? [])
const scanLoading = computed(() => scanState.value?.loading ?? false)
const scanError = computed(() => scanState.value?.error ?? null)

const LOADER_SET = new Set<string>(LOADER_ORDER)

function normalizeLoader(loader: string): string {
  return LOADER_SET.has(loader) ? loader : 'vanilla'
}

/** 外部文件夹版本按加载器分组（空组隐藏）。 */
const scannedGroups = computed(() =>
  LOADER_ORDER.map((key) => ({
    key: key as string,
    title: LOADER_TITLE[key],
    items: scannedVersions.value.filter((v) => normalizeLoader(v.loader) === key),
  })).filter((g) => g.items.length > 0),
)

/** 扫描版本副文本：`正式版 1.21.4，Fabric_0.16.9`。 */
function scannedDesc(v: ScannedVersion): string {
  const kind = KIND_LABEL[v.kind] ?? v.kind ?? '正式版'
  const key = normalizeLoader(v.loader)
  const label = LOADER_SHORT[key] ?? key
  const loaderText = key === 'vanilla' ? '' : v.loaderVersion ? `${label}_${v.loaderVersion}` : label
  return [`${kind} ${v.version}`, loaderText].filter(Boolean).join('，')
}

/** 打开外部版本的目录（外部版本只读展示，不支持直接启动）。 */
async function openScannedVersion(v: ScannedVersion) {
  try {
    await call('open_folder_in_explorer', { path: v.path })
  } catch (e) {
    toast.error(`打开失败：${(e as Error).message}`)
  }
}

/** 重新扫描当前文件夹。 */
async function retryScan() {
  try {
    await store.scanFolder(store.selectedFolderId, true)
  } catch (e) {
    toast.error(`扫描失败：${(e as Error).message}`)
  }
}

watch(
  () => store.selectedFolderId,
  (id) => {
    const folder = store.gameFolders.find((f) => f.id === id)
    if (folder && folder.type !== 'current' && folder.path) {
      void store.scanFolder(id).catch(() => {})
    }
  },
  { immediate: true },
)

/** 点击实例卡片 → 选中该实例并返回启动页；版本设置走行尾齿轮按钮。 */
async function selectInstance(id: string) {
  await store.selectInstance(id)
  store.setView('home')
}

/* ------------------------------ 行尾操作 ------------------------------ */

onMounted(async () => {
  const map = await loadInstanceUiMap()
  const next: Record<string, boolean> = {}
  for (const [id, ui] of Object.entries(map)) {
    if (ui.favorite) next[id] = true
  }
  favorites.value = next
})

function isFavorite(id: string): boolean {
  return !!favorites.value[id]
}

/** 切换收藏（写回本地 KV）。 */
async function toggleFavorite(instance: GameInstance) {
  const next = !isFavorite(instance.id)
  favorites.value = { ...favorites.value, [instance.id]: next }
  try {
    await saveInstanceUi(instance.id, { favorite: next })
  } catch {
    toast.error('收藏状态保存失败')
  }
}

/** 删除确认（二级锁）：行尾删除按钮先弹窗，确认后才真正删除。 */
const pendingDelete = ref<GameInstance | null>(null)
const deleting = ref(false)

function askDelete(instance: GameInstance) {
  pendingDelete.value = instance
}

async function confirmDelete() {
  const inst = pendingDelete.value
  if (!inst || deleting.value) return
  deleting.value = true
  try {
    await store.deleteInstance(inst.id)
    pendingDelete.value = null
    toast.success(`已删除 ${inst.name}`)
  } catch (e) {
    toast.error(`删除失败：${(e as Error).message}`)
  } finally {
    deleting.value = false
  }
}

/** 行尾设置按钮 → 该实例的「版本设置 → 版本概览」页。 */
function openSettings(instance: GameInstance) {
  store.openSubPage({ kind: 'instance', instanceId: instance.id, tab: 'overall' })
}
</script>

<template>
  <div class="page-view active sub-page">
    <!-- 当前文件夹：内核管理的实例 -->
    <template v-if="isCurrentFolder">
      <div v-if="store.instances.length === 0" class="empty-state">
        <AlxIcon name="info" :size="32" />
        <div>当前文件夹还没有实例，去「下载」页安装一个版本吧</div>
      </div>

      <!-- 实例按加载器分组 -->
      <div
        v-for="g in instanceGroups"
        :key="g.key"
        class="version-card version-group"
        :class="{ open: isGroupOpen(g.key) }"
      >
        <button type="button" class="version-group-header" @click="toggleGroup(g.key)">
          <span>{{ g.title }}（{{ g.items.length }}）</span>
          <AlxIcon name="chevron-down" :size="18" class="version-group-chevron" />
        </button>
        <div class="version-group-body">
          <div class="version-group-inner" :inert="!isGroupOpen(g.key)">
            <div
              v-for="i in g.items"
              :key="i.id"
              class="list-item list-clickable"
              @click="selectInstance(i.id)"
            >
              <div class="item-left">
                <div class="item-icon">
                  <img v-if="loaderIconSrc(i)" :src="loaderIconSrc(i) || ''" width="20" height="20" alt="" />
                  <AlxIcon v-else :name="loaderIcon(i)" :size="20" />
                </div>
                <div class="item-info">
                  <div class="item-title">{{ i.name }}</div>
                  <div class="item-desc">{{ instanceDesc(i) }}</div>
                </div>
              </div>
              <div class="item-actions" @click.stop>
                <button
                  type="button"
                  class="item-action"
                  :class="{ active: isFavorite(i.id) }"
                  :title="isFavorite(i.id) ? '取消收藏' : '收藏'"
                  @click="toggleFavorite(i)"
                >
                  <AlxIcon :name="isFavorite(i.id) ? 'star-filled' : 'star'" :size="16" />
                </button>
                <button type="button" class="item-action" title="版本设置" @click="openSettings(i)">
                  <AlxIcon name="settings" :size="16" />
                </button>
                <button type="button" class="item-action danger" title="删除实例" @click="askDelete(i)">
                  <AlxIcon name="trash" :size="16" />
                </button>
              </div>
            </div>
            <div v-if="g.items.length === 0" class="version-group-empty">暂无实例</div>
          </div>
        </div>
      </div>
    </template>

    <!-- 外部文件夹：扫描 versions 目录得到的本地版本（只读） -->
    <template v-else>
      <div v-if="scanLoading && scannedVersions.length === 0" class="empty-state">
        <AlxIcon name="refresh" :size="32" class="spinning" />
        <div>正在扫描文件夹…</div>
      </div>

      <div v-else-if="scanError" class="empty-state">
        <AlxIcon name="info" :size="32" />
        <div>{{ scanError }}</div>
        <button type="button" class="btn-sub" @click="retryScan">重新扫描</button>
      </div>

      <div v-else-if="scannedVersions.length === 0" class="empty-state">
        <AlxIcon name="folder" :size="32" />
        <div>该文件夹下没有找到可用的 Minecraft 版本</div>
        <button type="button" class="btn-sub" @click="retryScan">重新扫描</button>
      </div>

      <template v-else>
        <div class="folder-hint">
          外部文件夹中的版本仅供查看，点击版本行可在资源管理器中打开版本目录。
        </div>

        <div
          v-for="g in scannedGroups"
          :key="'scan-' + g.key"
          class="version-card version-group"
          :class="{ open: isGroupOpen('scan-' + g.key) }"
        >
          <button
            type="button"
            class="version-group-header"
            @click="toggleGroup('scan-' + g.key)"
          >
            <span>{{ g.title }}（{{ g.items.length }}）</span>
            <AlxIcon name="chevron-down" :size="18" class="version-group-chevron" />
          </button>
          <div class="version-group-body">
            <div class="version-group-inner" :inert="!isGroupOpen('scan-' + g.key)">
              <div
                v-for="v in g.items"
                :key="v.path"
                class="list-item list-clickable"
                :title="v.path"
                @click="openScannedVersion(v)"
              >
                <div class="item-left">
                  <div class="item-icon">
                    <img
                      v-if="loaderIconUrl(normalizeLoader(v.loader))"
                      :src="loaderIconUrl(normalizeLoader(v.loader)) || ''"
                      width="20"
                      height="20"
                      alt=""
                    />
                    <AlxIcon v-else name="minecraft" :size="20" />
                  </div>
                  <div class="item-info">
                    <div class="item-title">{{ v.id }}</div>
                    <div class="item-desc">{{ scannedDesc(v) }}</div>
                  </div>
                </div>
                <div class="item-actions" @click.stop>
                  <button
                    type="button"
                    class="item-action"
                    title="打开版本文件夹"
                    @click="openScannedVersion(v)"
                  >
                    <AlxIcon name="folder" :size="16" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- 删除确认（二级锁） -->
    <AlxModal
      :open="pendingDelete !== null"
      title="删除实例"
      variant="danger"
      @close="pendingDelete = null"
    >
      <p class="modal-note">
        确定要删除「{{ pendingDelete?.name }}」吗？该实例的存档与配置会一并移除，此操作不可撤销。
      </p>
      <template #actions>
        <button type="button" class="btn-sub" @click="pendingDelete = null">取消</button>
        <button type="button" class="btn-download" :disabled="deleting" @click="confirmDelete">
          删除
        </button>
      </template>
    </AlxModal>
  </div>
</template>

<style scoped>
/* 外部文件夹只读提示 */
.folder-hint {
  margin-bottom: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--icon-bg);
  color: var(--text-sub);
  font-size: 12px;
  line-height: 1.5;
}

/* 行尾操作：默认淡显，悬停整行时完全显形；已收藏的星标常显 */
.item-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0.45;
  transition: opacity 0.15s;
}
.list-item:hover .item-actions,
.item-actions:has(.active) {
  opacity: 1;
}
.item-action {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-sub);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.item-action:hover {
  background: var(--icon-bg);
  color: var(--text-main);
}
.item-action.active {
  color: var(--text-main);
}
.item-action.danger:hover {
  color: #e5484d;
}
</style>
