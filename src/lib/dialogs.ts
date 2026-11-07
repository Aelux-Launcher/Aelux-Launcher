/**
 * 原生文件对话框：走自有 Rust 命令（rfd 直调），
 * 不再使用 @tauri-apps/plugin-dialog（其事件循环投递管线存在打开延迟/丢失问题）。
 */
import { call } from './bridge'

export interface DialogFilter {
  name: string
  /** 不带点的扩展名，如 ['jar', 'zip'] */
  extensions: string[]
}

export interface SaveDialogOptions {
  title?: string
  /** 预填路径：完整文件路径（自动拆目录 + 文件名）或目录 */
  defaultPath?: string
  filters?: DialogFilter[]
}

export interface OpenDialogOptions {
  title?: string
  defaultPath?: string
  filters?: DialogFilter[]
  multiple?: boolean
  directory?: boolean
}

/** 原生「另存为」；取消返回 null。 */
export function saveDialog(options: SaveDialogOptions): Promise<string | null> {
  return call<string | null>('save_file_dialog', { options })
}

/**
 * 原生打开文件 / 文件夹；取消返回 null。
 * `multiple: true` 时返回路径数组，否则返回单个路径（或 null）。
 */
export async function openDialog(
  options: OpenDialogOptions,
): Promise<string | string[] | null> {
  const picked = await call<string[] | null>('pick_file_dialog', { options })
  if (!picked || picked.length === 0) return null
  return options.multiple ? picked : picked[0]
}
