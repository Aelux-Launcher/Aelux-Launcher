<script setup lang="ts">
/**
 * 启动页（设计稿规格：内容靠右）：
 *   登录方式展示（跟随 store 偏好 / 当前会话，本页不选择）
 *   → 档案区（头像 + 玩家名）→ 启动按钮 + 实例选择 / 版本设置副按钮。
 * 业务动作走 store；启动日志并入任务管理页（store.pushLaunchLog）。
 */
import { computed, ref } from 'vue'
import { useAppStore } from '../stores/app'
import { toast } from '../lib/toast'
import { promptDialog } from '../lib/dialog'
import { call } from '../lib/bridge'
import AlxIcon from '../components/AlxIcon.vue'
import AccountAvatar from '../components/AccountAvatar.vue'
import MicrosoftLoginModal from '../components/MicrosoftLoginModal.vue'

/** 登录方式（与 store 偏好一致） */
type LoginMode = 'official' | 'third' | 'offline'

/** 登录方式 → 展示文案（启动页左上角单个徽标） */
const MODE_LABEL: Record<LoginMode, string> = {
  official: '正版',
  third: '第三方',
  offline: '离线',
}

const SESSION_LABEL: Record<string, string> = {
  microsoft: '正版（微软账号）',
  third: '正版（服务器账号）',
  offline: '离线',
}

const LOADER_LABEL: Record<string, string> = {
  vanilla: '原版',
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  quilt: 'Quilt',
}

const store = useAppStore()

const launching = ref(false)

/**
 * 启动页展示的登录方式：已登录跟随会话类型，未登录跟随偏好设置。
 * 本页只展示不选择——偏好由登录动作 / 设置页更新（store.setLoginMode）。
 */
const displayMode = computed<LoginMode>(() => {
  if (store.session) {
    return store.session.type === 'offline' ? 'offline' : store.session.type === 'third' ? 'third' : 'official'
  }
  return store.loginMode
})

const selected = computed(() => store.instances[0] ?? null)
const selectedLoader = computed(() =>
  selected.value ? (LOADER_LABEL[selected.value.loader ?? 'vanilla'] ?? '原版') : null,
)

/** 第三方登录展示的认证服务器名（默认取列表里的第一台，如 LittleSkin）。 */
const thirdLabel = computed(() => store.authServers[0]?.name ?? '第三方')

/** 登录方式徽标文本：第三方显示具体认证服务器名（如「LittleSkin」）。 */
const modeLabel = computed(() =>
  displayMode.value === 'third' ? thirdLabel.value : MODE_LABEL[displayMode.value],
)

async function handleLaunch() {
  if (!selected.value) {
    store.pushLaunchLog('没有可启动的实例，请先安装一个游戏版本。')
    toast.warning('请先安装一个游戏版本')
    store.setView('download')
    return
  }
  launching.value = true
  store.pushLaunchLog(`准备启动 ${selected.value.name}（${selected.value.version}）…`)
  try {
    const r = await store.launchInstance(selected.value.id)
    if (r?.ok) {
      store.pushLaunchLog(`游戏进程已启动${r.pid ? `（pid ${r.pid}）` : ''}。`)
      toast.success(`${selected.value.name} 已启动`)
    } else {
      store.pushLaunchLog(`启动失败：${r?.error ?? '未知错误'}`)
      toast.error(`启动失败：${r?.error ?? '未知错误'}`)
    }
  } catch (e) {
    store.pushLaunchLog(`启动异常：${(e as Error).message}`)
    toast.error(`启动异常：${(e as Error).message}`)
  } finally {
    launching.value = false
  }
}

/** 第三方登录：用已添加的认证服务器（默认第一个）完成外置鉴权。 */
async function handleThirdLogin() {
  if (store.authServers.length === 0) {
    try {
      await store.loadAuthServers()
    } catch {
      /* 列表加载失败时由下方提示 */
    }
  }
  const server = store.authServers[0]
  if (!server) {
    toast.warning('还没有外置登录服务器，请先在账户页添加')
    return
  }
  const input = await promptDialog({
    title: `登录 ${server.name}`,
    message: '使用该认证服务器的账号密码登录。',
    fields: [
      { key: 'username', label: '用户名', placeholder: '游戏账号' },
      { key: 'password', label: '密码', placeholder: '账号密码' },
    ],
    confirmText: '登录',
  })
  if (!input) return
  try {
    await call('authlib_login', {
      serverId: server.id,
      username: input.username,
      password: input.password,
    })
    await store.loadAccounts()
    await store.restoreSession()
    toast.success(`已使用 ${server.name} 账号登录`)
  } catch (e) {
    toast.error(`外置登录失败：${(e as Error).message}`)
  }
}

/** 正版登录：先弹窗确认，再走设备码流（避免一点就跳浏览器）。 */
const microsoftModalOpen = ref(false)

function handleOfficialLogin() {
  microsoftModalOpen.value = true
}

async function startMicrosoftLogin() {
  microsoftModalOpen.value = false
  await store.startMicrosoftLogin()
}

/** 离线登录：以昵称派生离线身份。 */
async function offlineLogin() {
  const r = await promptDialog({
    title: '离线登录',
    message: '输入游戏用户名，将以本地身份进入游戏。',
    fields: [{ key: 'username', label: '用户名', placeholder: '例如 Steve' }],
    confirmText: '登录',
  })
  if (!r) return
  const name = r.username.trim()
  if (!name) {
    toast.warning('用户名不能为空')
    return
  }
  try {
    await store.loginOffline(name)
    toast.success(`已使用离线身份「${store.session?.username}」登录`)
  } catch (e) {
    toast.error((e as Error).message)
  }
}

function openSelect() {
  store.openSubPage({ kind: 'select' })
}

/** 没有任何账户时，主按钮改为「添加账户」→ 账户管理页。 */
function openAccounts() {
  store.openSubPage({ kind: 'accounts' })
}

function openInstanceSetup() {
  // 还没有游戏版本时，直接带去下载页选版本下载。
  if (!selected.value) {
    toast.info('还没有游戏版本，先去下载一个吧')
    store.setView('download')
    return
  }
  store.openSubPage({ kind: 'instance', instanceId: selected.value.id, tab: 'overall' })
}
</script>

<template>
  <div class="page-view active launch-page">
    <div class="launch-side">
      <!-- 登录方式（仅展示已登录时的当前方式；未登录不显示文字，但保留行高） -->
      <div class="login-modes static">
        <button v-if="store.session" type="button" class="active">{{ modeLabel }}</button>
      </div>

      <!-- 档案区（未登录时不显示文字，但保留高度避免跳动） -->
      <div class="profile-section">
        <div class="avatar">
          <AccountAvatar
            v-if="store.session"
            :name="store.session.username"
            :type="store.session.type"
            :uuid="store.session.uuid"
            :size="80"
          />
          <AlxIcon v-else name="user" :size="36" />
        </div>
        <div v-if="store.session">
          <div class="player-name">{{ store.session.username }}</div>
          <div class="player-sub">
            {{ SESSION_LABEL[store.session.type] ?? store.session.type }}
          </div>
        </div>
      </div>

      <!-- 动作区 -->
      <div class="action-section">
        <div class="action-group">
          <!-- 登录按钮（未登录时：没有任何账户 → 添加账户；否则依据当前登录方式） -->
          <template v-if="!store.session">
            <button
              v-if="store.accounts.length === 0"
              type="button"
              class="btn-launch"
              @click="openAccounts"
            >
              <span class="main-text">添加账户</span>
              <span class="sub-text">当前未添加任何登录方式</span>
            </button>
            <button v-else-if="displayMode === 'official'" type="button" class="btn-launch" @click="handleOfficialLogin">
              <span class="main-text">微软账号登录</span>
              <span class="sub-text">正版验证</span>
            </button>
            <button v-else-if="displayMode === 'third'" type="button" class="btn-launch" @click="handleThirdLogin">
              <span class="main-text">{{ thirdLabel }} 登录</span>
              <span class="sub-text">外置登录</span>
            </button>
            <button v-else type="button" class="btn-launch" @click="offlineLogin">
              <span class="main-text">离线登录</span>
              <span class="sub-text">本地身份</span>
            </button>
          </template>

          <!-- 启动按钮（已登录时） -->
          <button
            v-else
            type="button"
            class="btn-launch"
            :disabled="launching"
            @click="handleLaunch"
          >
            <span class="main-text">{{ selected ? '启动游戏' : '下载游戏' }}</span>
            <span class="sub-text">
              {{ selected ? `[${selectedLoader}] ${selected.version}` : '未找到可用的游戏版本' }}
            </span>
          </button>

          <div class="sub-buttons">
            <button type="button" class="btn-sub" @click="openSelect">实例选择</button>
            <button type="button" class="btn-sub" @click="openInstanceSetup">版本设置</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 微软账户确认弹窗（确认后才跳转浏览器登录） -->
    <MicrosoftLoginModal
      :open="microsoftModalOpen"
      @close="microsoftModalOpen = false"
      @submit="startMicrosoftLogin"
    />
  </div>
</template>
