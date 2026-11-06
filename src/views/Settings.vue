<script setup lang="ts">
/**
 * 设置页（极简黑白版）：按路由参数 sec 切换五节
 *   global 全局设置 / java Java 运行环境管理 / general 通用 / appearance 外观 / download 下载。
 *
 * 状态绑定：
 *   - 核心字段（自动更新、默认 Java）直接读写 store.settings，经 store.saveSettings 落盘；
 *   - 界面偏好（窗口标题、执行命令、并发数、下载源等）为本地 ref，
 *     变更时经 store.saveSettings 尽力持久化（整体 JSON 落盘，读取侧按类型回落）；
 *   - 主题模式绑 store.theme / store.setTheme（同步 data-theme 并落盘）。
 */
import { computed, ref, watch } from 'vue'
import type { SettingsSection } from '../lib/types'
import { useAppStore } from '../stores/app'
import { toast } from '../lib/toast'
import AlxSelect from '../components/AlxSelect.vue'
import AlxToggle from '../components/AlxToggle.vue'
import AlxInfoTip from '../components/AlxInfoTip.vue'
import SettingGroup from '../components/SettingGroup.vue'
import AlxIcon from '../components/AlxIcon.vue'
import { JavaManager } from './instanceMeta'
import {
  DOWNLOAD_SOURCE_OPTIONS,
  GC_MODE_OPTIONS,
  LANGUAGE_OPTIONS,
  LAUNCHER_VISIBILITY_OPTIONS,
  OPACITY_RANGE,
  PARALLEL_OPTIONS,
  PRESET_INHERIT_OPTIONS,
  PROCESS_PRIORITY_OPTIONS,
  QUICK_PLAY_OPTIONS,
  THEME_OPTIONS,
  VERSION_ISOLATION_OPTIONS,
  WINDOW_SIZE_OPTIONS,
  clampOpacity,
  extrasPatch,
  readExtras,
  type JavaEntry,
  type SettingsExtras,
} from './SettingsModel'

const props = defineProps<{ sec: string }>()

const store = useAppStore()

/** 合法的分节清单（未知 sec 回落到 global）。 */
const SECTIONS: SettingsSection[] = ['global', 'java', 'general', 'appearance', 'download']
const section = computed<SettingsSection>(() => {
  const s = props.sec as SettingsSection
  return SECTIONS.includes(s) ? s : 'global'
})

/* ------------------------------ 界面层偏好 ------------------------------ */

/** 界面偏好：从已落盘设置恢复；变更即时尽力持久化。 */
const extras = ref<SettingsExtras>(readExtras(store.settings))

// 设置在后台异步加载：加载完成后（store.settings 被整体替换）再同步一次。
watch(store.settings, (s) => {
  extras.value = readExtras(s)
})

/** 持久化界面偏好（失败静默：不影响界面状态，下次进入回落默认值）。 */
function persistExtras() {
  store.saveSettings(extrasPatch(extras.value)).catch(() => {})
}

/** 通用偏好写入：改本地 ref + 尽力落盘。 */
function setExtra<K extends keyof SettingsExtras>(key: K, value: SettingsExtras[K]) {
  extras.value = { ...extras.value, [key]: value }
  persistExtras()
}

/** 文本输入行提交（change 事件，避免每次按键都落盘）。 */
function onTextInput(
  key: 'windowTitle' | 'preLaunchCommand' | 'customInfo' | 'jvmArgs' | 'gameArgs',
  e: Event,
) {
  setExtra(key, (e.target as HTMLInputElement).value)
}

/** 全局设置里的下拉项。 */
type ChoiceKey =
  | 'versionIsolation'
  | 'launcherVisibility'
  | 'processPriority'
  | 'windowSize'
  | 'quickPlay'
  | 'presetInherit'
  | 'presetName'

/** 下拉提交：写入对应偏好并落盘。 */
function setChoice(key: ChoiceKey, value: string) {
  extras.value = { ...extras.value, [key]: value } as SettingsExtras
  persistExtras()
}

/** 并行下载数（数值型偏好，下拉值为字符串）。 */
const parallelChoices = PARALLEL_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))

/** 当前可选的游戏设置预设（预设管理接入后由设置数据填充）。 */
const presetOptions = [{ value: '预设1', label: '预设1' }]

function onParallelValue(value: string) {
  setExtra('maxParallel', Number(value) as 4 | 8 | 16)
}

function onDownloadSourceValue(value: string) {
  setExtra('downloadSource', value as SettingsExtras['downloadSource'])
}

/** 当前隔离策略的说明文案（放在标题后的感叹号气泡里，避免行内文字过长）。 */
const isolationDesc = computed(
  () => VERSION_ISOLATION_OPTIONS.find((o) => o.value === extras.value.versionIsolation)?.desc ?? '',
)

/** Java 列表的说明文案。 */
const JAVA_LIST_TIP = [
  '启动游戏时，会优先选择列表中第一个兼容当前 Minecraft 的 Java。',
  '点击选项右侧的箭头可以调整排序，以控制优先选择哪个 Java。',
  '若想无视兼容性强制使用某个 Java，请在版本独立设置中修改。',
].join('\n')

/** 自定义图标选择（内核文件选择命令未接入，先提示）。 */
function pickIcon() {
  toast.info('自定义图标选择尚未接入，等待内核文件选择命令就绪。')
}

/** 新建游戏设置预设（预设管理尚未接入，先提示）。 */
function addPreset() {
  toast.info('自定义预设管理尚未接入。')
}

/* ------------------------------ 内存分配 ------------------------------ */

/** 系统总内存（浏览器只能拿到近似值，缺失时按 16 GB 估算）。 */
const SYSTEM_MEMORY_GB = Math.max(
  4,
  Math.round((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 16),
)

/** 游戏分配内存（核心字段 memoryMb）。 */
const memoryMb = computed({
  get: () => store.settings.memoryMb,
  set: (v) => {
    store.saveSettings({ memoryMb: v }).catch(() => {})
  },
})

/** 分配条占比。 */
const memoryPercent = computed(() =>
  Math.min(100, Math.round((memoryMb.value / (SYSTEM_MEMORY_GB * 1024)) * 100)),
)

/** 分配后剩余可用内存（GB）。 */
const memoryAvailableGb = computed(() => Math.max(0, SYSTEM_MEMORY_GB - memoryMb.value / 1024))

/** GB 显示（保留一位小数）。 */
function formatGb(gb: number) {
  return `${Math.round(gb * 10) / 10} GB`
}

/** 滑块/数值输入提交。 */
function onMemoryChange(e: Event) {
  memoryMb.value = Number((e.target as HTMLInputElement).value)
}

/** 不透明度滑块提交（松手时夹取到合法区间再落盘）。 */
function onOpacityChange(e: Event) {
  setExtra('opacity', clampOpacity(Number((e.target as HTMLInputElement).value)))
}

/* ------------------------------- 核心字段 ------------------------------- */

/** 自动检查更新（核心字段，直接落盘）。 */
const autoUpdate = computed({
  get: () => store.settings.autoUpdate,
  set: (v) => {
    store.saveSettings({ autoUpdate: v }).catch(() => {})
  },
})

/* ------------------------------- Java 管理 ------------------------------ */

/** 探测到的 Java 列表（内核暂无探测命令，恒为空 → 展示空态）。 */
// TODO: 内核 Java 探测命令就绪后在此填充（PATH 扫描 / JAVA_HOME / 注册表）。
const javas = ref<JavaEntry[]>([])
/** 探测中（刷新按钮禁用，避免重复触发）。 */
const javaScanning = ref(false)

/** 重新探测本机 Java（列表有数据时也可用）。 */
async function refreshJavaList() {
  if (javaScanning.value) return
  javaScanning.value = true
  try {
    const list = await new JavaManager().allAvailable()
    javas.value = list.map((j) => ({ major: j.major, path: j.path }))
    if (javas.value.length > 0) toast.success(`已找到 ${javas.value.length} 个 Java`)
    else toast.info('未发现已安装的 Java，可手动指定路径')
  } finally {
    javaScanning.value = false
  }
}

/** 把某个探测结果设为默认 Java（写核心字段 javaPath）。 */
function setDefaultJava(j: JavaEntry) {
  store.saveSettings({ javaPath: j.path }).catch(() => {})
  toast.success(`已将 Java ${j.major} 设为默认`)
}

/** 手动指定 Java 路径（内核文件选择命令未接入，先提示）。 */
function pickJavaManually() {
  // TODO: 接入内核文件选择后改为真实选取并写入 javaPath。
  toast.info('手动指定 Java 路径尚未接入，等待内核文件选择命令就绪。')
}

/* ------------------------------- 主题模式 ------------------------------- */

/** 主题模式下拉提交（store.setTheme 同步 data-theme 并落盘）。 */
function onThemeValue(value: string) {
  store.setTheme(value === 'dark' ? 'dark' : 'light')
}
</script>

<template>
  <div class="page-view active sub-page">
    <!-- ==================== 全局设置 ==================== -->
    <template v-if="section === 'global'">
      <!-- 启动选项 -->
      <SettingGroup title="启动选项">

        <div class="setting-row">
          <div class="setting-label">
            <span class="setting-label-line">
              默认版本隔离
              <AlxInfoTip :text="isolationDesc" />
            </span>
            <div class="setting-desc">新建实例默认采用的隔离方式</div>
          </div>
          <AlxSelect
            :model-value="extras.versionIsolation"
            :options="VERSION_ISOLATION_OPTIONS"
            @update:model-value="(v: string) => setChoice('versionIsolation', v)"
          />
        </div>

        <div class="setting-row">
          <div class="setting-label">
            游戏窗口标题
            <div class="setting-desc">留空时使用默认标题</div>
          </div>
          <input
            class="setting-input"
            :value="extras.windowTitle"
            placeholder="默认"
            @change="onTextInput('windowTitle', $event)"
          />
        </div>

        <div class="setting-row">
          <div class="setting-label">
            自定义图标
            <div class="setting-desc">{{ extras.iconPath || '未选择（使用默认图标）' }}</div>
          </div>
          <button type="button" class="btn-download btn-ghost" @click="pickIcon">选择图片</button>
        </div>

        <div class="setting-row">
          <div class="setting-label">
            自定义信息
            <div class="setting-desc">显示在游戏窗口的信息栏，留空则不显示</div>
          </div>
          <input
            class="setting-input"
            :value="extras.customInfo"
            placeholder="无"
            @change="onTextInput('customInfo', $event)"
          />
        </div>

        <div class="setting-row">
          <div class="setting-label">
            启动器可见性
            <div class="setting-desc">游戏启动后启动器的行为</div>
          </div>
          <AlxSelect
            :model-value="extras.launcherVisibility"
            :options="LAUNCHER_VISIBILITY_OPTIONS"
            @update:model-value="(v: string) => setChoice('launcherVisibility', v)"
          />
        </div>

        <div class="setting-row">
          <div class="setting-label">
            进程优先级
            <div class="setting-desc">越高游戏越流畅，但可能影响其他程序</div>
          </div>
          <AlxSelect
            :model-value="extras.processPriority"
            :options="PROCESS_PRIORITY_OPTIONS"
            @update:model-value="(v: string) => setChoice('processPriority', v)"
          />
        </div>

        <div class="setting-row">
          <div class="setting-label">
            窗口大小
            <div class="setting-desc">游戏窗口的初始尺寸</div>
          </div>
          <AlxSelect
            :model-value="extras.windowSize"
            :options="WINDOW_SIZE_OPTIONS"
            @update:model-value="(v: string) => setChoice('windowSize', v)"
          />
        </div>

        <div class="setting-row">
          <div class="setting-label">
            快速游玩
            <div class="setting-desc">启动游戏后直接进入指定服务器或世界</div>
          </div>
          <AlxSelect
            :model-value="extras.quickPlay"
            :options="QUICK_PLAY_OPTIONS"
            @update:model-value="(v: string) => setChoice('quickPlay', v)"
          />
        </div>

        <div class="setting-row">
          <div class="setting-label">
            启动前执行命令
            <div class="setting-desc">游戏启动前在系统 shell 中执行一次</div>
          </div>
          <input
            class="setting-input"
            :value="extras.preLaunchCommand"
            placeholder="无"
            @change="onTextInput('preLaunchCommand', $event)"
          />
        </div>
      </SettingGroup>

      <!-- 预设 -->
      <SettingGroup title="预设">
        <p class="setting-note">
          游戏设置预设管理着一组游戏设置，你可以在下方调整这些设置。所有实例默认继承当前预设中的游戏设置，
          也可以在实例的游戏设置页面中覆盖特定项。
        </p>
        <div class="setting-row">
          <div class="setting-label">
            当前预设
            <div class="setting-desc">实例默认继承该预设的游戏设置</div>
          </div>
          <div class="setting-controls">
            <AlxSelect
              :model-value="extras.presetName"
              :options="presetOptions"
              @update:model-value="(v: string) => setChoice('presetName', v)"
            />
            <button type="button" class="btn-download btn-ghost" @click="addPreset">新建预设</button>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-label">
            继承策略
            <div class="setting-desc">已自带游戏设置文件的整合包不继承预设</div>
          </div>
          <AlxSelect
            :model-value="extras.presetInherit"
            :options="PRESET_INHERIT_OPTIONS"
            @update:model-value="(v: string) => setChoice('presetInherit', v)"
          />
        </div>
      </SettingGroup>

      <!-- 内存分配 -->
      <SettingGroup title="内存分配">

        <div class="setting-row">
          <div class="setting-label">
            自动配置内存
            <div class="setting-desc">按系统可用内存自动分配；关闭后手动指定</div>
          </div>
          <AlxToggle
            :model-value="extras.autoMemory"
            @update:model-value="(v: boolean) => setExtra('autoMemory', v)"
          />
        </div>

        <div v-if="!extras.autoMemory" class="setting-row">
          <div class="setting-label">
            分配内存
            <div class="setting-desc">{{ formatGb(memoryMb / 1024) }}</div>
          </div>
          <input
            class="setting-range"
            type="range"
            min="512"
            :max="SYSTEM_MEMORY_GB * 1024 - 512"
            step="256"
            :value="memoryMb"
            @change="onMemoryChange"
          />
        </div>

        <div class="setting-row">
          <div class="setting-label">
            启动游戏前进行内存优化
            <div class="setting-desc">启动前清理系统缓存，尽量为游戏腾出内存</div>
          </div>
          <AlxToggle
            :model-value="extras.memoryOptimize"
            @update:model-value="(v: boolean) => setExtra('memoryOptimize', v)"
          />
        </div>

        <div class="setting-row">
          <div class="setting-label">
            已使用的内存
            <div class="setting-desc">系统总内存约 {{ SYSTEM_MEMORY_GB }} GB</div>
          </div>
          <div class="setting-label setting-memory-value">
            游戏分配 {{ formatGb(memoryMb / 1024) }}
            <div class="setting-desc">可用 {{ formatGb(memoryAvailableGb) }}</div>
          </div>
        </div>
        <div class="setting-row setting-row-bar">
          <div class="memory-bar">
            <div class="memory-bar-fill" :style="{ width: `${memoryPercent}%` }"></div>
          </div>
        </div>
      </SettingGroup>

      <!-- 高级选项 -->
      <SettingGroup title="高级选项">

        <div class="setting-row">
          <div class="setting-label">
            Java 虚拟机参数
            <div class="setting-desc">留空使用默认参数，多个参数用空格分隔</div>
          </div>
          <input
            class="setting-input wide"
            :value="extras.jvmArgs"
            placeholder="默认"
            @change="onTextInput('jvmArgs', $event)"
          />
        </div>

        <div class="setting-row">
          <div class="setting-label">
            游戏启动参数
            <div class="setting-desc">追加到游戏主类之后的参数</div>
          </div>
          <input
            class="setting-input wide"
            :value="extras.gameArgs"
            placeholder="无"
            @change="onTextInput('gameArgs', $event)"
          />
        </div>

        <div class="setting-row">
          <div class="setting-label">
            <span class="setting-label-line">
              Java 列表
              <AlxInfoTip :text="JAVA_LIST_TIP" />
            </span>
            <div class="setting-desc">{{ store.settings.javaPath || '未指定，将自动选择' }}</div>
          </div>
          <div class="setting-controls">
            <button
              type="button"
              class="icon-btn"
              title="重新获取 Java 列表"
              aria-label="重新获取 Java 列表"
              :disabled="javaScanning"
              @click="refreshJavaList"
            >
              <AlxIcon name="refresh" :size="15" />
            </button>
            <button
              type="button"
              class="icon-btn"
              title="Java 管理"
              aria-label="Java 管理"
              @click="store.routerPush('/settings/java')"
            >
              <AlxIcon name="settings" :size="15" />
            </button>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-label">
            内存管理
            <div class="setting-desc">选择游戏使用的垃圾回收器</div>
          </div>
          <AlxSelect
            :model-value="extras.gcMode"
            :options="GC_MODE_OPTIONS"
            @update:model-value="(v: string) => setExtra('gcMode', v as SettingsExtras['gcMode'])"
          />
        </div>

        <div class="setting-row">
          <div class="setting-label">
            禁用 Java Launch Wrapper
            <div class="setting-desc">不使用启动包装器，直接拉起 Java 进程</div>
          </div>
          <AlxToggle
            :model-value="extras.disableLaunchWrapper"
            @update:model-value="(v: boolean) => setExtra('disableLaunchWrapper', v)"
          />
        </div>

        <div class="setting-row">
          <div class="setting-label">
            禁用 LWJGL Unsafe Agent
            <div class="setting-desc">关闭 LWJGL 的 Unsafe 代理，兼容部分旧环境</div>
          </div>
          <AlxToggle
            :model-value="extras.disableUnsafeAgent"
            @update:model-value="(v: boolean) => setExtra('disableUnsafeAgent', v)"
          />
        </div>

        <div class="setting-row">
          <div class="setting-label">
            使用高性能显卡
            <div class="setting-desc">双显卡设备优先使用独立显卡</div>
          </div>
          <AlxToggle
            :model-value="extras.preferHighPerfGpu"
            @update:model-value="(v: boolean) => setExtra('preferHighPerfGpu', v)"
          />
        </div>
      </SettingGroup>
    </template>

    <!-- ==================== Java 运行环境管理 ==================== -->
    <template v-else-if="section === 'java'">

      <SettingGroup title="已安装的 Java">
        <!-- 探测列表：内核探测命令接入后展示（icon coffee / 标题 Java {major} / 描述路径） -->
        <template v-if="javas.length > 0">
          <div v-for="j in javas" :key="j.path" class="list-item">
            <div class="item-left">
              <div class="item-icon"><AlxIcon name="coffee" :size="20" /></div>
              <div class="item-info">
                <div class="item-title">Java {{ j.major }}</div>
                <div class="item-desc">{{ j.path }}</div>
              </div>
            </div>
            <div class="item-right">
              <button type="button" class="btn-download btn-ghost" @click="setDefaultJava(j)">设为默认</button>
            </div>
          </div>
        </template>
        <!-- 空态：未探测到 Java -->
        <div v-else class="empty-state">
          <AlxIcon name="coffee" :size="32" />
          <span>{{ javaScanning ? '正在获取本机 Java…' : '未发现已安装的 Java' }}</span>
          <span class="setting-desc">点击下方「自动获取路径」扫描，或手动指定路径。</span>
        </div>
      </SettingGroup>

      <!-- 底部动作：与下载页「开始下载」同款居中按钮，列表有数据时也常驻 -->
      <div class="setting-actions">
        <button type="button" class="btn-download" :disabled="javaScanning" @click="refreshJavaList">
          自动获取路径
        </button>
        <button type="button" class="btn-download btn-ghost" @click="pickJavaManually">
          手动指定路径
        </button>
      </div>
    </template>

    <!-- ==================== 启动器通用设置 ==================== -->
    <template v-else-if="section === 'general'">

      <SettingGroup title="基础">
        <div class="setting-row">
          <div class="setting-label">
            游戏语言
            <div class="setting-desc">以启动参数传入游戏进程</div>
          </div>
          <AlxSelect
            :model-value="extras.gameLanguage"
            :options="LANGUAGE_OPTIONS"
            @update:model-value="(v: string) => setExtra('gameLanguage', v as SettingsExtras['gameLanguage'])"
          />
        </div>
        <div class="setting-row">
          <div class="setting-label">
            自动检查更新
            <div class="setting-desc">启动时检查启动器新版本</div>
          </div>
          <AlxToggle v-model="autoUpdate" />
        </div>
      </SettingGroup>
    </template>

    <!-- ==================== 启动器外观设置 ==================== -->
    <template v-else-if="section === 'appearance'">

      <SettingGroup title="主题">
        <div class="setting-row">
          <div class="setting-label">
            不透明度
            <div class="setting-desc">窗口整体不透明度（{{ extras.opacity }}%）</div>
          </div>
          <input
            type="range"
            class="setting-range"
            :min="OPACITY_RANGE[0]"
            :max="OPACITY_RANGE[1]"
            step="1"
            :value="extras.opacity"
            @change="onOpacityChange"
          />
        </div>
        <div class="setting-row">
          <div class="setting-label">
            显示启动器图标
            <div class="setting-desc">在启动页展示 Aelux 图标</div>
          </div>
          <AlxToggle
            :model-value="extras.showLauncherIcon"
            @update:model-value="(v: boolean) => setExtra('showLauncherIcon', v)"
          />
        </div>
      </SettingGroup>

      <SettingGroup title="主题模式">
        <div class="setting-row">
          <div class="setting-label">
            模式
            <div class="setting-desc">浅色 / 深色，立即生效并记住</div>
          </div>
          <AlxSelect
            :model-value="store.theme"
            :options="THEME_OPTIONS"
            @update:model-value="onThemeValue"
          />
        </div>
      </SettingGroup>
    </template>

    <!-- ==================== 下载设置 ==================== -->
    <template v-else-if="section === 'download'">

      <SettingGroup title="网络与并发">
        <div class="setting-row">
          <div class="setting-label">
            最大并行下载数
            <div class="setting-desc">同时下载的文件数上限</div>
          </div>
          <AlxSelect
            :model-value="String(extras.maxParallel)"
            :options="parallelChoices"
            @update:model-value="onParallelValue"
          />
        </div>
        <div class="setting-row">
          <div class="setting-label">
            下载源
            <div class="setting-desc">版本清单与资源文件的优先来源</div>
          </div>
          <AlxSelect
            :model-value="extras.downloadSource"
            :options="DOWNLOAD_SOURCE_OPTIONS"
            @update:model-value="onDownloadSourceValue"
          />
        </div>
      </SettingGroup>
    </template>
  </div>
</template>
