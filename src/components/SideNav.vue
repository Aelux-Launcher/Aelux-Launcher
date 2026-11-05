<script setup lang="ts">
/**
 * 左侧导航栏（220px）：
 *   导航按模块分组切换 —— 启动页显示「基础」组，进入下载 / 设置 / 更多后
 *   侧栏切换为对应模块的分类菜单；底部固定账户区。
 *   视觉与交互 1:1 对应设计稿（nav-group / nav-item / account-card）。
 */
import { computed } from 'vue'
import { useAppStore } from '../stores/app'
import AlxIcon from './AlxIcon.vue'

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
</script>

<template>
  <aside class="sidebar">
    <!-- 导航区：可滚动；账户区在滚动容器之外，固定于底部 -->
    <div class="sidebar-scroll">
      <template v-for="group in groups" :key="group.title">
        <div class="nav-group active">
          <div class="nav-title">{{ group.title }}</div>
          <button
            v-for="item in group.items"
            :key="item.key"
            type="button"
            :class="['nav-item', activeKey === item.key ? 'active' : '']"
            @click="onNav(item.key)"
          >
            <AlxIcon :name="item.icon" :size="16" />
            {{ item.label }}
          </button>
        </div>
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
