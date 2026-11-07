<script setup lang="ts">
/**
 * 启动页（设计稿规格：内容靠右）：
 *   登录方式展示（跟随 store 偏好 / 当前会话，本页不选择）
 *   → 档案区（头像 + 玩家名）→ 启动按钮 + 实例选择 / 版本设置副按钮。
 * 启动进度不跳转下载任务页，而是在本页右侧展示阶段清单，
 * 页面布局与首页保持一致。
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

/** 启动中：跟随 store 的启动进度，离开页面再回来按钮状态仍正确。 */
const launching = computed(() => store.launchActive)

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

/* ------------------------------ 启动进度 ------------------------------ */

/** 启动阶段（与内核 LaunchProgress.stage 一一对应）。 */
const LAUNCH_STAGES = [
  { stage: 'prepare', label: '准备启动' },
  { stage: 'version', label: '读取版本信息' },
  { stage: 'natives', label: '补齐 natives' },
  { stage: 'files', label: '检查 / 补全文件' },
  { stage: 'auth', label: '验证账户' },
  { stage: 'java', label: '准备 Java' },
  { stage: 'classpath', label: '组装启动参数' },
  { stage: 'spawn', label: '启动游戏进程' },
] as const

const launch = computed(() => store.launchProgress)

const launchFailed = computed(() => !!launch.value?.done && !!launch.value?.error)

/** 启动中显示；失败后保留面板，方便查看原因。成功后自动收起。 */
const showLaunchPanel = computed(
  () => !!launch.value && (store.launchActive || launchFailed.value),
)

const launchPct = computed(() => {
  const state = launch.value
  if (!state) return 0
  if (state.done && !state.error) return 100
  if (state.total <= 0) return 0
  return Math.min(100, Math.round((state.current / state.total) * 100))
})

const launchTargetName = computed(() => {
  const id = launch.value?.instanceId
  return store.instances.find((i) => i.id === id)?.name ?? id ?? ''
})

/** 阶段状态：当前阶段高亮，之前的打勾。 */
function launchStageClass(index: number): string {
  const state = launch.value
  if (!state) return 'pending'
  if (state.done) {
    if (state.error) return index < state.current ? 'done' : 'pending'
    return 'done'
  }
  if (index < state.current) return 'done'
  if (index === state.current) return 'downloading'
  return 'pending'
}
</script>

<template>
  <div class="page-view active launch-page">
    <div class="launch-side">
      <!-- 启动进度：与首页同一布局，启动时右栏内容切换为启动进度 -->
      <section v-if="showLaunchPanel" class="launch-progress-panel">
        <div class="task-panel-head">
          <span class="task-panel-title">启动进度</span>
          <span class="tag">{{ launchFailed ? '启动失败' : '启动中' }}</span>
        </div>

        <div class="launch-progress-value">
          <span>{{ launchFailed ? '失败' : `${launchPct} %` }}</span>
          <span class="launch-progress-target">{{ launchTargetName }}</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: `${launchPct}%` }" />
        </div>
        <div class="launch-progress-current">{{ launch?.message || '准备中' }}</div>

        <div v-if="launchFailed" class="install-error-card launch-progress-error">
          <AlxIcon name="alert-circle" :size="20" />
          <div class="install-error-body">
            <div class="install-error-title">启动失败</div>
            <div class="install-error-text">{{ launch?.error }}</div>
          </div>
        </div>

        <div class="task-step-list launch-step-list">
          <div
            v-for="(s, i) in LAUNCH_STAGES"
            :key="s.stage"
            class="task-step"
            :class="launchStageClass(i + 1)"
          >
            <span class="task-step-mark">
              <AlxIcon
                :name="launchStageClass(i + 1) === 'done' ? 'check' : 'more-horizontal'"
                :size="14"
              />
            </span>
            <span class="task-step-name">{{ s.label }}</span>
          </div>
        </div>

        <button v-if="launchFailed" type="button" class="btn-sub launch-retry" @click="handleLaunch">
          重新启动
        </button>
      </section>

      <div v-else class="launch-side-normal">
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
    </div>

    <!-- 微软账户确认弹窗（确认后才跳转浏览器登录） -->
    <MicrosoftLoginModal
      :open="microsoftModalOpen"
      @close="microsoftModalOpen = false"
      @submit="startMicrosoftLogin"
    />
  </div>
</template>
