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
import PageHeader from '../components/PageHeader.vue'
import AlxToggle from '../components/AlxToggle.vue'
import AlxIcon from '../components/AlxIcon.vue'
import {
  DOWNLOAD_SOURCE_OPTIONS,
  LANGUAGE_OPTIONS,
  OPACITY_RANGE,
  PARALLEL_OPTIONS,
  THEME_OPTIONS,
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
function onTextInput(key: 'windowTitle' | 'preLaunchCommand', e: Event) {
  setExtra(key, (e.target as HTMLInputElement).value)
}

/** 游戏语言下拉提交（仅接受已知值）。 */
function onGameLanguage(e: Event) {
  const v = (e.target as HTMLSelectElement).value
  setExtra('gameLanguage', v === 'en-US' ? 'en-US' : 'zh-CN')
}

/** 不透明度滑块提交（松手时夹取到合法区间再落盘）。 */
function onOpacityChange(e: Event) {
  setExtra('opacity', clampOpacity(Number((e.target as HTMLInputElement).value)))
}

/** 最大并行下载数下拉提交（仅接受 4 / 8 / 16）。 */
function onParallelChange(e: Event) {
  const v = Number((e.target as HTMLSelectElement).value)
  setExtra('maxParallel', v === 4 ? 4 : v === 16 ? 16 : 8)
}

/** 下载源下拉提交（仅接受已知值）。 */
function onDownloadSourceChange(e: Event) {
  const v = (e.target as HTMLSelectElement).value
  setExtra('downloadSource', v === 'official-first' ? 'official-first' : 'mirror-first')
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
function onThemeChange(e: Event) {
  const v = (e.target as HTMLSelectElement).value
  store.setTheme(v === 'dark' ? 'dark' : 'light')
}
</script>

<template>
  <div class="page-view active sub-page">
    <!-- ==================== 全局设置 ==================== -->
    <template v-if="section === 'global'">
      <PageHeader title="全局设置" />

      <div class="setting-group">
        <div class="setting-group-title">启动选项</div>
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
      </div>

      <div class="setting-group">
        <div class="setting-group-title">内存分配</div>
        <div class="setting-row">
          <div class="setting-label">
            自动配置内存
            <div class="setting-desc">按系统可用内存自动分配；关闭后使用手动分配值</div>
          </div>
          <AlxToggle
            :model-value="extras.autoMemory"
            @update:model-value="(v: boolean) => setExtra('autoMemory', v)"
          />
        </div>
      </div>
    </template>

    <!-- ==================== Java 运行环境管理 ==================== -->
    <template v-else-if="section === 'java'">
      <PageHeader title="Java 运行环境管理" />

      <div class="setting-group">
        <div class="setting-group-title">已安装的 Java</div>
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
        <!-- 静态空态：暂无 Java 探测能力 -->
        <div v-else class="empty-state">
          <AlxIcon name="coffee" :size="32" />
          <span>未发现已安装的 Java</span>
          <button type="button" class="btn-download btn-ghost" @click="pickJavaManually">手动指定路径</button>
        </div>
      </div>
    </template>

    <!-- ==================== 启动器通用设置 ==================== -->
    <template v-else-if="section === 'general'">
      <PageHeader title="启动器通用设置" />

      <div class="setting-group">
        <div class="setting-group-title">基础</div>
        <div class="setting-row">
          <div class="setting-label">
            游戏语言
            <div class="setting-desc">以启动参数传入游戏进程</div>
          </div>
          <select class="setting-select" :value="extras.gameLanguage" @change="onGameLanguage">
            <option v-for="o in LANGUAGE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </div>
        <div class="setting-row">
          <div class="setting-label">
            自动检查更新
            <div class="setting-desc">启动时检查启动器新版本</div>
          </div>
          <AlxToggle v-model="autoUpdate" />
        </div>
      </div>
    </template>

    <!-- ==================== 启动器外观设置 ==================== -->
    <template v-else-if="section === 'appearance'">
      <PageHeader title="启动器外观设置" />

      <div class="setting-group">
        <div class="setting-group-title">主题</div>
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
      </div>

      <div class="setting-group">
        <div class="setting-group-title">主题模式</div>
        <div class="setting-row">
          <div class="setting-label">
            模式
            <div class="setting-desc">浅色 / 深色，立即生效并记住</div>
          </div>
          <select class="setting-select" :value="store.theme" @change="onThemeChange">
            <option v-for="o in THEME_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </div>
      </div>
    </template>

    <!-- ==================== 下载设置 ==================== -->
    <template v-else-if="section === 'download'">
      <PageHeader title="下载设置" />

      <div class="setting-group">
        <div class="setting-group-title">网络与并发</div>
        <div class="setting-row">
          <div class="setting-label">
            最大并行下载数
            <div class="setting-desc">同时下载的文件数上限</div>
          </div>
          <select class="setting-select" :value="extras.maxParallel" @change="onParallelChange">
            <option v-for="n in PARALLEL_OPTIONS" :key="n" :value="n">{{ n }}</option>
          </select>
        </div>
        <div class="setting-row">
          <div class="setting-label">
            下载源
            <div class="setting-desc">版本清单与资源文件的优先来源</div>
          </div>
          <select class="setting-select" :value="extras.downloadSource" @change="onDownloadSourceChange">
            <option v-for="o in DOWNLOAD_SOURCE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </div>
      </div>
    </template>
  </div>
</template>
