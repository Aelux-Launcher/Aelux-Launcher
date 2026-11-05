/**
 * 全局对话框（输入 / 确认）：
 *   替代 window.prompt / window.confirm，统一走 AlxModal 视觉。
 *   状态由 DialogHost（App.vue 全局挂载）渲染，调用方 await 结果。
 */
import { reactive } from 'vue'

export interface DialogField {
  key: string
  label: string
  placeholder?: string
  value?: string
}

export interface DialogOptions {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  /** 危险操作（删除等）：确认按钮用红色 */
  danger?: boolean
  fields?: DialogField[]
}

export interface DialogState {
  open: boolean
  title: string
  message: string
  fields: DialogField[]
  confirmText: string
  cancelText: string
  danger: boolean
}

export const dialogState = reactive<DialogState>({
  open: false,
  title: '',
  message: '',
  fields: [],
  confirmText: '确定',
  cancelText: '取消',
  danger: false,
})

let resolver: ((result: Record<string, string> | null) => void) | null = null

function finish(result: Record<string, string> | null) {
  dialogState.open = false
  const resolve = resolver
  resolver = null
  resolve?.(result)
}

function open(opts: DialogOptions): Promise<Record<string, string> | null> {
  // 上一个对话框未关闭时按取消处理，避免 Promise 悬挂
  if (dialogState.open) finish(null)
  dialogState.open = true
  dialogState.title = opts.title
  dialogState.message = opts.message ?? ''
  dialogState.fields = (opts.fields ?? []).map((f) => ({ ...f, value: f.value ?? '' }))
  dialogState.confirmText = opts.confirmText ?? '确定'
  dialogState.cancelText = opts.cancelText ?? '取消'
  dialogState.danger = opts.danger ?? false
  return new Promise((resolve) => {
    resolver = resolve
  })
}

/** 输入对话框：确认返回字段值，取消返回 null。 */
export function promptDialog(opts: DialogOptions) {
  return open(opts)
}

/** 确认对话框：确认返回 true，取消返回 false。 */
export async function confirmDialog(opts: DialogOptions): Promise<boolean> {
  const result = await open({ ...opts, fields: [] })
  return result !== null
}

/** 确认当前对话框（DialogHost 调用）。 */
export function submitDialog() {
  if (!dialogState.open) return
  const result: Record<string, string> = {}
  for (const f of dialogState.fields) result[f.key] = f.value ?? ''
  finish(result)
}

/** 取消当前对话框（DialogHost 调用）。 */
export function cancelDialog() {
  if (!dialogState.open) return
  finish(null)
}
