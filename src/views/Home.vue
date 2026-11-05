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
import AlxIcon from '../components/AlxIcon.vue'

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

/** 第三方登录：需要服务器凭证体系，接入前提示。 */
function handleThirdLogin() {
  toast.info('第三方（服务器账号）登录尚未接入，请使用离线或微软登录。')
}

/** 正版登录：设备码流（内核 auth 模块），弹窗展示设备码并轮询。 */
async function handleOfficialLogin() {
  await store.startMicrosoftLogin()
}

/** 离线登录：以昵称派生离线身份。 */
async function offlineLogin() {
  const name = window.prompt('输入游戏用户名（离线登录）')
  if (!name) return
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

function openInstanceSetup() {
  if (!selected.value) {
    toast.warning('请先安装一个游戏版本')
    return
  }
  store.openSubPage({ kind: 'instance', instanceId: selected.value.id, tab: 'setup' })
}
</script>

<template>
  <div class="page-view active launch-page">
    <div class="launch-side">
      <!-- 登录方式（仅展示当前选择，本页不切换） -->
      <div class="login-modes static">
        <button type="button" class="active">{{ MODE_LABEL[displayMode] }}</button>
      </div>

      <!-- 档案区 -->
      <div class="profile-section">
        <div class="avatar">
          <AlxIcon name="user" :size="36" />
        </div>
        <div v-if="store.session">
          <div class="player-name">{{ store.session.username }}</div>
          <div class="player-sub">
            {{ SESSION_LABEL[store.session.type] ?? store.session.type }}
          </div>
        </div>
        <div v-else>
          <div class="player-name">未登录</div>
          <div class="player-sub">选择登录方式后开始</div>
        </div>
      </div>

      <!-- 动作区 -->
      <div class="action-section">
        <div class="action-group">
          <!-- 登录按钮（未登录时，依据当前登录方式） -->
          <template v-if="!store.session">
            <button v-if="displayMode === 'official'" type="button" class="btn-launch" @click="handleOfficialLogin">
              <span class="main-text">微软账号登录</span>
              <span class="sub-text">正版验证</span>
            </button>
            <button v-else-if="displayMode === 'third'" type="button" class="btn-launch" @click="handleThirdLogin">
              <span class="main-text">服务器账号登录</span>
              <span class="sub-text">第三方认证</span>
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
</template>
