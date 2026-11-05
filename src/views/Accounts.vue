<script setup lang="ts">
/**
 * 账户管理页（副页面，PCL 式）：
 *   侧栏 = 添加账户（见 SideNav 的子页面板）；本页内容 = 账户列表
 *   （单选当前账户 + 删除；微软 / 离线均可多账户并存）。
 * 设备码登录弹窗由 App.vue 全局挂载，状态在 store。
 */
import { computed } from 'vue'
import { useAppStore } from '../stores/app'
import { toast } from '../lib/toast'
import { confirmDialog } from '../lib/dialog'
import AlxIcon from '../components/AlxIcon.vue'
import PageHeader from '../components/PageHeader.vue'
import type { StoredAccount } from '../lib/types'

const store = useAppStore()

const TYPE_LABEL: Record<string, string> = {
  microsoft: '微软正版',
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

/** 刷新账户：微软走设备码重新验证；离线账户无需刷新。 */
async function refreshAccount(a: StoredAccount) {
  if (a.type === 'microsoft') {
    await store.startMicrosoftLogin()
    return
  }
  toast.info('离线账户无需刷新')
}

/** 上传 / 编辑皮肤（皮肤管理接入内核前给出提示）。 */
function editSkin(a: StoredAccount) {
  toast.info(a.type === 'offline' ? '上传皮肤功能尚未接入内核' : '编辑皮肤功能尚未接入内核')
}

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
        <div class="item-icon">
          <AlxIcon name="user" :size="20" />
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
            @click.stop="refreshAccount(a)"
          >
            <AlxIcon name="refresh" :size="16" />
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
