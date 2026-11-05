/**
 * 轻量 toast：全局响应式队列，App.vue 渲染，业务侧 toast.success(...) 即用。
 */
import { reactive } from 'vue'

export type ToastKind = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: number
  kind: ToastKind
  text: string
}

export const toasts = reactive<{ items: ToastItem[] }>({ items: [] })

let nextId = 1

function dismiss(id: number) {
  const idx = toasts.items.findIndex((t) => t.id === id)
  if (idx >= 0) toasts.items.splice(idx, 1)
}

function push(kind: ToastKind, text: string) {
  const id = nextId++
  toasts.items.push({ id, kind, text })
  // 最多同时显示 3 条：超出移除最旧的
  if (toasts.items.length > 3) toasts.items.shift()
  window.setTimeout(() => dismiss(id), 3600)
}

export const toast = {
  success: (text: string) => push('success', text),
  error: (text: string) => push('error', text),
  warning: (text: string) => push('warning', text),
  info: (text: string) => push('info', text),
  dismiss,
}
