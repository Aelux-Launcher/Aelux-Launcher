<script setup lang="ts">
/**
 * 修改面板：更换该版本使用的加载器。
 *
 * 每个加载器一组：左边显示**当前**使用的版本，右边选择**要换成**的版本，
 * 底部一个「开始修改」按钮。
 */
import { computed, ref } from 'vue'
import { useAppStore } from '../../stores/app'
import { toast } from '../../lib/toast'
import type { GameInstance } from '../../lib/types'
import { saveInstanceUi } from '../instanceMeta'
import AlxSelect from '../../components/AlxSelect.vue'
import SettingGroup from '../../components/SettingGroup.vue'

const props = defineProps<{ instance: GameInstance }>()

const store = useAppStore()

/** 加载器项（修改页用来对比「当前」与「将要换成」）。 */
interface LoaderSlot {
  key: string
  label: string
  /** 当前使用的版本（空 = 无） */
  current: string
  /** 可选的新版本 */
  choices: string[]
}

const picked = ref<Record<string, string>>({})
const busy = ref(false)

// 可选的加载器版本：正式版列表按加载器粗筛（真实接入由加载器仓库提供）。
const slots = computed<LoaderSlot[]>(() => [
  {
    key: 'forge',
    label: 'Forge',
    current: props.instance.loader === 'forge' ? props.instance.version : '',
    choices: store.versions.slice(0, 8).map((v) => v.id),
  },
  {
    key: 'neoforge',
    label: 'NeoForge',
    current: props.instance.loader === 'neoforge' ? props.instance.version : '',
    choices: store.versions.slice(0, 8).map((v) => v.id),
  },
  {
    key: 'fabric',
    label: 'Fabric',
    current: props.instance.loader === 'fabric' ? props.instance.version : '',
    choices: store.versions.slice(0, 8).map((v) => v.id),
  },
  {
    key: 'quilt',
    label: 'Quilt',
    current: props.instance.loader === 'quilt' ? props.instance.version : '',
    choices: store.versions.slice(0, 8).map((v) => v.id),
  },
])

const changed = computed(() => Object.entries(picked.value).filter(([, v]) => v))

/** 加载器版本下拉选项（首项「不修改」）。 */
function slotChoices(slot: LoaderSlot) {
  return [
    { value: '', label: '（不修改）' },
    ...slot.choices.map((c) => ({ value: c, label: c })),
  ]
}

/** 开始修改：把选择落到实例外观偏好上，产物安装由下载流程接手。 */
function startModify() {
  if (changed.value.length === 0) {
    toast.warning('请先选择要使用的加载器版本')
    return
  }
  busy.value = true
  const next = changed.value[0]
  void saveInstanceUi(props.instance.id, { loaderVersion: next[1] })
  busy.value = false
  toast.success('已提交修改，下载完成后生效')
}
</script>

<template>
  <!-- 版本名说明 -->
  <SettingGroup title="版本名" :collapsible="false">
    <div class="setting-row">
      <div class="setting-label">
        当前版本
        <div class="setting-desc">
          在下面选择要更换的加载器与版本，开始修改后启动器会下载对应文件。
        </div>
      </div>
      <span class="tag">{{ instance.version }}</span>
    </div>
  </SettingGroup>

  <!-- 各加载器：当前 → 改为 -->
  <SettingGroup v-for="slot in slots" :key="slot.key" :title="slot.label" :collapsible="false">
    <div class="setting-row">
      <div class="setting-label">当前</div>
      <span class="tag">{{ slot.current || '无' }}</span>
    </div>
    <div class="setting-row">
      <div class="setting-label">改为</div>
      <AlxSelect
        :model-value="picked[slot.key] ?? ''"
        :options="slotChoices(slot)"
        @update:model-value="(v: string) => (picked = { ...picked, [slot.key]: v })"
      />
    </div>
  </SettingGroup>

  <!-- 底部：开始修改 -->
  <div style="display: flex; justify-content: center; margin-top: 4px">
    <button
      type="button"
      class="btn-download"
      :disabled="busy"
      style="flex: none; padding: 9px 24px"
      @click="startModify"
    >
      {{ busy ? '提交中…' : '开始修改' }}
    </button>
  </div>
</template>
