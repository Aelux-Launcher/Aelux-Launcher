<script setup lang="ts">
/**
 * 左侧导航栏（220px）：
 *   导航按模块分组切换 —— 启动页显示「基础」组，进入下载 / 设置 / 更多后
 *   侧栏切换为对应模块的分类菜单；底部固定账户区。
 *   视觉与交互 1:1 对应设计稿（nav-group / nav-item / account-card）。
 */
import { computed, ref } from 'vue'
import { useAppStore } from '../stores/app'
import { toast } from '../lib/toast'
import { call } from '../lib/bridge'
import AlxIcon from './AlxIcon.vue'
import type { StoredFolder } from '../lib/types'

interface NavEntry {
  key: string
  label: string
  icon: string
}

const store = useAppStore()

/** 账户卡 → 账户管理页（多账户列表，参考 HMCL）。 */
function openAccounts() {
  store.openSubPage({ kind: 'accounts' })
}

/** 各模块的侧栏分组（key 与路由参数一致）。 */
const GROUPS: Record<string, Array<{ title: string; items: NavEntry[] }>> = {
  download: [
    {
      title: '游戏',
      items: [
        { key: 'original', label: '原版', icon: 'columns' },
        { key: 'modpack', label: '整合包', icon: 'package' },
      ],
    },
    {
      title: '资源',
      items: [
        { key: 'mod', label: '模组', icon: 'tool' },
        { key: 'world', label: '世界', icon: 'globe' },
        { key: 'resourcepack', label: '资源包', icon: 'image' },
        { key: 'datapack', label: '数据包', icon: 'package' },
        { key: 'shader', label: '光影包', icon: 'sun' },
      ],
    },
  ],
  settings: [
    {
      title: '游戏',
      items: [
        { key: 'global', label: '全局设置', icon: 'settings' },
        { key: 'java', label: 'Java管理', icon: 'coffee' },
      ],
    },
    {
      title: '启动器',
      items: [
        { key: 'general', label: '通用', icon: 'layout' },
        { key: 'appearance', label: '外观', icon: 'aperture' },
        { key: 'download', label: '下载', icon: 'download' },
      ],
    },
  ],
  more: [
    {
      title: '支持',
      items: [
        { key: 'help', label: '帮助', icon: 'help-circle' },
        { key: 'about', label: '关于', icon: 'info' },
        { key: 'feedback', label: '反馈', icon: 'message-square' },
      ],
    },
    {
      title: '社区',
      items: [{ key: 'online', label: '联机', icon: 'globe' }],
    },
  ],
}

/** 基础组（启动页态）：进入各模块的入口。 */
const BASE_GROUP: Array<{ title: string; items: NavEntry[] }> = [
  {
    title: '基础',
    items: [
      { key: 'download', label: '下载', icon: 'download' },
      { key: 'settings', label: '设置', icon: 'settings' },
      { key: 'more', label: '更多', icon: 'more-horizontal' },
    ],
  },
]

/** 当前侧栏应显示的模块：详情页保持来源模块，否则跟随路由。 */
const sideModule = computed(() => store.sideModule)

const groups = computed(() =>
  sideModule.value === 'home' ? BASE_GROUP : (GROUPS[sideModule.value] ?? []),
)

/** 当前高亮的分类 key（下载 / 设置 / 更多各自的子项）。 */
const activeKey = computed(() => {
  const m = sideModule.value
  if (m === 'download') return String(store.route.params.cat ?? store.navState.download)
  if (m === 'settings') return String(store.route.params.sec ?? store.navState.settings)
  if (m === 'more') return String(store.route.params.sec ?? store.navState.more)
  return ''
})

function onNav(key: string) {
  const m = sideModule.value
  if (m === 'home') {
    store.setView(key as 'download' | 'settings' | 'more')
    return
  }
  store.setNav(m, key)
  void store.routerPush(`/${m}/${key}`)
}

/* ----- 下载分类刷新（PCL 侧栏项末尾的「刷新」按钮） ----- */

/** 正在刷新的分类 key：null = 空闲（同时防止重复点击）。 */
const refreshingKey = ref<string | null>(null)

async function refreshCategory(key: string) {
  if (refreshingKey.value) return
  refreshingKey.value = key
  try {
    if (key === 'original') {
      await store.loadVersions()
      if (store.versionsError) toast.error(`版本清单刷新失败：${store.versionsError}`)
      else toast.success('版本清单已刷新')
    } else {
      // 社区资源：按当前筛选条件重查，页码归 0（等价 PCL 清 Storage + PageRestart）
      await store.searchResources()
      if (store.resourceError) toast.error(`资源列表刷新失败：${store.resourceError}`)
      else toast.success('资源列表已刷新')
    }
  } finally {
    refreshingKey.value = null
  }
}

/* ------------------- 子页侧栏面板（PCL 式：子页替换导航区） ------------------- */

/** 当前是否处于带侧栏面板的子页（版本选择 → 文件夹列表；账户管理 → 添加账户）。 */
const sidePanelKind = computed(() => {
  const kind = store.subPage?.kind
  return kind === 'select' || kind === 'accounts' ? kind : null
})

/* ----- 版本选择页：文件夹列表 ----- */

const folderMenuOpen = ref(false)

function toggleFolderMenu() {
  folderMenuOpen.value = !folderMenuOpen.value
}

/** 当前文件夹动作：重命名 / 打开 / 刷新 / 清空（内核文件夹管线接入前仅开放「打开」）。 */
async function folderAction(action: 'rename' | 'open' | 'refresh' | 'clear') {
  folderMenuOpen.value = false
  const folder = store.gameFolders.find((f) => f.id === store.selectedFolderId)
  if (action === 'open') {
    if (!folder?.path) {
      toast.warning('该文件夹路径不可用')
      return
    }
    try {
      await call('open_folder_in_explorer', { path: folder.path })
    } catch (e) {
      toast.error(`打开失败：${(e as Error).message}`)
    }
    return
  }
  const HINT = { rename: '重命名', refresh: '刷新', clear: '清空' } as const
  toast.info(`「${HINT[action]}」将在内核文件夹管理就绪后开放`)
}

/** 删除已添加的文件夹。 */
async function deleteFolder(id: string) {
  const folder = store.gameFolders.find((f) => f.id === id)
  if (!folder) return
  if (!window.confirm(`确定删除文件夹「${store.folderDisplayName(folder)}」？`)) return
  await store.removeGameFolder(id)
  if (store.selectedFolderId === id) store.selectFolder('current')
  toast.success('文件夹已移除')
}

/* ----- 账户管理页：添加账户 ----- */

async function addMicrosoft() {
  await store.startMicrosoftLogin()
}

async function addOffline() {
  const name = window.prompt('输入游戏用户名（离线登录）')
  if (!name) return
  try {
    await store.loginOffline(name)
    toast.success(`已添加离线账户「${name.trim()}」`)
  } catch (e) {
    toast.error((e as Error).message)
  }
}

/** 文件夹选中态（侧栏与内容区共享 store 状态）。 */
function selectFolder(f: StoredFolder) {
  folderMenuOpen.value = false
  store.selectFolder(f.id)
}
</script>

<template>
  <aside class="sidebar">
    <!-- 导航区：可滚动；账户区在滚动容器之外，固定于底部 -->
    <div class="sidebar-scroll">
      <!-- 版本选择页：侧栏切换为文件夹列表（PCL 式） -->
      <div v-if="sidePanelKind === 'select'" class="folder-panel">
        <div class="folder-section-title">文件夹列表</div>

        <div
          v-for="f in store.gameFolders"
          :key="f.id"
          class="folder-card"
          :class="{ selected: store.selectedFolderId === f.id }"
          @click="selectFolder(f)"
        >
          <div class="folder-head">
            <span class="folder-name">{{ store.folderDisplayName(f) }}</span>
            <!-- 当前文件夹：设置菜单（重命名 / 打开 / 刷新 / 清空，自动生成的文件夹不可删） -->
            <button
              v-if="f.type === 'current'"
              type="button"
              class="icon-btn"
              title="文件夹设置"
              @click.stop="toggleFolderMenu"
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
          <div v-if="folderMenuOpen && f.type === 'current'" class="folder-menu" @click.stop>
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
      </div>

      <!-- 账户管理页：侧栏切换为添加账户（PCL 式） -->
      <div v-else-if="sidePanelKind === 'accounts'" class="folder-panel">
        <div class="folder-section-title">添加账户</div>
        <button type="button" class="add-account-item" @click="addMicrosoft">
          <AlxIcon name="grid" :size="18" />
          <span>
            <span class="main">微软账户</span>
            <span class="sub">正版验证</span>
          </span>
        </button>
        <button type="button" class="add-account-item" @click="addOffline">
          <AlxIcon name="user" :size="18" />
          <span>
            <span class="main">离线模式</span>
            <span class="sub">本地身份</span>
          </span>
        </button>
      </div>

      <!-- 常规导航 -->
      <template v-else>
        <template v-for="group in groups" :key="group.title">
          <div class="nav-group active">
            <div class="nav-title">{{ group.title }}</div>
            <div
              v-for="item in group.items"
              :key="item.key"
              role="button"
              tabindex="0"
              :class="['nav-item', activeKey === item.key ? 'active' : '']"
              @click="onNav(item.key)"
              @keydown.enter.prevent="onNav(item.key)"
              @keydown.space.prevent="onNav(item.key)"
            >
              <AlxIcon :name="item.icon" :size="16" />
              {{ item.label }}
              <button
                v-if="sideModule === 'download' && activeKey === item.key && item.key !== 'world'"
                type="button"
                class="nav-item-action"
                :title="`刷新${item.label}`"
                :disabled="
                  refreshingKey !== null ||
                  (item.key === 'original' ? store.versionsLoading : store.resourceLoading)
                "
                @click.stop="refreshCategory(item.key)"
              >
                <AlxIcon
                  name="refresh"
                  :size="15"
                  :class="{ spinning: refreshingKey === item.key }"
                />
              </button>
            </div>
          </div>
        </template>
      </template>
    </div>

    <!-- 底部账户区：点击进入账户管理页 -->
    <div class="account-section">
      <div class="account-title">账户</div>
      <button type="button" class="account-card" @click="openAccounts">
        <div class="account-avatar">
          <AlxIcon name="user" :size="18" />
        </div>
        <div class="account-info">
          <div class="main">{{ store.session ? store.session.username : '没有游戏账户' }}</div>
          <div class="sub">{{ store.session ? store.session.type === 'offline' ? '离线账户' : '正版账户' : '点击此处添加账户' }}</div>
        </div>
      </button>
    </div>
  </aside>
</template>
