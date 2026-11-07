<script setup lang="ts">
/**
 * 启动页（设计稿规格：内容靠右）：
 *   登录方式展示（跟随 store 偏好 / 当前会话，本页不选择）
 *   → 档案区（头像 + 玩家名）→ 启动按钮 + 实例选择 / 版本设置副按钮。
 * 启动进度不跳转下载任务页，而是把右栏切换为居中的进度面板；
 * 启动失败用全局弹窗展示原因，面板随即回到常规启动页。
 */
import { computed, ref, watch } from 'vue'
import { useAppStore } from '../stores/app'
import { toast } from '../lib/toast'
import { promptDialog, confirmDialog } from '../lib/dialog'
import { call } from '../lib/bridge'
import AlxIcon from '../components/AlxIcon.vue'
import AccountAvatar from '../components/AccountAvatar.vue'
import MicrosoftLoginModal from '../components/MicrosoftLoginModal.vue'

/** 登录方式（与 store 偏好一致） */
type LoginMode = 'official' | 'third' | 'offline'

/** 登录方式 → 展示文案（启动页左上角单个徽标） */
const MODE_LABEL: Record<LoginMode, string> = {
  official: '正版',
  third: '外置登录',
  offline: '离线',
}

const SESSION_LABEL: Record<string, string> = {
  microsoft: '正版（微软账号）',
  third: '外置登录',
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

const selected = computed(() => store.selectedInstance)
const selectedLoader = computed(() =>
  selected.value ? (LOADER_LABEL[selected.value.loader ?? 'vanilla'] ?? '原版') : null,
)

/** 第三方登录展示的认证服务器名（默认取列表里的第一台，如 LittleSkin）。 */
const thirdLabel = computed(() => store.authServers[0]?.name ?? '第三方')

/** 登录方式徽标文本：外置登录统一显示「外置登录」，不再区分服务器名。 */
const modeLabel = computed(() => MODE_LABEL[displayMode.value])

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
      // 失败弹窗由下方 watch(launch.error) 统一弹出，这里只记日志
      store.pushLaunchLog(`启动失败：${r?.error ?? '未知错误'}`)
    }
  } catch (e) {
    store.pushLaunchLog(`启动异常：${(e as Error).message}`)
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

/* ------------------------------ 启动进度 ------------------------------
 * 居中的镐动画 + 「正在启动游戏」 + 实例名 + 细进度条
 * + 三行信息（当前步骤 / 登录方式 / 启动进度）。失败改用全局弹窗展示。 */

/** 启动阶段（与内核 LaunchProgress.stage 一一对应），用于「当前步骤」取名。 */
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

/** 面板只在启动进行中显示；失败 / 成功后收起（失败原因走弹窗）。 */
const showLaunchPanel = computed(() => !!launch.value && store.launchActive)

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

/** 「当前步骤」文案：优先阶段名，未知阶段回退内核消息。 */
const launchStageLabel = computed(() => {
  const state = launch.value
  if (!state) return '准备中'
  if (state.done && !state.error) return '完成'
  return LAUNCH_STAGES[state.current - 1]?.label ?? state.message ?? '准备中'
})

/** 启动失败 → 弹窗展示原因；关闭后回到常规启动页，可选择一键重试。 */
watch(
  () => launch.value?.error,
  async (err) => {
    if (!err) return
    const retry = await confirmDialog({
      title: '启动失败',
      message: err,
      confirmText: '重新启动',
      cancelText: '关闭',
    })
    store.dismissLaunch()
    if (retry) handleLaunch()
  },
)
</script>

<template>
  <div class="page-view active launch-page">
    <div class="launch-side">
      <!-- 启动进度：启动时右栏内容切换为居中进度面板 -->
      <section v-if="showLaunchPanel" class="launch-progress-panel">
        <div class="launch-hero">
          <div class="launch-hero-icon">
            <svg class="launch-pick" viewBox="0 0 48 48" aria-hidden="true">
              <path
                d="M8.5 17.5 C15 7.5, 33 7.5, 39.5 17.5 C33.5 14, 28.2 12.8, 24 12.8 C19.8 12.8, 14.5 14, 8.5 17.5 Z"
                fill="currentColor"
                stroke="none"
              />
              <path d="M24 13.5 L33 41" stroke-width="4" />
            </svg>
            <span class="launch-pick-line" />
          </div>
          <div class="launch-hero-title">正在启动游戏</div>
          <div class="launch-hero-name" :title="launchTargetName">{{ launchTargetName }}</div>
          <div class="progress-track launch-hero-bar">
            <div class="progress-fill" :style="{ width: `${launchPct}%` }" />
          </div>
          <div class="launch-info">
            <div class="launch-info-row">
              <span class="k">当前步骤</span>
              <span class="v" :title="launch?.message || launchStageLabel">
                {{ launch?.message || launchStageLabel }}
              </span>
            </div>
            <div class="launch-info-row">
              <span class="k">登录方式</span>
              <span class="v">{{ modeLabel }}</span>
            </div>
            <div class="launch-info-row">
              <span class="k">启动进度</span>
              <span class="v">{{ launchPct }} %</span>
            </div>
          </div>
        </div>
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
              :skin-url="store.sessionSkinUrl"
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
                {{
                  selected
                    ? selected.name === selected.version
                      ? `[${selectedLoader}] ${selected.version}`
                      : selected.name
                    : '未找到可用的游戏版本'
                }}
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
