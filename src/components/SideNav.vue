<script setup lang="ts">
/**
 * 左侧导航栏（220px）：
 *   导航按模块分组切换 —— 启动页显示「基础」组，进入下载 / 设置 / 更多后
 *   侧栏切换为对应模块的分类菜单；底部固定账户区。
 *   视觉与交互 1:1 对应设计稿（nav-group / nav-item / account-card）。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useAppStore } from '../stores/app'
import { toast } from '../lib/toast'
import { confirmDialog, promptDialog } from '../lib/dialog'
import { call } from '../lib/bridge'
import AlxIcon from './AlxIcon.vue'
import AuthServerModal from './AuthServerModal.vue'
import AuthLoginModal from './AuthLoginModal.vue'
import MicrosoftLoginModal from './MicrosoftLoginModal.vue'
import type { AuthServer, StoredFolder } from '../lib/types'

interface NavEntry {
  key: string
  label: string
  icon: string
}

const store = useAppStore()

/** 账户卡 → 账户管理页（多账户列表）。 */
function openAccounts() {
  store.openSubPage({ kind: 'accounts' })
}

/** 各模块的侧栏分组（key 与路由参数一致）。 */
const GROUPS: Record<string, Array<{ title: string; items: NavEntry[] }>> = {
  download: [
    {
      title: '游戏',
      items: [
        { key: 'original', label: '原版', icon: 'package' },
        { key: 'modpack', label: '整合包', icon: 'minecraft' },
      ],
    },
    {
      title: '资源',
      items: [
        { key: 'mod', label: '模组', icon: 'puzzle' },
        { key: 'world', label: '世界', icon: 'globe' },
        { key: 'resourcepack', label: '资源包', icon: 'image' },
        { key: 'datapack', label: '数据包', icon: 'grid' },
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
        { key: 'appearance', label: '外观', icon: 'shirt' },
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
      { key: 'more', label: '更多', icon: 'apps' },
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

/* ----- 下载分类刷新（侧栏项末尾的「刷新」按钮） ----- */

/** 正在刷新的分类 key：null = 空闲（同时防止重复点击）。 */
const refreshingKey = ref<string | null>(null)

/** 刷新图标至少旋转这么久，避免瞬时完成时动画一闪而过。 */
const MIN_REFRESH_SPIN_MS = 700

/** 版本设置页的「刷新」：游戏设置是初始化，其余面板重新加载数据。 */
async function refreshInstanceTab(key: string) {
  if (refreshingKey.value) return
  refreshingKey.value = key
  const started = performance.now()
  try {
    store.reloadInstanceTab(key)
    // 面板自己的 toast 会立即给出结果，这里只保证旋转动画有可感知的时长。
    const remain = MIN_REFRESH_SPIN_MS - (performance.now() - started)
    if (remain > 0) await new Promise((resolve) => setTimeout(resolve, remain))
  } finally {
    refreshingKey.value = null
  }
}

async function refreshCategory(key: string) {
  if (refreshingKey.value) return
  refreshingKey.value = key
  const started = performance.now()
  try {
    if (key === 'original') {
      await store.loadVersions()
      if (store.versionsError) toast.error(`版本列表刷新失败：${store.versionsError}`)
      else toast.success('版本列表已刷新')
    } else {
      // 社区资源：按当前筛选条件重查，并重置到第一页
      await store.searchResources()
      if (store.resourceError) toast.error(`资源列表刷新失败：${store.resourceError}`)
      else toast.success('资源列表已刷新')
    }
  } finally {
    // 缓存命中时请求会瞬间返回；补足最短旋转时长，让刷新有可感知的回馈。
    const remain = MIN_REFRESH_SPIN_MS - (performance.now() - started)
    if (remain > 0) await new Promise((resolve) => setTimeout(resolve, remain))
    refreshingKey.value = null
  }
}

/* ------------------- 子页侧栏面板（子页替换导航区） ------------------- */

/** 当前是否处于带侧栏面板的子页（版本选择 / 账户管理 / 版本设置）。 */
const sidePanelKind = computed(() => {
  const kind = store.subPage?.kind
  return kind === 'select' || kind === 'accounts' || kind === 'instance' ? kind : null
})

/* ----- 版本设置页：左栏切换 版本概览 / 游戏设置 / 自动安装 / 模组 / 资源包 / 世界 / 原理图管理 ----- */

const INSTANCE_TABS = [
  { key: 'overall', label: '版本概览', icon: 'layout' },
  { key: 'setup', label: '游戏设置', icon: 'settings' },
  { key: 'install', label: '自动安装', icon: 'package' },
  { key: 'mod', label: '模组管理', icon: 'puzzle' },
  { key: 'resourcepack', label: '资源包管理', icon: 'shirt' },
  { key: 'world', label: '世界管理', icon: 'globe' },
  { key: 'schematic', label: '原理图管理', icon: 'grid' },
] as const

/** 当前版本设置标签（非该子页时回落「概览」）。 */
const instanceTab = computed(() => {
  const page = store.subPage
  return page && page.kind === 'instance' ? page.tab : 'overall'
})

/* ----- 版本选择页：文件夹列表 ----- */

/** 当前展开设置菜单的文件夹 id（null = 未展开）。 */
const folderMenuId = ref<string | null>(null)

function toggleFolderMenu(id: string) {
  folderMenuId.value = folderMenuId.value === id ? null : id
}

/** 点击菜单以外的地方收起菜单。 */
function closeFolderMenu() {
  folderMenuId.value = null
}

onMounted(() => document.addEventListener('click', closeFolderMenu))
onBeforeUnmount(() => document.removeEventListener('click', closeFolderMenu))

/** 文件夹动作：重命名 / 打开 / 刷新 / 清空（内核文件夹管线接入前仅开放「打开」）。 */
async function folderAction(action: 'rename' | 'open' | 'refresh' | 'clear', folderId: string) {
  folderMenuId.value = null
  const folder = store.gameFolders.find((f) => f.id === folderId)
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
  const ok = await confirmDialog({
    title: '删除文件夹',
    message: `确定删除文件夹「${store.folderDisplayName(folder)}」？该操作不可撤销。`,
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  await store.removeGameFolder(id)
  if (store.selectedFolderId === id) store.selectFolder('current')
  toast.success('文件夹已移除')
}

/* ----- 账户管理页：添加账户 ----- */

/** 微软账户：先弹窗确认，避免一点就跳转浏览器。 */
const microsoftModalOpen = ref(false)

function addMicrosoft() {
  microsoftModalOpen.value = true
}

async function startMicrosoftLogin() {
  microsoftModalOpen.value = false
  await store.startMicrosoftLogin()
}

async function addOffline() {
  const r = await promptDialog({
    title: '添加离线账户',
    message: '输入游戏用户名，将以本地身份加入游戏。',
    fields: [{ key: 'username', label: '用户名', placeholder: '例如 Steve' }],
    confirmText: '添加',
  })
  if (!r) return
  const name = r.username.trim()
  if (!name) {
    toast.warning('用户名不能为空')
    return
  }
  try {
    await store.loginOffline(name)
    toast.success(`已添加离线账户「${name}」`)
  } catch (e) {
    toast.error((e as Error).message)
  }
}

/** 添加外置登录认证服务器（两步弹窗）。 */
function addAuthServer() {
  authServerModalOpen.value = true
}

const authServerModalOpen = ref(false)

async function submitAuthServer(server: { name: string; url: string }) {
  try {
    await store.addAuthServer(server.name, server.url)
    authServerModalOpen.value = false
    toast.success('认证服务器已添加')
  } catch (e) {
    toast.error((e as Error).message)
  }
}

/** 服务器地址 → 域名（列表里作为描述显示，完整地址只放 hover title）。 */
function serverHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** 认证服务器行点击 → 添加该服务器的外置登录账户。 */
const authLoginOpen = ref(false)
const authLoginServer = ref<AuthServer | null>(null)

function openAuthLogin(server: AuthServer) {
  authLoginServer.value = server
  authLoginOpen.value = true
}

function submitAuthLogin() {
  authLoginOpen.value = false
  // 内核尚未提供 authlib-injector 认证接口：先保留完整前端流程
  toast.info('外置登录认证尚未接入内核，账户暂未添加')
}

/** 删除认证服务器（二级锁：弹窗确认）。 */
async function deleteAuthServer(id: string) {
  const srv = store.authServers.find((s) => s.id === id)
  if (!srv) return
  const ok = await confirmDialog({
    title: '删除认证服务器',
    message: `确定删除认证服务器「${srv.name}」？该操作不可撤销。`,
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  await store.removeAuthServer(id)
  toast.success('认证服务器已删除')
}

/** 文件夹选中态（侧栏与内容区共享 store 状态）。 */
function selectFolder(f: StoredFolder) {
  folderMenuId.value = null
  store.selectFolder(f.id)
}
</script>

<template>
  <aside class="sidebar">
    <!-- 导航区：可滚动；账户区在滚动容器之外，固定于底部 -->
    <div class="sidebar-scroll">
      <!-- 版本选择页：侧栏切换为文件夹列表（子页侧栏） -->
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
            <!-- 每个文件夹都有设置菜单（重命名 / 打开 / 刷新 / 清空） -->
            <button
              type="button"
              class="icon-btn"
              title="文件夹设置"
              @click.stop="toggleFolderMenu(f.id)"
            >
              <AlxIcon name="settings" :size="15" />
            </button>
            <!-- 添加的文件夹额外提供删除 -->
            <button
              v-if="f.type === 'added'"
              type="button"
              class="icon-btn account-remove"
              title="删除文件夹"
              @click.stop="deleteFolder(f.id)"
            >
              <AlxIcon name="trash" :size="15" />
            </button>
          </div>
          <div class="folder-path">{{ f.path || '未检测到官方启动器文件夹' }}</div>

          <!-- 设置菜单（点击别处自动收起） -->
          <div v-if="folderMenuId === f.id" class="folder-menu" @click.stop>
            <button type="button" @click="folderAction('rename', f.id)">重命名</button>
            <button type="button" @click="folderAction('open', f.id)">打开</button>
            <button type="button" @click="folderAction('refresh', f.id)">刷新</button>
            <button type="button" @click="folderAction('clear', f.id)">清空</button>
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

      <!-- 账户管理页：侧栏切换为添加账户 + 外置登录服务器（子页侧栏） -->
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

        <!-- 已添加的外置登录服务器：依次显示在离线模式下方（完整地址仅 hover 显示） -->
        <div
          v-for="s in store.authServers"
          :key="s.id"
          class="auth-server-row clickable"
          :title="s.url"
          @click="openAuthLogin(s)"
        >
          <div class="auth-server-info">
            <div class="auth-server-name">{{ s.name }}</div>
            <div v-if="serverHost(s.url) !== s.name" class="auth-server-desc">
              {{ serverHost(s.url) }}
            </div>
          </div>
          <button
            type="button"
            class="icon-btn account-remove"
            title="删除认证服务器"
            @click.stop="deleteAuthServer(s.id)"
          >
            <AlxIcon name="x" :size="15" />
          </button>
        </div>
      </div>

      <!-- 版本设置页：侧栏切换为六个版本管理面板（子页侧栏） -->
      <div v-else-if="sidePanelKind === 'instance'">
        <div class="nav-group active">
          <div class="nav-title">版本设置</div>
          <div
            v-for="item in INSTANCE_TABS"
            :key="item.key"
            role="button"
            tabindex="0"
            :class="['nav-item', instanceTab === item.key ? 'active' : '']"
            @click="store.setInstanceTab(item.key)"
            @keydown.enter.prevent="store.setInstanceTab(item.key)"
            @keydown.space.prevent="store.setInstanceTab(item.key)"
          >
            <AlxIcon :name="item.icon" :size="20" class="nav-icon" />
            {{ item.label }}
            <!-- 游戏设置 = 初始化；其余管理页 = 重新加载数据（只在当前页显示） -->
            <button
              v-if="
                instanceTab === item.key && item.key !== 'overall' && item.key !== 'install'
              "
              type="button"
              class="nav-item-action"
              :title="item.key === 'setup' ? '初始化版本设置' : `重新加载${item.label}`"
              :disabled="refreshingKey !== null"
              @click.stop="refreshInstanceTab(item.key)"
            >
              <AlxIcon
                name="refresh"
                :size="15"
                :class="{ spinning: refreshingKey === item.key }"
              />
            </button>
          </div>
        </div>
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
              <AlxIcon :name="item.icon" :size="20" class="nav-icon" />
              {{ item.label }}
              <button
                v-if="sideModule === 'download' && activeKey === item.key"
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

    <!-- 账户管理页：底部固定「添加认证服务器」 -->
    <div v-if="sidePanelKind === 'accounts'" class="account-section">
      <button type="button" class="add-account-item auth-server-add" @click="addAuthServer">
        <AlxIcon name="globe" :size="18" />
        <span>
          <span class="main">添加认证服务器</span>
          <span class="sub">外置登录 · authlib-injector</span>
        </span>
      </button>
    </div>

    <!-- 底部账户区：只在启动页（无子页）显示；子页与其它模块的侧栏不占这块高度。 -->
    <div v-else-if="sideModule === 'home' && !store.subPage" class="account-section">
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
    <!-- 添加认证服务器弹窗（两步；账户管理页底部按钮触发） -->
    <AuthServerModal
      :open="authServerModalOpen"
      @close="authServerModalOpen = false"
      @submit="submitAuthServer"
    />

    <!-- 外置登录账户弹窗（点击认证服务器条目触发） -->
    <AuthLoginModal
      :open="authLoginOpen"
      :server="authLoginServer"
      @close="authLoginOpen = false"
      @submit="submitAuthLogin"
    />

    <!-- 微软账户弹窗（确认后才跳转浏览器登录） -->
    <MicrosoftLoginModal
      :open="microsoftModalOpen"
      @close="microsoftModalOpen = false"
      @submit="startMicrosoftLogin"
    />
  </aside>
</template>
