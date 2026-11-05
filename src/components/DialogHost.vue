<script setup lang="ts">
/**
 * 全局对话框宿主：渲染 prompt / confirm（状态见 lib/dialog.ts）。
 * 打开时自动聚焦第一个输入框；Enter 确认、Esc 取消。
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import AlxModal from './AlxModal.vue'
import { cancelDialog, dialogState, submitDialog } from '../lib/dialog'

const dlg = dialogState
const bodyRef = ref<HTMLElement | null>(null)

function onWindowKeydown(e: KeyboardEvent) {
  if (!dlg.open) return
  if (e.key === 'Enter') {
    e.preventDefault()
    submitDialog()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancelDialog()
  }
}

watch(
  () => dlg.open,
  async (open) => {
    if (!open) {
      window.removeEventListener('keydown', onWindowKeydown)
      return
    }
    window.addEventListener('keydown', onWindowKeydown)
    await nextTick()
    bodyRef.value?.querySelector('input')?.focus()
  },
)

onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKeydown))
</script>

<template>
  <AlxModal :open="dlg.open" :title="dlg.title" @close="cancelDialog">
    <div ref="bodyRef">
      <p v-if="dlg.message" class="dialog-message">{{ dlg.message }}</p>
      <div v-for="f in dlg.fields" :key="f.key" class="dialog-field">
        <label class="dialog-field-label">{{ f.label }}</label>
        <input v-model="f.value" class="dialog-input" :placeholder="f.placeholder ?? ''" />
      </div>
    </div>
    <template #actions>
      <button type="button" class="btn-sub" @click="cancelDialog">{{ dlg.cancelText }}</button>
      <button
        type="button"
        class="btn-download"
        :class="{ 'btn-danger': dlg.danger }"
        @click="submitDialog"
      >
        {{ dlg.confirmText }}
      </button>
    </template>
  </AlxModal>
</template>
