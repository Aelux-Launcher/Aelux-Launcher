<script setup lang="ts">
/**
 * 添加认证服务器（两步，参考 HMCL）：
 *   第一步输入服务器地址 → 第二步确认地址 / 名称（名称自动取 authlib-injector 元数据）。
 */
import { computed, nextTick, ref, watch } from 'vue'
import AlxModal from './AlxModal.vue'
import { call } from '../lib/bridge'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  close: []
  submit: [server: { name: string; url: string }]
}>()

const step = ref<1 | 2>(1)
const url = ref('')
const name = ref('')
const fetching = ref(false)
const urlInputRef = ref<HTMLInputElement | null>(null)
const nameInputRef = ref<HTMLInputElement | null>(null)

const cleanUrl = computed(() => url.value.trim().replace(/\/+$/, ''))
const displayUrl = computed(() => `${cleanUrl.value}/`)

function hostOf(addr: string): string {
  try {
    return new URL(addr).host
  } catch {
    return addr
  }
}

/** 读取 authlib-injector 元数据里的服务器名称（失败时回退域名）。 */
async function fetchServerName(addr: string): Promise<string | null> {
  try {
    const raw = await call<string>('fetch_json', { url: addr })
    const data = JSON.parse(raw) as { meta?: { serverName?: string } }
    return data.meta?.serverName?.trim() || null
  } catch {
    return null
  }
}

async function goNext() {
  if (!cleanUrl.value) return
  step.value = 2
  name.value = hostOf(cleanUrl.value)
  fetching.value = true
  const fetched = await fetchServerName(cleanUrl.value)
  if (fetched && step.value === 2) name.value = fetched
  fetching.value = false
  await nextTick()
  nameInputRef.value?.focus()
}

function goBack() {
  step.value = 1
  void nextTick().then(() => urlInputRef.value?.focus())
}

function finish() {
  if (!cleanUrl.value) return
  emit('submit', { name: name.value.trim() || hostOf(cleanUrl.value), url: cleanUrl.value })
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    step.value = 1
    url.value = ''
    name.value = ''
    fetching.value = false
    await nextTick()
    urlInputRef.value?.focus()
  },
)
</script>

<template>
  <AlxModal :open="open" title="添加认证服务器" @close="emit('close')">
    <template v-if="step === 1">
      <input
        ref="urlInputRef"
        v-model="url"
        class="dialog-input"
        placeholder="https://example.com/api/yggdrasil"
        @keydown.enter.prevent="goNext"
      />
    </template>

    <template v-else>
      <div class="auth-wizard-row">
        <span class="auth-wizard-label">服务器地址</span>
        <span class="auth-wizard-value">{{ displayUrl }}</span>
      </div>
      <div class="auth-wizard-row">
        <span class="auth-wizard-label">服务器名称</span>
        <input
          ref="nameInputRef"
          v-model="name"
          class="dialog-input"
          :placeholder="fetching ? '正在获取…' : '服务器名称'"
        />
      </div>
    </template>

    <template #actions>
      <template v-if="step === 1">
        <button type="button" class="btn-sub" @click="emit('close')">取消</button>
        <button type="button" class="btn-download" :disabled="!cleanUrl" @click="goNext">下一步</button>
      </template>
      <template v-else>
        <button type="button" class="btn-sub" @click="goBack">上一步</button>
        <button type="button" class="btn-sub" @click="emit('close')">取消</button>
        <button type="button" class="btn-download" @click="finish">完成</button>
      </template>
    </template>
  </AlxModal>
</template>
