<script setup lang="ts">
/**
 * 账户管理页（副页面）：
 *   侧栏 = 添加账户（见 SideNav 的子页面板）；本页内容 = 账户列表
 *   （单选当前账户 + 删除；微软 / 离线均可多账户并存）。
 * 设备码登录弹窗由 App.vue 全局挂载，状态在 store。
 */
import { computed, onMounted, ref } from 'vue'
import { useAppStore } from '../stores/app'
import { toast } from '../lib/toast'
import { confirmDialog } from '../lib/dialog'
import { call, isTauri, kvGet } from '../lib/bridge'
import { open } from '@tauri-apps/plugin-dialog'
import AlxIcon from '../components/AlxIcon.vue'
import AccountAvatar from '../components/AccountAvatar.vue'
import PageHeader from '../components/PageHeader.vue'
import type { StoredAccount } from '../lib/types'

const store = useAppStore()

const TYPE_LABEL: Record<string, string> = {
  microsoft: '微软正版',
  third: '外置登录',
  offline: '离线模式',
}

/** 当前账户 id（微软按 msaId，离线按 uuid —— 与 StoredAccount.id 一致）。 */
const currentId = computed(() => {
  if (!store.session) return null
  const hit = store.accounts.find((a) => a.uuid === store.session?.uuid)
  return hit?.id ?? null
})

/** 登录时间（Unix 秒）→ `2026/11/05 12:30`。 */
function fmtTime(unix: string): string {
  const n = Number(unix)
  if (!Number.isFinite(n) || n <= 0) return ''
  const d = new Date(n * 1000)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 选中账户 → 设为当前会话。 */
async function selectAccount(id: string) {
  if (id === currentId.value) return
  await store.switchAccount(id)
  toast.success(`已切换到「${store.session?.username ?? ''}」`)
}

/** 正在刷新的账户 id（防止重复点击）。 */
const refreshingId = ref<string | null>(null)

/** 刷新账户：三类账户都先二级锁确认，再按类型执行验证 / 刷新令牌。 */
async function refreshAccount(a: StoredAccount) {
  if (refreshingId.value) return
  const ok = await confirmDialog({
    title: '刷新账户',
    message:
      a.type === 'microsoft'
        ? '将使用本机保存的凭证静默续期；若凭证已失效，需要重新登录微软账户。确定继续？'
        : a.type === 'third'
          ? '将通过认证服务器重新验证账户并刷新令牌。确定继续？'
          : '离线账户无需联网验证，刷新只会重新读取本地身份。确定继续？',
    confirmText: '刷新',
  })
  if (!ok) return
  refreshingId.value = a.id
  try {
    if (a.type === 'microsoft') {
      const refreshed = await call<StoredAccount>('refresh_microsoft_account', { accountId: a.id })
      await store.loadAccounts()
      await store.restoreSession()
      toast.success(`已刷新「${refreshed.username}」`)
    } else if (a.type === 'third') {
      const refreshed = await call<StoredAccount>('authlib_refresh', { accountId: a.id })
      await store.loadAccounts()
      await store.restoreSession()
      toast.success(`已刷新「${refreshed.username}」`)
    } else {
      toast.info('离线账户无需刷新')
    }
  } catch (e) {
    toast.error(`刷新失败：${(e as Error).message}`)
  } finally {
    refreshingId.value = null
  }
}

/* ------------------------------ 本地头像（皮肤） ------------------------------ */

/** 账户头像路径映射（account.id → 本地图片路径）。 */
const SKIN_KEY = 'aelux.account.skins'
const skinMap = ref<Record<string, string>>({})

/** 读取已保存的头像。 */
async function loadSkins() {
  const raw = await kvGet(SKIN_KEY)
  if (!raw) return
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object') skinMap.value = parsed as Record<string, string>
  } catch {
    /* 损坏的头像数据忽略 */
  }
}

/** 落盘头像映射。 */
async function persistSkins() {
  await call('kv_set', { key: SKIN_KEY, value: JSON.stringify(skinMap.value) })
}

/** 上传 / 更换本地头像：选一张 PNG 并用它作为账户头像。 */
async function editSkin(a: StoredAccount) {
  if (!isTauri) {
    toast.info('浏览器预览无法访问本地文件，请在桌面端上传头像。')
    return
  }
  try {
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [{ name: '皮肤图片', extensions: ['png'] }],
    })
    if (typeof picked !== 'string') return
    skinMap.value = { ...skinMap.value, [a.id]: picked }
    await persistSkins()
    toast.success(`已为「${a.username}」设置本地头像`)
  } catch (e) {
    toast.error(`设置头像失败：${(e as Error).message}`)
  }
}

onMounted(() => {
  void loadSkins()
})

/** 复制账户 UUID 到系统剪贴板。 */
async function copyUuid(a: StoredAccount) {
  try {
    await navigator.clipboard.writeText(a.uuid)
    toast.success('UUID 已复制')
  } catch {
    toast.error('复制失败，请手动复制')
  }
}

/** 删除账户（当前账户删除后登出）。 */
async function deleteAccount(id: string) {
  const acc = store.accounts.find((a) => a.id === id)
  if (!acc) return
  const ok = await confirmDialog({
    title: '删除账户',
    message: `确定删除账户「${acc.username}」？该操作不可撤销。`,
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  await store.removeAccount(id)
  toast.success('账户已删除')
}
</script>

<template>
  <div class="page-view active sub-page">
    <PageHeader title="账户管理" />

    <div class="account-list">
      <div v-if="store.accounts.length === 0" class="empty-state account-empty">
        <AlxIcon name="user" :size="32" />
        <div>还没有账户，从左侧添加一个</div>
      </div>

      <div
        v-for="a in store.accounts"
        :key="a.id"
        class="account-row"
        :class="{ current: a.id === currentId }"
        @click="selectAccount(a.id)"
      >
        <span class="account-radio" :class="{ on: a.id === currentId }" />
        <div class="item-icon account-avatar">
          <AccountAvatar
            :name="a.username"
            :type="a.type"
            :uuid="a.uuid"
            :override="skinMap[a.id]"
            :skin-url="store.skinUrls[a.id]"
            :size="32"
          />
        </div>
        <div class="item-info">
          <div class="item-title">{{ a.username }}</div>
          <div class="item-desc">
            {{ TYPE_LABEL[a.type] }}<template v-if="fmtTime(a.loggedInAt)"> · 登录于 {{ fmtTime(a.loggedInAt) }}</template>
          </div>
        </div>
        <div class="item-right">
          <button
            type="button"
            class="icon-btn"
            title="刷新账户"
            :disabled="refreshingId !== null"
            @click.stop="refreshAccount(a)"
          >
            <AlxIcon name="refresh" :size="16" :class="{ spinning: refreshingId === a.id }" />
          </button>
          <button
            type="button"
            class="icon-btn"
            :title="a.type === 'offline' ? '上传皮肤' : '编辑皮肤'"
            @click.stop="editSkin(a)"
          >
            <AlxIcon name="image" :size="16" />
          </button>
          <button
            type="button"
            class="icon-btn"
            title="复制 UUID"
            @click.stop="copyUuid(a)"
          >
            <AlxIcon name="copy" :size="16" />
          </button>
          <button
            type="button"
            class="icon-btn account-remove"
            title="删除账户"
            @click.stop="deleteAccount(a.id)"
          >
            <AlxIcon name="trash" :size="16" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 本地头像：填充 item-icon 的方形槽位 */
.account-avatar {
  overflow: hidden;
}
.account-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
