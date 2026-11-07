<script setup lang="ts">
/**
 * 版本选择页（副页面）：
 *   侧栏 = 文件夹列表（见 SideNav 的子页面板）；本页内容 = 按加载器分组的实例，
 *   跟随侧栏选中的文件夹（当前文件夹显示实例，其余文件夹待内核扫描支持）。
 */
import { computed, onMounted, ref } from 'vue'
import { useAppStore } from '../stores/app'
import AlxIcon from '../components/AlxIcon.vue'
import AlxModal from '../components/AlxModal.vue'
import { toast } from '../lib/toast'
import { loaderIconUrl } from '../lib/loaderIcons'
import type { GameInstance } from '../lib/types'
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
    <!-- 非当前文件夹：暂无实例信息（内核扫描接入前） -->
    <div v-if="store.selectedFolderId !== 'current'" class="empty-state">
      <AlxIcon name="folder" :size="32" />
      <div>该文件夹暂无实例信息，扫描已有实例即将开放</div>
    </div>

    <template v-else>
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
