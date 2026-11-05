<script setup lang="ts">
/**
 * 添加外置登录账户（authlib-injector）：
 *   点击侧栏的认证服务器条目打开，输入用户名 / 密码登录该服务器。
 */
import { computed, nextTick, ref, watch } from 'vue'
import AlxModal from './AlxModal.vue'
import { call } from '../lib/bridge'
import type { AuthServer } from '../lib/types'

const props = defineProps<{ open: boolean; server: AuthServer | null }>()
const emit = defineEmits<{
  close: []
  submit: [account: { username: string; password: string }]
}>()

const username = ref('')
const password = ref('')
const submitted = ref(false)
const userInputRef = ref<HTMLInputElement | null>(null)

const origin = computed(() => {
  try {
    return new URL(props.server?.url ?? '').origin
  } catch {
    return props.server?.url ?? ''
  }
})

function openLink(url: string) {
  void call('open_external', { url }).catch(() => {})
}

function submit() {
  submitted.value = true
  if (!username.value.trim() || !password.value) return
  emit('submit', { username: username.value.trim(), password: password.value })
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    username.value = ''
    password.value = ''
    submitted.value = false
    await nextTick()
    userInputRef.value?.focus()
  },
)
</script>

<template>
  <AlxModal :open="open" title="添加外置登录账户（authlib-injector）" @close="emit('close')">
    <!-- 认证服务器 + 主页 / 注册 -->
    <div class="auth-login-row">
      <span class="auth-login-label">认证服务器</span>
      <div class="auth-login-server">
        <span class="auth-login-server-name">{{ server?.name }}</span>
        <span class="auth-login-links">
          <button type="button" class="link-btn" @click="openLink(origin)">主页</button>
          <button type="button" class="link-btn" @click="openLink(`${origin}/auth/register`)">注册</button>
        </span>
      </div>
    </div>

    <!-- 用户名 -->
    <div class="auth-login-row">
      <label class="auth-login-label">用户名</label>
      <div class="auth-login-control">
        <input ref="userInputRef" v-model="username" class="dialog-input" @keydown.enter.prevent="submit" />
        <div v-if="submitted && !username.trim()" class="field-error">必填项</div>
      </div>
    </div>

    <!-- 密码 -->
    <div class="auth-login-row">
      <label class="auth-login-label">密码</label>
      <div class="auth-login-control">
        <input
          v-model="password"
          type="password"
          class="dialog-input"
          @keydown.enter.prevent="submit"
        />
        <div v-if="submitted && !password" class="field-error">必填项</div>
      </div>
    </div>

    <template #actions>
      <button type="button" class="btn-sub" @click="emit('close')">取消</button>
      <button type="button" class="btn-download" @click="submit">登录</button>
    </template>
  </AlxModal>
</template>
