<script setup lang="ts">
/**
 * 微软设备码登录弹窗（复用组件）：
 *   展示 userCode + 打开验证页 + 轮询等待 / 成功 / 失败态。
 * open 与状态全部来自 store.deviceFlow，关闭统一走 cancelMicrosoftLogin。
 */
import { computed, watch } from 'vue'
import { useAppStore } from '../stores/app'
import { toast } from '../lib/toast'
import { call } from '../lib/bridge'
import AlxModal from './AlxModal.vue'
import AlxIcon from './AlxIcon.vue'

const store = useAppStore()

const open = computed(() => store.deviceFlow.status !== 'idle')

// 登录成功：提示后自动关闭（复位状态机）。
watch(
  () => store.deviceFlow.status,
  (s) => {
    if (s === 'success') {
      toast.success('微软账户登录成功')
      window.setTimeout(() => store.cancelMicrosoftLogin(), 1200)
    }
  },
)

const STATUS_TITLE: Record<string, string> = {
  starting: '正在获取设备码…',
  waiting: '完成微软账户验证',
  success: '登录成功',
  error: '登录失败',
}

/** 复制设备码到剪贴板（走内核写剪贴板等价通道：暂用系统命令不可行，直接用剪贴板 API）。 */
async function copyCode() {
  try {
    await navigator.clipboard.writeText(store.deviceFlow.userCode)
    toast.success('设备码已复制')
  } catch {
    toast.error('复制失败，请手动选择设备码复制')
  }
}

/** 重新打开验证页（浏览器被关闭时用）。 */
async function reopenVerification() {
  try {
    await call('open_external', { url: store.deviceFlow.verificationUri })
  } catch (e) {
    toast.error(`无法打开网页：${(e as Error).message}`)
  }
}

function close() {
  store.cancelMicrosoftLogin()
}
</script>

<template>
  <AlxModal :open="open" :title="STATUS_TITLE[store.deviceFlow.status] ?? '微软登录'" @close="close">
    <!-- 等待授权 -->
    <template v-if="store.deviceFlow.status === 'waiting'">
      <p class="device-tip">在浏览器打开的页面中输入以下代码完成登录（代码 15 分钟内有效）：</p>
      <button type="button" class="device-code" title="点击复制" @click="copyCode">
        {{ store.deviceFlow.userCode }}
        <AlxIcon name="code" :size="16" />
      </button>
      <p class="device-sub">没有弹出浏览器？
        <button type="button" class="device-link" @click="reopenVerification">重新打开验证页</button>
      </p>
      <p class="device-waiting"><span class="device-spinner" /> 等待授权中，完成验证后自动继续…</p>
    </template>

    <!-- 成功（短暂展示后由弹窗关闭复位） -->
    <template v-else-if="store.deviceFlow.status === 'success'">
      <div class="device-success">
        <AlxIcon name="check" :size="28" />
        <span>账户已添加，可点击侧栏账户区进入账户管理页</span>
      </div>
    </template>

    <!-- 失败 -->
    <template v-else-if="store.deviceFlow.status === 'error'">
      <p class="device-error">{{ store.deviceFlow.error }}</p>
      <div class="device-retry">
        <button type="button" class="btn-sub" @click="close">关闭</button>
        <button type="button" class="btn-download" @click="store.startMicrosoftLogin">重试</button>
      </div>
    </template>

    <!-- 获取设备码中 -->
    <template v-else>
      <p class="device-waiting"><span class="device-spinner" /> 正在连接微软服务…</p>
    </template>
  </AlxModal>
</template>
