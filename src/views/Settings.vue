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
import { computed, onMounted, ref, watch } from 'vue'
import type { SettingsSection } from '../lib/types'
import { useAppStore } from '../stores/app'
import { toast } from '../lib/toast'
import { call, isTauri, kvGet } from '../lib/bridge'
import { confirmDialog, promptDialog } from '../lib/dialog'
import { open } from '@tauri-apps/plugin-dialog'
import AlxSelect from '../components/AlxSelect.vue'
import AlxToggle from '../components/AlxToggle.vue'
import AlxInfoTip from '../components/AlxInfoTip.vue'
import AlxModal from '../components/AlxModal.vue'
import SettingGroup from '../components/SettingGroup.vue'
import AlxIcon from '../components/AlxIcon.vue'
import { javaManager } from './instanceMeta'
import {
  ACCENT_COLOR_OPTIONS,
  BACKGROUND_MODE_OPTIONS,
  CACHE_FOLDER_OPTIONS,
  DOWNLOAD_SOURCE_OPTIONS,
  GC_MODE_OPTIONS,
  JAVA_DISTRIBUTION_OPTIONS,
  JAVA_MAJOR_OPTIONS,
  LANGUAGE_OPTIONS,
  LAUNCHER_VISIBILITY_OPTIONS,
  OPACITY_RANGE,
  PARALLEL_RANGE,
  PARALLEL_WARN_THRESHOLD,
  PRESET_INHERIT_OPTIONS,
  PROCESS_PRIORITY_OPTIONS,
  PROXY_MODE_OPTIONS,
  QUICK_PLAY_OPTIONS,
  SPEED_LIMIT_RANGE,
  THEME_OPTIONS,
  UPDATE_CHANNEL_OPTIONS,
  VERSION_ISOLATION_OPTIONS,
  WINDOW_SIZE_OPTIONS,
  clampOpacity,
  clampParallel,
  clampSpeedLimit,
  extrasPatch,
  readExtras,
  type JavaEntry,
  type SettingsExtras,
} from './SettingsModel'
import { LAUNCHER_LANGUAGE_OPTIONS, applyLocale, isLocaleSupported, resolveLocale } from '../lib/i18n'

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

/** 下拉提交：写入对应偏好并落盘；切换预设时套用快照。 */
function setChoice(key: ChoiceKey, value: string) {
  if (key === 'presetName' && presetMap.value[value]) {
    applyPreset(value)
    return
  }
  extras.value = { ...extras.value, [key]: value } as SettingsExtras
  persistExtras()
}

/* ------------------------------ 游戏设置预设 ------------------------------ */

/** 预设快照：一组界面偏好 + 分配内存。 */
interface PresetSnapshot {
  extras: SettingsExtras
  memoryMb: number
}

/** 预设存储键（与设置同库的本地 KV）。 */
const PRESET_KEY = 'aelux.presets'
const presetMap = ref<Record<string, PresetSnapshot>>({})

/** 下拉选项：已有预设 + 当前名称（即使还没保存也可见）。 */
const presetOptions = computed(() => {
  const names = Object.keys(presetMap.value)
  if (!names.includes(extras.value.presetName)) names.unshift(extras.value.presetName)
  return names.map((name) => ({ value: name, label: name }))
})

/** 读取已保存的预设。 */
async function loadPresets() {
  const raw = await kvGet(PRESET_KEY)
  if (!raw) return
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object') presetMap.value = parsed as Record<string, PresetSnapshot>
  } catch {
    /* 损坏的预设数据直接忽略 */
  }
}

/** 落盘预设表。 */
async function persistPresets() {
  await call('kv_set', { key: PRESET_KEY, value: JSON.stringify(presetMap.value) })
}

/** 切换到某个预设：套用快照里的界面偏好与内存。 */
function applyPreset(name: string) {
  const snap = presetMap.value[name]
  if (!snap) return
  extras.value = { ...snap.extras, presetName: name }
  void store.saveSettings({
    memoryMb: snap.memoryMb,
    ...extrasPatch(extras.value),
  })
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

/* ----------------------------- 下载设置 ----------------------------- */

/** 文件下载源提交。 */
function onFileSourceValue(value: string) {
  setExtra('fileSource', value as SettingsExtras['fileSource'])
}

/** 版本下载源提交。 */
function onVersionSourceValue(value: string) {
  setExtra('versionSource', value as SettingsExtras['versionSource'])
}

/** 最大线程数滑块提交。 */
function onParallelChange(e: Event) {
  setExtra('maxParallel', clampParallel(Number((e.target as HTMLInputElement).value)))
}

/** 速度限制滑块提交（0 表示无限制）。 */
function onSpeedChange(e: Event) {
  setExtra('speedLimit', clampSpeedLimit(Number((e.target as HTMLInputElement).value)))
}

/** 速度限制显示文案。 */
const speedLimitLabel = computed(() =>
  extras.value.speedLimit === 0 ? '无限制' : `${extras.value.speedLimit} MB/s`,
)

/** 线程数过高提示（超过阈值时展示）。 */
const parallelWarning = computed(() => extras.value.maxParallel > PARALLEL_WARN_THRESHOLD)

/* --------------------------- Java 在线下载 --------------------------- */

/** 下载 Java 弹窗开关。 */
const javaDownloadOpen = ref(false)
/** 选中的发行版。 */
const javaDistribution = ref(JAVA_DISTRIBUTION_OPTIONS[0].value)
/** 选中的 Java 大版本。 */
const javaMajor = ref('21')
/** 是否正在在线安装 Java。 */
const javaDownloading = ref(false)

function openJavaDownload() {
  javaDownloadOpen.value = true
}

/** 在线安装 Temurin JRE（内核下载 + 解压 + 探测），完成后写回 javaPath。 */
async function downloadJava() {
  if (javaDownloading.value) return
  javaDownloading.value = true
  try {
    const result = await store.installJava(Number(javaMajor.value))
    if (result) {
      javas.value = [
        ...javas.value.filter((j) => j.path !== result.runtime.path),
        { major: result.runtime.major, path: result.runtime.path },
      ]
      // 新装的 Java 不在旧扫描缓存里，后台重扫一次，避免下次进入页面看不到
      void javaManager.refresh()
      javaDownloadOpen.value = false
    }
  } finally {
    javaDownloading.value = false
  }
}

/** 打开图片选择器；浏览器预览没有本地文件访问能力。 */
async function pickImagePath(): Promise<string | null> {
  if (!isTauri) {
    toast.info('浏览器预览无法访问本地文件，请在桌面端操作。')
    return null
  }
  const picked = await open({
    multiple: false,
    directory: false,
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  })
  return typeof picked === 'string' ? picked : null
}

/** 自定义图标：写入偏好并立即应用为窗口图标。 */
async function pickIcon() {
  try {
    const path = await pickImagePath()
    if (!path) return
    setExtra('iconPath', path)
    await call('set_window_icon', { path })
    toast.success('已应用自定义窗口图标')
  } catch (e) {
    toast.warning(`设置图标失败：${(e as Error).message}`)
  }
}

/** 新建游戏设置预设：保存当前界面偏好与内存分配。 */
async function addPreset() {
  const result = await promptDialog({
    title: '新建预设',
    message: '请输入预设名称',
    fields: [
      { key: 'name', label: '预设名', value: `预设 ${Object.keys(presetMap.value).length + 1}` },
    ],
  })
  const name = result?.name?.trim()
  if (!name) return
  presetMap.value = {
    ...presetMap.value,
    [name]: { extras: { ...extras.value, presetName: name }, memoryMb: store.settings.memoryMb },
  }
  extras.value = { ...extras.value, presetName: name }
  persistExtras()
  try {
    await persistPresets()
    toast.success(`已创建预设「${name}」`)
  } catch (e) {
    toast.warning(`保存预设失败：${(e as Error).message}`)
  }
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

/** 探测到的 Java 列表（来自内核 `scan_java`）。 */
const javas = ref<JavaEntry[]>([])
/** 探测中（刷新按钮禁用，避免重复触发）。 */
const javaScanning = ref(false)

/** 读取 Java 列表：首次进入用缓存，手动刷新才强制重新探测。 */
async function refreshJavaList(force = false) {
  if (javaScanning.value) return
  javaScanning.value = true
  try {
    const list = await (force ? javaManager.refresh() : javaManager.allAvailable())
    javas.value = list.map((j) => ({
      major: j.major,
      version: j.version,
      vendor: j.vendor,
      arch: j.arch,
      path: j.path,
    }))
    if (force) {
      if (list.length > 0) toast.success(`已找到 ${javas.value.length} 个 Java`)
      else toast.info('未发现已安装的 Java，可手动指定路径')
    }
  } finally {
    javaScanning.value = false
  }
}

/** 「重新获取」按钮：绕过缓存强制重扫。 */
function onRefreshJava() {
  void refreshJavaList(true)
}

// 首次进入设置页读取 Java 列表（有缓存时直接复用，不重复探测）
onMounted(() => {
  void refreshJavaList()
  void loadPresets()
  // 已保存的自定义窗口图标：进入设置页时重新应用一次
  if (isTauri && extras.value.iconPath) {
    void call('set_window_icon', { path: extras.value.iconPath }).catch(() => {})
  }
  // 开启「自动检查更新」时静默检查一次：有新版本才弹窗
  if (store.settings.autoUpdate) void checkUpdates(true)
})

/** 打开 Java 所在文件夹（不修改任何配置）。 */
function revealJava(j: JavaEntry) {
  void call('open_folder_in_explorer', { path: j.path }).catch(() => toast.error('无法打开所在文件夹'))
}

/** 待移除的 Java（删除走弹窗确认）。 */
const removeTarget = ref<JavaEntry | null>(null)

/** 请求移除：先打开确认弹窗。 */
function askRemoveJava(j: JavaEntry) {
  removeTarget.value = j
}

/** 确认移除：仅从全局列表移除，不删除磁盘上的 Java。 */
function confirmRemoveJava() {
  const target = removeTarget.value
  if (!target) return
  javas.value = javas.value.filter((item) => item.path !== target.path)
  removeTarget.value = null
  toast.success(`已从列表移除 Java ${target.major}（未删除本地文件）`)
}

/** 手动指定 Java 路径：选择可执行文件后探测并写回全局设置。 */
async function pickJavaManually() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Java 可执行文件', extensions: ['exe'] }],
    })
    if (typeof picked !== 'string' || !picked) return
    const found = await call<{
      path: string
      version: string
      major: number
      vendor: string
      arch: string
    }>('probe_java', { path: picked })
    await store.saveSettings({ javaPath: found.path })
    javas.value = [
      ...javas.value.filter((j) => j.path !== found.path),
      { major: found.major, version: found.version, vendor: found.vendor, arch: found.arch, path: found.path },
    ]
    toast.success(`已指定 Java ${found.major}`)
  } catch (e) {
    toast.warning(`选择 Java 失败：${(e as Error).message}`)
  }
}

/* ------------------------------- 主题模式 ------------------------------- */

/** 主题模式下拉提交（store.setTheme 同步 data-theme 并落盘）。 */
function onThemeValue(value: string) {
  store.setTheme(value === 'light' || value === 'dark' ? value : 'system')
}

/** 启动器语言：保存偏好并应用语言包；未支持的语言回退简体中文并提示。 */
function onLanguageValue(value: string) {
  setExtra('launcherLanguage', value)
  applyLocale(resolveLocale(value))
  if (value !== 'system' && !isLocaleSupported(value)) {
    toast.info('该语言暂未支持，界面将继续使用简体中文。')
  }
}

/** 本地更新清单（发布方写入 data/update.json，存在才代表有新版本）。 */
interface LocalUpdateInfo {
  version?: string
  notes?: string
  url?: string
}

const updateModalOpen = ref(false)
const updateInfo = ref<(LocalUpdateInfo & { current: string }) | null>(null)

/** 读取更新清单并与当前版本比对；silent 时无新版本不打扰用户。 */
async function checkUpdates(silent = false) {
  try {
    const current = await call<string>('get_core_version')
    const raw = await call<string>('read_local_update')
    const info = raw.trim() ? (JSON.parse(raw) as LocalUpdateInfo) : null
    if (!info?.version || info.version === current) {
      if (!silent) toast.success(`当前已是最新版本（${current}）`)
      return
    }
    updateInfo.value = { ...info, current }
    updateModalOpen.value = true
  } catch (e) {
    if (!silent) toast.warning(`检查更新失败：${(e as Error).message}`)
  }
}

/** 打开更新说明中的下载页。 */
function openUpdateUrl() {
  const url = updateInfo.value?.url
  if (!url) return
  void call('open_external', { url }).catch(() => toast.error('无法打开链接'))
}

/** 自定义主题色取色提交。 */
function onAccentColorHex(e: Event) {
  setExtra('accentColorHex', (e.target as HTMLInputElement).value)
}

/** 代理与缓存目录的文本输入提交。 */
function onProxyInput(
  key: 'proxyHost' | 'proxyPort' | 'proxyUser' | 'proxyPassword' | 'cacheFolderPath',
  e: Event,
) {
  setExtra(key, (e.target as HTMLInputElement).value)
}

/** 选择背景图片：写入路径并切到「自定义」背景，App 根节点会立即应用。 */
async function pickBackground() {
  try {
    const path = await pickImagePath()
    if (!path) return
    extras.value = { ...extras.value, backgroundMode: 'custom', backgroundPath: path }
    persistExtras()
    toast.success('已设置自定义背景')
  } catch (e) {
    toast.warning(`选择背景失败：${(e as Error).message}`)
  }
}

/** 选择缓存目录：目录由内核 `cache_dir` 使用，切换后新下载落到新位置。 */
async function pickCacheFolder() {
  if (!isTauri) {
    toast.info('浏览器预览无法选择本地目录，请在桌面端操作。')
    return
  }
  try {
    const picked = await open({ multiple: false, directory: true })
    if (typeof picked !== 'string') return
    extras.value = { ...extras.value, cacheFolderMode: 'custom', cacheFolderPath: picked }
    persistExtras()
    toast.success(`缓存目录已切换到 ${picked}`)
  } catch (e) {
    toast.warning(`选择缓存目录失败：${(e as Error).message}`)
  }
}

/** 清理下载缓存：二次确认后由内核删除缓存目录内容。 */
async function clearDownloadCache() {
  const ok = await confirmDialog({
    title: '清理下载缓存',
    message: '将删除缓存目录中的全部文件（下次需要时会重新下载），确定继续吗？',
    confirmText: '清理',
    danger: true,
  })
  if (!ok) return
  try {
    const removed = await call<number>('clear_cache')
    toast.success(`已清理 ${removed} 项缓存`)
  } catch (e) {
    toast.error(`清理缓存失败：${(e as Error).message}`)
  }
}
</script>

<template>
  <div class="page-view active sub-page settings-page">
    <!-- ==================== 全局设置 ==================== -->
    <template v-if="section === 'global'">
      <!-- 启动选项 -->
      <SettingGroup title="启动选项" :collapsible="false">

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
      <SettingGroup title="预设" :collapsible="false">
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
      <SettingGroup title="内存分配" :collapsible="false">

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
      <SettingGroup title="高级选项" :default-open="false">

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
              class="setting-icon-btn"
              title="重新获取 Java 列表"
              aria-label="重新获取 Java 列表"
              :disabled="javaScanning"
              @click="onRefreshJava"
            >
              <AlxIcon name="refresh" :size="15" />
            </button>
            <button
              type="button"
              class="setting-icon-btn"
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

      <SettingGroup title="已安装的 Java" :collapsible="false">
        <!-- Java 列表：版本徽标 + 版本名 / 架构 / 供应商 + 路径，右侧打开文件夹与移除 -->
        <template v-if="javas.length > 0">
          <div v-for="j in javas" :key="j.path" class="list-item java-row">
            <div class="item-left">
              <span class="java-badge">{{ j.major }}</span>
              <div class="item-info">
                <div class="item-title">
                  {{ j.version ?? `Java ${j.major}` }}
                  <span v-if="j.arch" class="java-chip">架构: {{ j.arch }}</span>
                  <span v-if="j.vendor" class="java-chip">供应商: {{ j.vendor }}</span>
                </div>
                <div class="item-desc">{{ j.path }}</div>
              </div>
            </div>
            <div class="item-right java-actions">
              <button
                type="button"
                class="setting-icon-btn"
                title="打开所在文件夹"
                aria-label="打开所在文件夹"
                @click="revealJava(j)"
              >
                <AlxIcon name="folder" :size="16" />
              </button>
              <button
                type="button"
                class="setting-icon-btn"
                title="从列表移除"
                aria-label="从列表移除"
                @click="askRemoveJava(j)"
              >
                <AlxIcon name="trash" :size="16" />
              </button>
            </div>
          </div>
        </template>
        <!-- 空态：未探测到 Java -->
        <div v-else class="empty-state">
          <AlxIcon name="coffee" :size="32" />
          <span>{{ javaScanning ? '正在获取本机 Java…' : '未发现已安装的 Java' }}</span>
          <span class="setting-desc">点击下方「自动获取」扫描，或使用「添加 Java」手动选择。</span>
        </div>
      </SettingGroup>

      <!-- 底部动作：固定在页面底部居中，列表有数据时也常驻 -->
      <div class="setting-actions">
        <button type="button" class="btn-download" :disabled="javaScanning" @click="onRefreshJava">
          自动获取
        </button>
        <button type="button" class="btn-download" @click="openJavaDownload">下载 Java</button>
        <button type="button" class="btn-download" @click="pickJavaManually">添加 Java</button>
      </div>

      <!-- 在线下载 Java：发行版 + 自动获取的大版本（统一 JDK） -->
      <AlxModal :open="javaDownloadOpen" title="下载 Java" @close="javaDownloadOpen = false">
        <div class="modal-field">
          <span class="modal-field-label">发行版</span>
          <AlxSelect v-model="javaDistribution" :options="JAVA_DISTRIBUTION_OPTIONS" />
        </div>
        <div class="modal-field">
          <span class="modal-field-label">版本</span>
          <AlxSelect v-model="javaMajor" :options="JAVA_MAJOR_OPTIONS" />
        </div>
        <div class="modal-field">
          <span class="modal-field-label">包类型</span>
          <span class="modal-field-value">JDK（内含完整 JRE，可直接运行 Minecraft）</span>
        </div>
        <p class="modal-note">大版本列表会自动获取当前可下载的 Java 版本。</p>
        <template #actions>
          <button type="button" class="btn-sub" @click="javaDownloadOpen = false">取消</button>
          <button type="button" class="btn-download" :disabled="javaDownloading" @click="downloadJava">
            {{ javaDownloading ? '正在下载…' : '下载 Java' }}
          </button>
        </template>
      </AlxModal>

      <!-- 从全局 Java 列表移除（二次确认弹窗，不改动磁盘文件） -->
      <AlxModal :open="removeTarget !== null" title="从列表移除 Java" @close="removeTarget = null">
        <p class="modal-note">
          将从全局 Java 列表中移除
          <strong>{{ removeTarget?.version ?? `Java ${removeTarget?.major ?? ''}` }}</strong>，
          不会删除磁盘上的 Java 文件，之后仍可重新添加。
        </p>
        <template #actions>
          <button type="button" class="btn-sub" @click="removeTarget = null">取消</button>
          <button type="button" class="btn-download" @click="confirmRemoveJava">移除</button>
        </template>
      </AlxModal>
    </template>

    <!-- ==================== 启动器通用设置 ==================== -->
    <template v-else-if="section === 'general'">

      <SettingGroup title="基础" :collapsible="false">
        <div class="setting-row">
          <div class="setting-label">
            启动器语言
            <div class="setting-desc">默认跟随系统语言，目前仅提供简体中文</div>
          </div>
          <AlxSelect
            :model-value="extras.launcherLanguage"
            :options="LAUNCHER_LANGUAGE_OPTIONS"
            @update:model-value="onLanguageValue"
          />
        </div>
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
      </SettingGroup>

      <SettingGroup title="启动器更新" :collapsible="false">
        <div class="setting-row">
          <div class="setting-label">
            启动器更新版本
            <div class="setting-desc">开发版包含尚未稳定的新功能</div>
          </div>
          <AlxSelect
            :model-value="extras.updateChannel"
            :options="UPDATE_CHANNEL_OPTIONS"
            @update:model-value="(v: string) => setExtra('updateChannel', v as SettingsExtras['updateChannel'])"
          />
        </div>
        <div class="setting-row">
          <div class="setting-label">
            提前预览更新版本
            <div class="setting-desc">接收下一个正式版之前的预览版；正式版发布后会自动升级为正式版</div>
          </div>
          <AlxToggle
            :model-value="extras.previewUpdates"
            @update:model-value="(v: boolean) => setExtra('previewUpdates', v)"
          />
        </div>
        <div class="setting-row">
          <div class="setting-label">
            自动显示更新弹窗
            <div class="setting-desc">发现新版本时自动弹出更新提示</div>
          </div>
          <AlxToggle
            :model-value="extras.showUpdateDialog"
            @update:model-value="(v: boolean) => setExtra('showUpdateDialog', v)"
          />
        </div>
        <div class="setting-row">
          <div class="setting-label">
            自动显示所有公告
            <div class="setting-desc">启动时展示全部未读公告</div>
          </div>
          <AlxToggle
            :model-value="extras.showAnnouncements"
            @update:model-value="(v: boolean) => setExtra('showAnnouncements', v)"
          />
        </div>
        <div class="setting-row">
          <div class="setting-label">
            自动检查更新
            <div class="setting-desc">启动时检查启动器新版本</div>
          </div>
          <AlxToggle v-model="autoUpdate" />
        </div>
        <div class="setting-row">
          <div class="setting-label">
            手动检查更新
            <div class="setting-desc">立即向更新服务查询是否有新版本</div>
          </div>
          <button type="button" class="setting-btn" @click="checkUpdates()">检查更新</button>
        </div>
      </SettingGroup>

      <!-- 发现新版本：展示版本号与更新说明 -->
      <AlxModal :open="updateModalOpen" title="发现新版本" @close="updateModalOpen = false">
        <p class="modal-note">
          当前版本 <strong>{{ updateInfo?.current }}</strong>，最新版本
          <strong>{{ updateInfo?.version }}</strong>。
        </p>
        <p v-if="updateInfo?.notes" class="modal-note">{{ updateInfo.notes }}</p>
        <template #actions>
          <button type="button" class="btn-sub" @click="updateModalOpen = false">稍后</button>
          <button v-if="updateInfo?.url" type="button" class="btn-download" @click="openUpdateUrl">
            前往下载
          </button>
        </template>
      </AlxModal>
    </template>

    <!-- ==================== 启动器外观设置 ==================== -->
    <template v-else-if="section === 'appearance'">

      <SettingGroup title="外观" :collapsible="false">
        <div class="setting-row">
          <div class="setting-label">
            主题模式
            <div class="setting-desc">跟随系统 / 浅色 / 深色，立即生效并记住</div>
          </div>
          <AlxSelect
            :model-value="store.theme"
            :options="THEME_OPTIONS"
            @update:model-value="onThemeValue"
          />
        </div>
        <div class="setting-row">
          <div class="setting-label">
            主题色
            <div class="setting-desc">自定义时可选任意颜色</div>
          </div>
          <div class="setting-controls">
            <input
              v-if="extras.accentColor === 'custom'"
              type="color"
              class="setting-color"
              :value="extras.accentColorHex"
              @change="onAccentColorHex"
            />
            <AlxSelect
              :model-value="extras.accentColor"
              :options="ACCENT_COLOR_OPTIONS"
              @update:model-value="(v: string) => setExtra('accentColor', v as SettingsExtras['accentColor'])"
            />
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-label">
            背景图片
            <div class="setting-desc">内置 / 自定义 / 纯色等来源</div>
          </div>
          <div class="setting-controls">
            <button
              v-if="extras.backgroundMode === 'custom'"
              type="button"
              class="setting-btn"
              @click="pickBackground"
            >
              选择图片
            </button>
            <AlxSelect
              :model-value="extras.backgroundMode"
              :options="BACKGROUND_MODE_OPTIONS"
              @update:model-value="(v: string) => setExtra('backgroundMode', v as SettingsExtras['backgroundMode'])"
            />
          </div>
        </div>
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
    </template>

    <!-- ==================== 下载设置 ==================== -->
    <template v-else-if="section === 'download'">

      <SettingGroup title="下载源" :collapsible="false">
        <div class="setting-row">
          <div class="setting-label">
            文件下载源
            <div class="setting-desc">游戏文件、资源包等文件的下载来源；默认官方优先，缓慢时自动换用 BMCLAPI / MCIM 等镜像</div>
          </div>
          <AlxSelect
            :model-value="extras.fileSource"
            :options="DOWNLOAD_SOURCE_OPTIONS"
            @update:model-value="onFileSourceValue"
          />
        </div>
        <div class="setting-row">
          <div class="setting-label">
            版本下载源
            <div class="setting-desc">版本清单与版本 JSON 的下载来源；默认官方优先，缓慢时自动换用 BMCLAPI 镜像</div>
          </div>
          <AlxSelect
            :model-value="extras.versionSource"
            :options="DOWNLOAD_SOURCE_OPTIONS"
            @update:model-value="onVersionSourceValue"
          />
        </div>
      </SettingGroup>

      <SettingGroup title="社区资源" :collapsible="false">
        <div class="setting-row">
          <div class="setting-label">
            按当前实例自动筛选
            <div class="setting-desc">
              下载模组、资源包等社区资源时，自动按当前选中实例的游戏版本与加载器预填筛选条件并检索；每次进入资源分类页都会重新应用
            </div>
          </div>
          <AlxToggle
            :model-value="extras.autoFilterDownload"
            @update:model-value="(v: boolean) => setExtra('autoFilterDownload', v)"
          />
        </div>
      </SettingGroup>

      <SettingGroup title="下载性能" :collapsible="false">
        <div class="setting-row stacked">
          <div class="setting-label">
            最大线程数
            <div class="setting-desc">当前 {{ extras.maxParallel }} 线程</div>
            <div v-if="parallelWarning" class="setting-warning">
              超过 {{ PARALLEL_WARN_THRESHOLD }} 线程可能明显加剧下载时的卡顿，建议保持 64
            </div>
          </div>
          <input
            type="range"
            class="setting-range"
            :min="PARALLEL_RANGE[0]"
            :max="PARALLEL_RANGE[1]"
            step="1"
            :value="extras.maxParallel"
            title="64 线程已足够；线程数越多，限速文件下载越快，但过高会造成下载时明显卡顿"
            @change="onParallelChange"
          />
        </div>
        <div class="setting-row stacked">
          <div class="setting-label">
            速度限制
            <div class="setting-desc">{{ speedLimitLabel }}</div>
          </div>
          <input
            type="range"
            class="setting-range"
            :min="SPEED_LIMIT_RANGE[0]"
            :max="SPEED_LIMIT_RANGE[1]"
            step="1"
            :value="extras.speedLimit"
            title="0 表示无限制；可设置 1–128 MB/s，限制过高会拖慢下载"
            @change="onSpeedChange"
          />
        </div>
        <div class="setting-row">
          <div class="setting-label">
            下载缓存文件夹
            <div class="setting-desc">
              {{
                extras.cacheFolderMode === 'default'
                  ? '.minecraft（启动器根目录），存放下载中的临时文件'
                  : extras.cacheFolderPath || '未选择目录'
              }}
            </div>
          </div>
          <div class="setting-controls">
            <button
              v-if="extras.cacheFolderMode === 'custom'"
              type="button"
              class="setting-btn"
              @click="pickCacheFolder"
            >
              选择文件夹
            </button>
            <AlxSelect
              :model-value="extras.cacheFolderMode"
              :options="CACHE_FOLDER_OPTIONS"
              @update:model-value="(v: string) => setExtra('cacheFolderMode', v as SettingsExtras['cacheFolderMode'])"
            />
            <button type="button" class="setting-btn" @click="clearDownloadCache">清理缓存</button>
          </div>
        </div>
      </SettingGroup>

      <SettingGroup title="代理" :collapsible="false">
        <div class="setting-row">
          <div class="setting-label">
            代理方式
            <div class="setting-desc">HTTP / SOCKS 需要填写主机与端口</div>
          </div>
          <AlxSelect
            :model-value="extras.proxyMode"
            :options="PROXY_MODE_OPTIONS"
            @update:model-value="(v: string) => setExtra('proxyMode', v as SettingsExtras['proxyMode'])"
          />
        </div>

        <template v-if="extras.proxyMode === 'http' || extras.proxyMode === 'socks'">
          <div class="setting-row">
            <div class="setting-label">
              主机
              <div class="setting-desc">代理服务器地址，例如 127.0.0.1</div>
            </div>
            <input
              class="setting-input"
              :value="extras.proxyHost"
              placeholder="127.0.0.1"
              @change="onProxyInput('proxyHost', $event)"
            />
          </div>
          <div class="setting-row">
            <div class="setting-label">
              端口
              <div class="setting-desc">代理服务器端口</div>
            </div>
            <input
              class="setting-input setting-input-sm"
              :value="extras.proxyPort"
              placeholder="0"
              inputmode="numeric"
              @change="onProxyInput('proxyPort', $event)"
            />
          </div>
          <div class="setting-row">
            <div class="setting-label">
              身份验证
              <div class="setting-desc">代理需要账号密码时开启</div>
            </div>
            <AlxToggle
              :model-value="extras.proxyAuth"
              @update:model-value="(v: boolean) => setExtra('proxyAuth', v)"
            />
          </div>
          <div class="setting-row">
            <div class="setting-label">
              账户
              <div class="setting-desc">未开启身份验证时不可填写</div>
            </div>
            <input
              class="setting-input"
              :value="extras.proxyUser"
              placeholder="用户名"
              :disabled="!extras.proxyAuth"
              @change="onProxyInput('proxyUser', $event)"
            />
          </div>
          <div class="setting-row">
            <div class="setting-label">
              密码
              <div class="setting-desc">未开启身份验证时不可填写</div>
            </div>
            <input
              type="password"
              class="setting-input"
              :value="extras.proxyPassword"
              placeholder="密码"
              :disabled="!extras.proxyAuth"
              @change="onProxyInput('proxyPassword', $event)"
            />
          </div>
        </template>
      </SettingGroup>

    </template>
  </div>
</template>
