<script setup lang="ts">
/**
 * 设置面板：启动选项 / 内存分配 / 服务器 / 高级选项（手风琴）。
 *
 * 实例设置（Java、内存、服务器、高级选项）经 store 的
 * loadInstanceSettings / updateInstanceSettings 持久化（patch 回调由父级传入）；
 * 认证服务器等外观偏好走 instanceMeta 的本地 KV（setUi 回调）。
 */
import { computed, ref, watch } from 'vue'
import { useAppStore } from '../../stores/app'
import { toast } from '../../lib/toast'
import type { GameInstance } from '../../lib/types'
import AlxIcon from '../../components/AlxIcon.vue'
import AlxToggle from '../../components/AlxToggle.vue'
import AlxSelect from '../../components/AlxSelect.vue'
import SettingGroup from '../../components/SettingGroup.vue'
import {
  DEFAULT_INSTANCE_SETTINGS,
  javaManager,
  type InstanceSettings,
  type InstanceUi,
  type JavaRuntime,
} from '../instanceMeta'

const props = defineProps<{
  instance: GameInstance
  /** 该实例的设置（来自 store.instanceSettings） */
  settings: InstanceSettings
  /** 写回实例设置 */
  patch: (p: Partial<InstanceSettings>) => void
  /** 外观偏好 */
  ui: InstanceUi
  /** 写回外观偏好 */
  setUi: (p: InstanceUi) => void
}>()

const store = useAppStore()

/** 跳转全局设置（内联表达式在 vue-tsc 下触发误报，改走方法）。 */
function goGlobalSettings() {
  store.setView('settings')
}

/** 版本隔离选项。 */
const ISOLATION_OPTIONS = [
  { value: 'on', label: '开启' },
  { value: 'off', label: '关闭' },
]

/** Java 选择方式。 */
const JAVA_MODE_OPTIONS = [
  { value: 'auto', label: '自动选择' },
  { value: 'autoRange', label: '跟随全局设置' },
  { value: 'custom', label: '自定义' },
]
/** 登录方式（默认跟随全局设置）。 */
const LOGIN_OPTIONS = [
  { value: 'follow', label: '跟随全局设置' },
  { value: 'official', label: '正版' },
  { value: 'authlib', label: '第三方登录：Authlib Injector' },
  { value: 'offline', label: '离线' },
  { value: 'both', label: '正版与第三方同时保留' },
  { value: 'nide', label: 'Nide 验证' },
]

/** 内存分配方式（单选下拉）。 */
const RAM_TYPE_OPTIONS: { value: InstanceSettings['ramType']; label: string }[] = [
  { value: 'follow', label: '跟随全局设置' },
  { value: 'auto', label: '自动配置' },
  { value: 'custom', label: '自定义' },
]

/** 启动前内存优化（默认跟随全局设置）。 */
const RAM_OPTIMIZE_OPTIONS: { value: InstanceSettings['ramOptimize']; label: string }[] = [
  { value: 'follow', label: '跟随全局设置' },
  { value: 'on', label: '开启' },
  { value: 'off', label: '关闭' },
]

/** 内存管理（GC）。 */
const GC_OPTIONS = [
  { value: 'follow', label: '跟随全局设置' },
  { value: 'g1', label: '优先 G1GC' },
  { value: 'zgc', label: '尽量 ZGC' },
  { value: 'generationalZgc', label: '分代 ZGC' },
  { value: 'tunedG1', label: '调优 G1GC' },
  { value: 'custom', label: '自定义' },
]

const showHint = ref(true)
const javaText = ref('')
const jres = ref<JavaRuntime[]>([])

// lib 的 javaMode 还有 'folder' 一档，界面上与「自定义」同义（都取实例自己的路径），
// 这里归一到「自定义」，避免下拉框选不中任何一项。
const javaModeValue = computed(() =>
  props.settings.javaMode === 'folder' ? 'custom' : props.settings.javaMode,
)

/** 高级选项里的 Java 列表（首项为占位说明）。 */
const javaListOptions = computed(() => [
  { value: '', label: `共有 ${jres.value.length} 个 Java…` },
  ...jres.value.map((j) => ({ value: j.path, label: `Java ${j.major} (${j.version})` })),
])

/** 实际分配给游戏的堆内存（GB）：自定义取实例值，其余跟随全局设置。 */
const assignedMemoryGb = computed(() => {
  const mb =
    props.settings.ramType === 'custom' ? props.settings.ramCustomMb : store.settings.memoryMb
  return (Math.max(128, mb) / 1024).toFixed(1)
})

/** 滑块右侧的内存数值显示。 */
function formatRam(v: number) {
  return `${(v / 1024).toFixed(1)} GB`
}

/** 高级选项里选择某个 Java：写入路径并切到「自定义」。 */
function pickJava(path: string) {
  if (!path) return
  props.patch({ javaPath: path, javaMode: 'custom' })
}

// 侧栏「刷新」（游戏设置）= 初始化：把该版本的设置恢复为默认值。
watch(
  () => store.instanceReloads.setup ?? 0,
  (tick) => {
    if (!tick) return
    props.patch({ ...DEFAULT_INSTANCE_SETTINGS })
    showHint.value = true
    toast.success('已初始化当前版本设置')
  },
)

// 解析该版本实际会使用的 Java，用于提示块与 Java 列表。
watch(
  () => [props.instance.version, props.settings.javaPath] as const,
  async ([version, javaPath], _prev, onCleanup) => {
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    const manager = javaManager
    const list = await manager.allAvailable()
    if (cancelled) return
    jres.value = list

    const resolved = await manager.resolveFor(version)
    if (cancelled) return
    if (resolved.jre) {
      javaText.value = `将会使用: Java ${resolved.jre.major} (${resolved.jre.version}): ${resolved.jre.path}`
    } else if (javaPath) {
      javaText.value = `将会使用: ${javaPath}`
    } else {
      javaText.value = '尚未找到可用的 Java，请在「高级选项」中手动指定路径'
    }
  },
  { immediate: true },
)
</script>

<template>
  <!-- 面板说明（可关闭） -->
  <div
    v-if="showHint"
    style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px"
  >
    <span class="tag">仅当前版本</span>
    <span class="setting-desc">这些设置只对该游戏版本生效，不影响其他版本。</span>
    <AlxIcon
      name="x"
      :size="14"
      style="cursor: pointer; color: var(--text-sub)"
      @click="showHint = false"
    />
  </div>

  <!-- ---------------------- 启动选项 ---------------------- -->
  <SettingGroup title="启动选项" :collapsible="false">
    <div class="setting-row">
      <div class="setting-label">版本隔离</div>
      <AlxSelect
        :model-value="settings.indie"
        :options="ISOLATION_OPTIONS"
        @update:model-value="(v: string) => patch({ indie: v as InstanceSettings['indie'] })"
      />
    </div>
    <div class="setting-row">
      <div class="setting-label">游戏窗口标题</div>
      <input
        class="setting-input"
        :value="settings.title"
        placeholder="跟随全局设置"
        @input="patch({ title: ($event.target as HTMLInputElement).value })"
      />
    </div>
    <div class="setting-row">
      <div class="setting-label">自定义信息</div>
      <input
        class="setting-input"
        :value="settings.info"
        placeholder="跟随全局设置"
        @input="patch({ info: ($event.target as HTMLInputElement).value })"
      />
    </div>
    <div class="setting-row">
      <div class="setting-label">
        Java
        <div class="setting-desc">{{ javaText }}</div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px; align-items: flex-end">
        <AlxSelect
          :model-value="javaModeValue"
          :options="JAVA_MODE_OPTIONS"
          @update:model-value="(v: string) => patch({ javaMode: v as InstanceSettings['javaMode'] })"
        />
        <input
          v-if="settings.javaMode === 'custom' || settings.javaMode === 'folder'"
          class="setting-input"
          style="width: 280px"
          :value="settings.javaPath"
          placeholder="Java 可执行文件的完整路径"
          @input="patch({ javaPath: ($event.target as HTMLInputElement).value })"
        />
      </div>
    </div>
  </SettingGroup>

  <!-- ---------------------- 内存分配 ---------------------- -->
  <SettingGroup title="内存分配" :collapsible="false">
    <div class="setting-row">
      <AlxSelect
        :model-value="settings.ramType"
        :options="RAM_TYPE_OPTIONS"
        @update:model-value="(v: string) => patch({ ramType: v as InstanceSettings['ramType'] })"
      />
    </div>
    <div v-if="settings.ramType === 'custom'" class="setting-row">
      <div class="setting-label">
        自定义内存
        <div class="setting-desc">{{ formatRam(settings.ramCustomMb) }}</div>
      </div>
      <input
        type="range"
        class="setting-range"
        min="512"
        max="8192"
        step="256"
        :value="settings.ramCustomMb"
        @input="patch({ ramCustomMb: Number(($event.target as HTMLInputElement).value) })"
      />
    </div>
    <div class="setting-row">
      <div class="setting-label">启动游戏前进行内存优化</div>
      <AlxSelect
        :model-value="settings.ramOptimize"
        :options="RAM_OPTIMIZE_OPTIONS"
        @update:model-value="(v: string) => patch({ ramOptimize: v as InstanceSettings['ramOptimize'] })"
      />
    </div>
    <!-- 内存分配概览：显示实际会传给 JVM 的堆大小 -->
    <div class="setting-row">
      <div class="setting-label">游戏分配内存</div>
      <span class="item-meta">{{ assignedMemoryGb }} GB</span>
    </div>
  </SettingGroup>

  <!-- ---------------------- 服务器 ---------------------- -->
  <SettingGroup title="服务器" :collapsible="false">
    <div class="setting-row">
      <div class="setting-label">登录方式</div>
      <AlxSelect
        :model-value="settings.serverLogin"
        :options="LOGIN_OPTIONS"
        @update:model-value="(v: string) => patch({ serverLogin: v as InstanceSettings['serverLogin'] })"
      />
    </div>
    <div class="setting-row">
      <div class="setting-label">认证服务器（必填）</div>
      <input
        class="setting-input"
        :value="ui.authServer ?? ''"
        placeholder="https://littleskin.cn/api/yggdrasil"
        @input="setUi({ authServer: ($event.target as HTMLInputElement).value })"
      />
    </div>
    <div class="setting-row">
      <div class="setting-label">注册链接</div>
      <input
        class="setting-input"
        :value="ui.registerUrl ?? ''"
        placeholder="https://littleskin.cn/register"
        @input="setUi({ registerUrl: ($event.target as HTMLInputElement).value })"
      />
    </div>
    <div class="setting-row">
      <div class="setting-label">服务器名称</div>
      <input
        class="setting-input"
        :value="ui.serverName ?? ''"
        placeholder="填写后将在启动时显示"
        @input="setUi({ serverName: ($event.target as HTMLInputElement).value })"
      />
    </div>
    <div class="setting-row">
      <div class="setting-label">自动进入服务器</div>
      <input
        class="setting-input"
        :value="settings.serverAutoEnter"
        placeholder="例如：127.0.0.1:25565"
        @input="patch({ serverAutoEnter: ($event.target as HTMLInputElement).value })"
      />
    </div>
  </SettingGroup>

  <!-- ---------------------- 高级选项（默认折叠） ---------------------- -->
  <SettingGroup title="高级选项" :default-open="false">
    <div class="setting-row">
      <div class="setting-label">Java 虚拟机参数</div>
      <input
        class="setting-input"
        :value="settings.advanceJvm"
        placeholder="跟随全局设置"
        @input="patch({ advanceJvm: ($event.target as HTMLInputElement).value })"
      />
    </div>
    <div class="setting-row">
      <div class="setting-label">游戏参数</div>
      <input
        class="setting-input"
        :value="settings.advanceGame"
        placeholder="跟随全局设置"
        @input="patch({ advanceGame: ($event.target as HTMLInputElement).value })"
      />
    </div>
    <div class="setting-row">
      <div class="setting-label">启动前执行命令</div>
      <input
        class="setting-input"
        :value="settings.advanceRun"
        placeholder="跟随全局设置"
        @input="patch({ advanceRun: ($event.target as HTMLInputElement).value })"
      />
    </div>
    <div class="setting-row">
      <div class="setting-label">Java 列表</div>
      <AlxSelect
        :model-value="settings.javaPath"
        :options="javaListOptions"
        @update:model-value="pickJava"
      />
    </div>
    <div class="setting-row">
      <div class="setting-label">内存管理</div>
      <AlxSelect
        :model-value="settings.advanceGc"
        :options="GC_OPTIONS"
        @update:model-value="(v: string) => patch({ advanceGc: v as InstanceSettings['advanceGc'] })"
      />
    </div>
    <div class="setting-row">
      <div class="setting-label">禁用 Java Launch Wrapper</div>
      <AlxToggle :model-value="settings.disableJlw" @update:model-value="patch({ disableJlw: $event })" />
    </div>
    <div class="setting-row">
      <div class="setting-label">禁用 LWJGL Unsafe Agent</div>
      <AlxToggle
        :model-value="settings.disableAssetsVerify"
        @update:model-value="patch({ disableAssetsVerify: $event })"
      />
    </div>
    <div class="setting-row">
      <div class="setting-label">禁用 Mod 自动更新</div>
      <AlxToggle
        :model-value="settings.disableModUpdate"
        @update:model-value="patch({ disableModUpdate: $event })"
      />
    </div>
    <div class="setting-row">
      <div class="setting-label">使用高性能显卡</div>
      <AlxToggle :model-value="ui.highPerf !== false" @update:model-value="setUi({ highPerf: $event })" />
    </div>
  </SettingGroup>

  <!-- 底部：跳转全局设置 -->
  <div style="display: flex; justify-content: center; margin-top: 4px">
    <button type="button" class="btn-sub" style="flex: none; padding: 0 18px" @click="goGlobalSettings">
      全局设置
    </button>
  </div>
</template>
