<script setup lang="ts">
/**
 * 账户管理页（副页面，HMCL 式布局的极简黑白演绎）：
 *   左栏「添加账户」：微软账户（设备码流）/ 离线模式；
 *   右栏账户列表：单选当前账户 + 删除；微软 / 离线均可多账户并存。
 * 设备码登录弹窗由 DeviceLoginModal 承担，状态在 store。
 */
import { computed } from 'vue'
import { useAppStore } from '../stores/app'
import { toast } from '../lib/toast'
import AlxIcon from '../components/AlxIcon.vue'
import PageHeader from '../components/PageHeader.vue'
import DeviceLoginModal from '../components/DeviceLoginModal.vue'

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

/** 添加微软账户：走设备码流（弹窗由 store 状态驱动）。 */
async function addMicrosoft() {
  await store.startMicrosoftLogin()
}

/** 添加离线账户。 */
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

/** 选中账户 → 设为当前会话。 */
async function selectAccount(id: string) {
  if (id === currentId.value) return
  await store.switchAccount(id)
  toast.success(`已切换到「${store.session?.username ?? ''}」`)
}

/** 删除账户（当前账户删除后登出）。 */
async function deleteAccount(id: string) {
  const acc = store.accounts.find((a) => a.id === id)
  if (!acc) return
  if (!window.confirm(`确定删除账户「${acc.username}」？`)) return
  await store.removeAccount(id)
  toast.success('账户已删除')
}
</script>

<template>
  <div class="page-view active sub-page">
    <PageHeader title="账户管理" />
    <div class="account-manage">
      <!-- 左栏：添加账户 -->
      <div class="add-account-panel">
        <div class="add-account-title">添加账户</div>
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

      <!-- 右栏：账户列表 -->
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

    <DeviceLoginModal />
  </div>
</template>
