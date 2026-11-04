<script setup lang="ts">
/**
 * 概览面板：版本信息 + 个性化 + 快捷方式 + 高级管理。
 *
 * 实例设置（登录方式 / Java 路径）来自 store 的 instanceSettings，
 * 外观偏好（别名 / 描述 / 收藏）走 instanceMeta 的本地 KV。
 */
import { computed, ref } from 'vue'
import { useAppStore } from '../../stores/app'
import { toast } from '../../lib/toast'
import { call } from '../../lib/bridge'
import type { GameInstance } from '../../lib/types'
import AlxIcon from '../../components/AlxIcon.vue'
import AlxModal from '../../components/AlxModal.vue'
import {
  openFolderInExplorer,
  resolveInstanceDir,
  summarizeInstance,
  type InstanceSettings,
  type InstanceUi,
} from '../instanceMeta'

const props = defineProps<{
  instance: GameInstance
  /** 该实例的设置（来自 store.instanceSettings） */
  settings: InstanceSettings
  /** 外观偏好 */
  ui: InstanceUi
  /** 写回外观偏好 */
  setUi: (p: InstanceUi) => void
}>()

const store = useAppStore()

/** 图标选项（自动 / 石头 / 草方块 / 钻石 / 熔炉 / 箱子）。 */
const ICON_OPTIONS = [
  { value: 'auto', label: '自动' },
  { value: 'stone', label: '石头' },
  { value: 'grass', label: '草方块' },
  { value: 'diamond', label: '钻石' },
  { value: 'furnace', label: '熔炉' },
  { value: 'chest', label: '箱子' },
]

/** 分类选项（自动 / 优化 / 生存 / 娱乐 / 恐怖 / 服务器）。 */
const CATEGORY_OPTIONS = [
  { value: 'auto', label: '自动' },
  { value: 'optimize', label: '优化' },
  { value: 'survival', label: '生存' },
  { value: 'fun', label: '娱乐' },
  { value: 'horror', label: '恐怖' },
  { value: 'server', label: '服务器' },
]

const editName = ref(false)
const editDesc = ref(false)
const nameDraft = ref(props.ui.alias ?? props.instance.name)
const descDraft = ref(props.ui.description ?? '')
const confirmDelete = ref(false)

// 展示名：优先用自定义别名（随外观偏好实时变化）。
const displayName = computed(() => props.ui.alias || props.instance.name)

/** 打开实例目录下的某个子目录。 */
async function openSubFolder(sub: string, label: string) {
  try {
    const dir = await resolveInstanceDir(props.instance.id)
    await openFolderInExplorer(sub ? `${dir}/${sub}` : dir)
  } catch (e) {
    toast.warning(`${label}尚未生成：${(e as Error).message}`)
  }
}

/** 导出启动脚本：写一份可直接双击运行的批处理。 */
async function exportLaunchScript() {
  try {
    const dir = await resolveInstanceDir(props.instance.id)
    const java = props.settings.javaPath || 'java'
    const content = [
      '@echo off',
      'rem 由 Aelux 启动器导出的启动脚本',
      `set "GAME_DIR=%~dp0"`,
      `cd /d "%GAME_DIR%"`,
      `"${java}" -jar "%GAME_DIR%\\versions\\${props.instance.id}\\${props.instance.id}.jar" nogui`,
      'pause',
      '',
    ].join('\r\n')
    await call('write_text', { path: `${dir}/启动脚本.bat`, content })
    toast.success('启动脚本已导出到版本文件夹')
  } catch (e) {
    toast.error(`导出启动脚本失败：${(e as Error).message}`)
  }
}

/** 补全文件：检查实例目录下应有的基础文件，缺失时提示重新安装。 */
async function completeFiles() {
  const expected = ['options.txt', 'servers.dat', 'optionsof.txt']
  try {
    const dir = await resolveInstanceDir(props.instance.id)
    const missing: string[] = []
    for (const f of expected) {
      // TODO: 内核尚未提供 read_text 命令，桌面端此处会走 catch 分支提示。
      const raw = await call<string | null>('read_text', { path: `${dir}/${f}` })
      if (raw === null) missing.push(f)
    }
    if (missing.length === 0) {
      toast.success('实例文件完整，无需补全')
    } else {
      toast.warning(`缺少 ${missing.join('、')}，请重新安装该版本以补全文件`)
    }
  } catch (e) {
    toast.error(`检查失败：${(e as Error).message}`)
  }
}

async function handleDelete() {
  confirmDelete.value = false
  try {
    await store.deleteInstance(props.instance.id)
    toast.success(`已删除 ${displayName.value}`)
    store.closeSubPage()
  } catch (e) {
    toast.error(`删除失败：${(e as Error).message}`)
  }
}

/** 确定修改版本名。 */
function confirmName() {
  props.setUi({ alias: nameDraft.value.trim() })
  editName.value = false
  toast.success('版本名已修改')
}

/** 确定修改版本描述。 */
function confirmDesc() {
  props.setUi({ description: descDraft.value.trim() })
  editDesc.value = false
  toast.success('版本描述已修改')
}
</script>

<template>
  <!-- ---------------------- 版本信息 ---------------------- -->
  <div class="setting-group">
    <div class="setting-row">
      <div class="item-left">
        <div class="item-icon"><AlxIcon name="package" :size="20" /></div>
        <div class="item-info">
          <div class="item-title">{{ displayName }}</div>
          <div class="item-desc">{{ summarizeInstance(instance, settings.serverLogin) }}</div>
        </div>
      </div>
    </div>
  </div>

  <!-- ---------------------- 个性化 ---------------------- -->
  <div class="setting-group">
    <div class="setting-group-title">个性化</div>
    <div class="setting-row">
      <div class="setting-label">图标</div>
      <select
        class="setting-select"
        :value="ui.icon ?? 'auto'"
        @change="setUi({ icon: ($event.target as HTMLSelectElement).value })"
      >
        <option v-for="o in ICON_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
    </div>
    <div class="setting-row">
      <div class="setting-label">分类</div>
      <select
        class="setting-select"
        :value="ui.category ?? 'auto'"
        @change="setUi({ category: ($event.target as HTMLSelectElement).value })"
      >
        <option v-for="o in CATEGORY_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
    </div>
    <div class="setting-row">
      <div class="setting-label">名称与描述<span class="setting-desc">展示在主页与版本选择页</span></div>
      <div class="item-right">
        <button type="button" class="btn-sub" @click="editName = true">修改版本名</button>
        <button type="button" class="btn-sub" @click="editDesc = true">修改版本描述</button>
        <button type="button" class="btn-sub" @click="setUi({ favorite: !ui.favorite })">
          <AlxIcon name="star" :size="13" />
          {{ ui.favorite ? '取消收藏' : '加入收藏夹' }}
        </button>
      </div>
    </div>
  </div>

  <!-- ---------------------- 快捷方式 ---------------------- -->
  <div class="setting-group">
    <div class="setting-group-title">快捷方式</div>
    <div class="setting-row">
      <div class="setting-label">打开文件夹</div>
      <div class="item-right">
        <button type="button" class="btn-sub" @click="openSubFolder('', '版本文件夹')">版本文件夹</button>
        <button type="button" class="btn-sub" @click="openSubFolder('saves', '存档文件夹')">存档文件夹</button>
        <button type="button" class="btn-sub" @click="openSubFolder('mods', 'Mod 文件夹')">Mod 文件夹</button>
        <button type="button" class="btn-sub" @click="openSubFolder('screenshot', '截图文件夹')">截图文件夹</button>
      </div>
    </div>
  </div>

  <!-- ---------------------- 高级管理 ---------------------- -->
  <div class="setting-group">
    <div class="setting-group-title">高级管理</div>
    <div class="setting-row">
      <div class="setting-label">维护<span class="setting-desc">删除操作不可撤销，请谨慎执行</span></div>
      <div class="item-right">
        <button type="button" class="btn-sub" @click="exportLaunchScript">导出启动脚本</button>
        <button type="button" class="btn-sub" @click="completeFiles">补全文件</button>
        <button type="button" class="btn-download btn-danger" @click="confirmDelete = true">删除版本</button>
      </div>
    </div>
  </div>

  <!-- ---------------------- 弹窗：修改版本名 ---------------------- -->
  <AlxModal :open="editName" title="修改版本名" @close="editName = false">
    新的版本名：
    <input v-model="nameDraft" class="setting-input" style="width: 100%; margin-top: 10px" />
    <template #actions>
      <button type="button" class="btn-sub" @click="confirmName">确定</button>
      <button type="button" class="btn-sub" @click="editName = false">取消</button>
    </template>
  </AlxModal>

  <!-- ---------------------- 弹窗：修改版本描述 ---------------------- -->
  <AlxModal :open="editDesc" title="修改版本描述" @close="editDesc = false">
    新的版本描述：
    <textarea v-model="descDraft" class="setting-textarea" style="margin-top: 10px"></textarea>
    <template #actions>
      <button type="button" class="btn-sub" @click="confirmDesc">确定</button>
      <button type="button" class="btn-sub" @click="editDesc = false">取消</button>
    </template>
  </AlxModal>

  <!-- ---------------------- 弹窗：删除确认 ---------------------- -->
  <AlxModal :open="confirmDelete" title="删除版本" @close="confirmDelete = false">
    确定要删除「{{ displayName }}」吗？该版本的文件将一并移除，此操作不可撤销。
    <template #actions>
      <button type="button" class="btn-download btn-danger" @click="handleDelete">删除</button>
      <button type="button" class="btn-sub" @click="confirmDelete = false">取消</button>
    </template>
  </AlxModal>
</template>
