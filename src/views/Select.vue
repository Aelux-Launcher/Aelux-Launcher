<script setup lang="ts">
/**
 * 版本选择页（副页面，PCL 式布局的极简黑白演绎）：
 *   左栏「文件夹列表」：当前文件夹（启动器根目录自动生成的 .minecraft，可打开/刷新等）
 *   + 官方文件夹（自动识别，内核检测接入前显示未检测到）+ 添加已有文件夹 / 导入整合包；
 *   右栏「实例列表」：按加载器分组（原版 / Fabric / Forge…），点击行进实例详情。
 */
import { computed, ref } from 'vue'
import { useAppStore } from '../stores/app'
import { toast } from '../lib/toast'
import { call } from '../lib/bridge'
import PageHeader from '../components/PageHeader.vue'
import AlxIcon from '../components/AlxIcon.vue'
import type { StoredFolder } from '../lib/types'

const store = useAppStore()

/* ------------------------------ 文件夹列表 ------------------------------ */

/** 选中的文件夹（决定右栏显示哪个文件夹的实例）。 */
const selectedFolderId = ref('current')

/** 当前文件夹设置菜单开合。 */
const menuOpen = ref(false)

const FOLDER_NAME: Record<StoredFolder['type'], string> = {
  current: '当前文件夹',
  official: '官方文件夹',
  added: '',
}

function folderName(f: StoredFolder): string {
  if (f.type === 'added') {
    const tail = f.path.split(/[\\/]/).filter(Boolean).pop()
    return tail || f.path || '文件夹'
  }
  return FOLDER_NAME[f.type]
}

function selectFolder(id: string) {
  selectedFolderId.value = id
  menuOpen.value = false
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value
}

/** 当前文件夹动作：重命名 / 打开 / 刷新 / 清空（内核文件夹管线接入前仅开放「打开」）。 */
async function folderAction(action: 'rename' | 'open' | 'refresh' | 'clear') {
  menuOpen.value = false
  const folder = store.gameFolders.find((f) => f.id === selectedFolderId.value)
  if (action === 'open') {
    const path = folder?.path
    if (!path) {
      toast.warning('该文件夹路径不可用')
      return
    }
    try {
      await call('open_folder_in_explorer', { path })
    } catch (e) {
      toast.error(`打开失败：${(e as Error).message}`)
    }
    return
  }
  const HINT: Record<typeof action, string> = {
    rename: '重命名',
    refresh: '刷新',
    clear: '清空',
  }
  toast.info(`「${HINT[action]}」将在内核文件夹管理就绪后开放`)
}

/** 删除已添加的文件夹。 */
async function deleteFolder(id: string) {
  const folder = store.gameFolders.find((f) => f.id === id)
  if (!folder) return
  if (!window.confirm(`确定删除文件夹「${folderName(folder)}」？`)) return
  await store.removeGameFolder(id)
  if (selectedFolderId.value === id) selectedFolderId.value = 'current'
  toast.success('文件夹已移除')
}

/* ------------------------------ 实例分组列表 ------------------------------ */

/** 清单版本类型 → 中文。 */
const KIND_LABEL: Record<string, string> = {
  release: '正式版',
  snapshot: '快照',
  old_beta: 'Beta 旧版',
  old_alpha: 'Alpha 旧版',
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

/** 按加载器分组的实例（空组隐藏）。 */
const instanceGroups = computed(() =>
  LOADER_ORDER.map((key) => ({
    key,
    title: LOADER_TITLE[key],
    items: store.instances.filter((i) => (i.loader || 'vanilla') === key),
  })).filter((g) => g.items.length > 0),
)

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

/** 实例行副文本：`正式版 1.21.4 · Fabric 0.16.9`。 */
function instanceDesc(instance: { version: string; loader?: string | null; loaderVersion?: string | null }): string {
  const entry = store.versions.find((v) => v.id === instance.version)
  const kind = entry ? (KIND_LABEL[entry.kind] ?? entry.kind) : '未知类型'
  const lv = instance.loaderVersion ? ` · ${LOADER_SHORT[instance.loader ?? ''] ?? ''} ${instance.loaderVersion}`.trim() : ''
  return `${kind} ${instance.version}${lv}`
}

/** 点击实例 → 实例详情页。 */
function openInstance(id: string) {
  store.openSubPage({ kind: 'instance', instanceId: id, tab: 'overall' })
}
</script>

<template>
  <div class="page-view active sub-page">
    <PageHeader title="版本选择" />

    <div class="select-layout">
      <!-- 左栏：文件夹列表 + 添加和导入 -->
      <aside class="folder-panel">
        <div class="folder-section-title">文件夹列表</div>

        <div
          v-for="f in store.gameFolders"
          :key="f.id"
          class="folder-card"
          :class="{ selected: selectedFolderId === f.id }"
          @click="selectFolder(f.id)"
        >
          <div class="folder-head">
            <span class="folder-name">{{ folderName(f) }}</span>
            <!-- 当前文件夹：设置菜单（重命名 / 打开 / 刷新 / 清空，自动生成的文件夹不可删） -->
            <button
              v-if="f.type === 'current'"
              type="button"
              class="icon-btn"
              title="文件夹设置"
              @click.stop="toggleMenu"
            >
              <AlxIcon name="settings" :size="15" />
            </button>
            <!-- 添加的文件夹：可删除 -->
            <button
              v-else-if="f.type === 'added'"
              type="button"
              class="icon-btn account-remove"
              title="删除文件夹"
              @click.stop="deleteFolder(f.id)"
            >
              <AlxIcon name="trash" :size="15" />
            </button>
          </div>
          <div class="folder-path">{{ f.path || '未检测到官方启动器文件夹' }}</div>

          <!-- 设置菜单 -->
          <div v-if="menuOpen && f.type === 'current'" class="folder-menu" @click.stop>
            <button type="button" @click="folderAction('rename')">重命名</button>
            <button type="button" @click="folderAction('open')">打开</button>
            <button type="button" @click="folderAction('refresh')">刷新</button>
            <button type="button" @click="folderAction('clear')">清空</button>
          </div>
        </div>

        <div class="folder-section-title">添加和导入</div>
        <button type="button" class="add-account-item" @click="store.addGameFolder">
          <AlxIcon name="plus" :size="18" />
          <span>
            <span class="main">添加已有文件夹</span>
            <span class="sub">扫描已有游戏目录</span>
          </span>
        </button>
        <button type="button" class="add-account-item" @click="store.importModpack">
          <AlxIcon name="package" :size="18" />
          <span>
            <span class="main">导入整合包</span>
            <span class="sub">支持 .mrpack</span>
          </span>
        </button>
      </aside>

      <!-- 右栏：当前文件夹的实例（按加载器分组） -->
      <div class="instance-groups">
        <div v-if="selectedFolderId !== 'current'" class="empty-state">
          <AlxIcon name="folder" :size="32" />
          <div>该文件夹暂无实例信息，扫描已有实例即将开放</div>
        </div>

        <template v-else>
          <div v-if="store.instances.length === 0" class="empty-state">
            <AlxIcon name="info" :size="32" />
            <div>当前文件夹还没有实例，去「下载」页安装一个版本吧</div>
          </div>

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
                  @click="openInstance(i.id)"
                >
                  <div class="item-left">
                    <div class="item-icon">
                      <AlxIcon name="columns" :size="20" />
                    </div>
                    <div class="item-info">
                      <div class="item-title">{{ i.name }}</div>
                      <div class="item-desc">{{ instanceDesc(i) }}</div>
                    </div>
                  </div>
                </div>
                <div v-if="g.items.length === 0" class="version-group-empty">暂无实例</div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
