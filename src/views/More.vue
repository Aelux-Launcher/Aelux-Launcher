<script setup lang="ts">
/**
 * 更多模块（与设置页同一套卡片语言）：
 *   侧栏分组由 SideNav 负责（帮助 / 关于 / 反馈 / 日志 / 联机），
 *   这里按 URL 参数 sec 渲染对应分节内容：
 *     help     —— 帮助文档（单张卡片，折叠条目，阅读全文进入详情副页面）
 *     about    —— 关于（软件信息 / 特别鸣谢 / 法律信息）
 *     feedback —— 反馈与建议（GitHub Issues / 官方交流群 / 提交前准备）
 *     logs     —— 日志（按版本分组的日志文件，可打开所在文件夹或删除）
 *     online   —— 联机（服务器列表 + 添加表单）
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAppStore } from '../stores/app'
import { call } from '../lib/bridge'
import { confirmDialog } from '../lib/dialog'
import { toast } from '../lib/toast'
import AlxIcon from '../components/AlxIcon.vue'
import SettingGroup from '../components/SettingGroup.vue'
import { loaderIconUrl } from '../lib/loaderIcons'
import type { GameInstance } from '../lib/types'
import { HELP_ENTRIES, type HelpEntry } from './helpEntries'

type Section = 'help' | 'about' | 'feedback' | 'logs' | 'online'

const props = defineProps<{ sec: string }>()

const store = useAppStore()

/** 当前分节（非法值回落到帮助）。 */
const section = computed<Section>(() =>
  (['help', 'about', 'feedback', 'logs', 'online'] as const).includes(props.sec as Section)
    ? (props.sec as Section)
    : 'help',
)

/* ------------------------------- 帮助文档 ------------------------------- */

/** 当前展开的折叠条目（同一时间只展开一条）。 */
const openHelpId = ref('')

function toggleHelp(id: string) {
  openHelpId.value = openHelpId.value === id ? '' : id
}

/** 进入帮助详情副页面（顶栏切换为「← 返回 + 条目标题」）。 */
function readFull(e: HelpEntry) {
  store.openSubPage({ kind: 'help', entryId: e.id, title: e.title })
}

/* --------------------------------- 关于 --------------------------------- */

/** 特别鸣谢条目（沿用旧版 AboutPanel 的内容与 aelux.app 链接）。 */
const THANKS: Array<{ title: string; desc: string; url: string }> = [
  { title: '镜像源服务商', desc: '提供了版本清单与文件的加速下载服务', url: 'https://aelux.app/mirror/sponsor' },
  { title: '游戏百科', desc: '整理了 Mod 名称的中文翻译和更多相关信息', url: 'https://aelux.app/wiki' },
  { title: '社区资源镜像站', desc: '提供了社区资源的镜像分发', url: 'https://aelux.app/mirror/community' },
  { title: '开源软件镜像站', desc: '提供了启动器及部分开源项目的镜像分发', url: 'https://aelux.app/mirror/opensource' },
  { title: '图标设计师', desc: '设计并制作了启动器图标', url: '' },
]

/** 法律信息折叠面板展开态。 */
const legalOpen = ref(false)

/* --------------------------------- 反馈 --------------------------------- */

/** GitHub Issues 反馈入口（TODO：仓库地址确定后替换）。 */
const ISSUES_URL = 'https://github.com/Aelux-Launcher/Aelux-Launcher/issues'
/** 官方交流群信息页（TODO：社区落地页确定后替换）。 */
const GROUP_URL = 'https://aelux.app/community'

/** 提交反馈前建议准备的信息。 */
const FEEDBACK_TIPS = [
  { title: '启动器版本号', desc: '可在「关于」页查看当前版本，便于确认问题所在的版本。' },
  { title: '问题复现步骤', desc: '按顺序说明操作步骤，必要时附上截图或录屏。' },
  { title: '相关日志文件', desc: '日志能帮助快速定位问题，提交前可以先到日志页确认。' },
]

/** 打开外部网页（统一走内核 open_external，失败给出提示）。 */
async function openExternal(url: string) {
  try {
    await call('open_external', { url })
  } catch (e) {
    toast.error(`无法打开网页：${(e as Error).message}`)
  }
}

/** 从「提交前请准备」跳到日志页。 */
function openLogs() {
  store.setNav('more', 'logs')
  void store.routerPush('/more/logs')
}

/* --------------------------------- 日志 --------------------------------- */

/** 内核返回的一条日志文件。 */
interface LogEntry {
  instanceId: string
  name: string
  path: string
  source: string
  sizeBytes: number
  modifiedSecs: number
}

/** 全部日志（按实例 id 分组展示）。 */
const logs = ref<LogEntry[]>([])
const logsLoading = ref(false)
const logsError = ref('')

/** 当前查看日志的实例 id（空 = 显示版本列表）。 */
const logInstanceId = ref('')

/** 当前实例。 */
const currentInstance = computed(
  () => store.instances.find((i) => i.id === logInstanceId.value) ?? null,
)

/** 当前实例的日志（最近修改的在前，与内核排序一致）。 */
const currentLogs = computed(() => logs.value.filter((l) => l.instanceId === logInstanceId.value))

/** 每个实例的日志数量。 */
const logCounts = computed(() => {
  const map: Record<string, number> = {}
  for (const l of logs.value) map[l.instanceId] = (map[l.instanceId] ?? 0) + 1
  return map
})

/** 读取日志清单（进入日志页时刷新一次）。 */
async function loadLogs() {
  if (logsLoading.value) return
  logsLoading.value = true
  logsError.value = ''
  try {
    logs.value = await call<LogEntry[]>('list_logs')
  } catch (e) {
    logsError.value = (e as Error).message
    toast.error(`读取日志失败：${logsError.value}`)
  } finally {
    logsLoading.value = false
  }
}

// 切换到日志页时刷新；离开时回到版本列表。
watch(
  section,
  (s) => {
    logInstanceId.value = ''
    if (s === 'logs') void loadLogs()
  },
  { immediate: true },
)

/** 加载器显示名。 */
const LOADER_LABEL: Record<string, string> = {
  vanilla: '原版',
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  quilt: 'Quilt',
}

function loaderLabel(i: GameInstance): string {
  return LOADER_LABEL[i.loader || 'vanilla'] ?? i.loader
}

/** 实例图标：原版草方块，其余用对应加载器图标。 */
function loaderIconSrc(i: GameInstance): string | null {
  return loaderIconUrl(i.loader || 'vanilla')
}

function loaderIcon(i: GameInstance): string {
  const key = i.loader || 'vanilla'
  return key === 'vanilla' ? 'minecraft' : key
}

/** 实例的日志数量。 */
function logCount(id: string): number {
  return logCounts.value[id] ?? 0
}

/** 日志标题（启动器捕获的输出统一显示为「启动日志」）。 */
function logTitle(l: LogEntry): string {
  return l.source === 'launcher' ? '启动日志' : l.name
}

/** 日志副文本：文件名（启动器日志）+ 大小 + 修改时间。 */
function logDesc(l: LogEntry): string {
  const parts = [formatSize(l.sizeBytes), formatTime(l.modifiedSecs)]
  if (l.source === 'launcher') parts.unshift(l.name)
  return parts.join(' · ')
}

/** 文件体积显示。 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 时间显示（Unix 秒 → 本地时间）。 */
function formatTime(sec: number): string {
  if (!sec) return '时间未知'
  const d = new Date(sec * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 日志所在目录（打开文件夹用）。 */
function logDir(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return idx > 0 ? path.slice(0, idx) : path
}

/** 打开日志所在文件夹。 */
async function openLogFolder(l: LogEntry) {
  try {
    await call('open_folder_in_explorer', { path: logDir(l.path) })
  } catch (e) {
    toast.error(`打开失败：${(e as Error).message}`)
  }
}

/** 删除日志（二级锁确认，删除后即时从列表移除）。 */
async function deleteLog(l: LogEntry) {
  const ok = await confirmDialog({
    title: '删除日志',
    message: `确定删除日志「${logTitle(l)}」？删除后无法恢复。`,
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  try {
    await call('delete_path', { path: l.path })
    logs.value = logs.value.filter((item) => item.path !== l.path)
    toast.success('日志已删除')
  } catch (e) {
    toast.error(`删除失败：${(e as Error).message}`)
  }
}

/** 顶栏 ← 返回：日志详情优先回到日志列表，再退才离开模块。 */
function handleInnerBack(): boolean {
  if (section.value === 'logs' && logInstanceId.value) {
    logInstanceId.value = ''
    return true
  }
  return false
}

onMounted(() => store.setInnerBack(handleInnerBack))
onBeforeUnmount(() => store.setInnerBack(null))

/* --------------------------------- 联机 --------------------------------- */

/** 联机服务器条目（与 store 内 Server 的形状一致）。 */
interface ServerEntry {
  id: string
  name: string
  host: string
  port?: number
}

/** 添加表单的本地状态（端口用字符串承接输入）。 */
const form = ref({ name: '', host: '', port: '' })

/** 服务器地址展示文本（端口为空时只显示主机名）。 */
function serverAddress(s: { host: string; port?: number }): string {
  return s.port ? `${s.host}:${s.port}` : s.host
}

/** 校验并保存新服务器（名称与地址必填，端口留空用默认 25565）。 */
async function handleAddServer() {
  const name = form.value.name.trim()
  const host = form.value.host.trim()
  if (!name || !host) {
    toast.warning('请填写服务器名称与地址')
    return
  }
  const parsed = Number(form.value.port)
  const port = form.value.port.trim() && Number.isFinite(parsed) ? parsed : undefined
  await store.addServer({ id: `${Date.now()}`, name, host, port })
  form.value = { name: '', host: '', port: '' }
  toast.success(`已保存服务器「${name}」`)
}

/** 删除服务器（二级锁确认，避免误删地址）。 */
async function handleRemoveServer(s: ServerEntry) {
  const ok = await confirmDialog({
    title: '删除服务器',
    message: `确定删除服务器「${s.name}」？该操作不可撤销。`,
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  await store.removeServer(s.id)
  toast.success(`已删除服务器「${s.name}」`)
}

/** 复制服务器地址到剪贴板（失败时用 toast 兜底展示）。 */
async function copyAddress(s: ServerEntry) {
  const addr = serverAddress(s)
  try {
    await navigator.clipboard.writeText(addr)
    toast.success(`已复制地址：${addr}`)
  } catch {
    toast.info(`服务器地址：${addr}`)
  }
}
</script>

<template>
  <div class="page-view active sub-page settings-page">
    <!-- ============================ 帮助文档 ============================ -->
    <template v-if="section === 'help'">
      <SettingGroup title="帮助文档" :collapsible="false" :extra="`${HELP_ENTRIES.length} 篇`">
        <div
          v-for="e in HELP_ENTRIES"
          :key="e.id"
          :class="['accordion-item help-item', openHelpId === e.id ? 'active' : '']"
          @click="toggleHelp(e.id)"
        >
          <div class="accordion-header">
            <span class="help-title">
              {{ e.title }}
              <span class="tag">{{ e.group }}</span>
            </span>
            <AlxIcon name="chevron-down" :size="16" />
          </div>
          <div class="accordion-content">
            <!-- 摘要取第一条正文段落，全文进详情副页面看 -->
            <p class="help-summary">{{ e.paragraphs[0] }}</p>
            <button type="button" class="btn-download btn-ghost help-read" @click.stop="readFull(e)">
              阅读全文
            </button>
          </div>
        </div>
      </SettingGroup>
    </template>

    <!-- ============================== 关于 ============================== -->
    <template v-else-if="section === 'about'">
      <!-- 应用概览卡：图标 + 名称 + 版本标签 -->
      <div class="about-hero">
        <div class="about-logo"><AlxIcon name="aperture" :size="44" /></div>
        <div class="about-hero-info">
          <div class="about-name">Aelux Launcher</div>
          <div class="about-desc">极简风格的 Minecraft 启动器</div>
          <div class="about-badges">
            <span class="tag">v{{ store.appVersion }}</span>
            <span class="tag">
              {{ store.coreVersion === 'preview' ? '预览模式' : `内核 v${store.coreVersion}` }}
            </span>
          </div>
        </div>
      </div>

      <SettingGroup title="软件信息" :collapsible="false">
        <div class="setting-row">
          <div class="setting-label">
            启动器版本
            <div class="setting-desc">当前正在运行的启动器版本</div>
          </div>
          <div class="setting-controls">v{{ store.appVersion }}</div>
        </div>
        <div class="setting-row">
          <div class="setting-label">
            内核版本
            <div class="setting-desc">Rust 动态库 aelux-core</div>
          </div>
          <div class="setting-controls">
            {{ store.coreVersion === 'preview' ? '预览模式（无内核）' : `v${store.coreVersion}` }}
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-label">开源协议</div>
          <div class="setting-controls">MIT License</div>
        </div>
      </SettingGroup>

      <SettingGroup title="特别鸣谢" :collapsible="false">
        <div v-for="t in THANKS" :key="t.title" class="list-item">
          <div class="item-left">
            <div class="item-icon"><AlxIcon name="star" :size="20" /></div>
            <div class="item-info">
              <div class="item-title">{{ t.title }}</div>
              <div class="item-desc">{{ t.desc }}</div>
            </div>
          </div>
          <button
            v-if="t.url"
            type="button"
            class="btn-download btn-ghost thanks-open"
            @click="openExternal(t.url)"
          >
            <AlxIcon name="external" :size="13" />
            <span>打开</span>
          </button>
        </div>
      </SettingGroup>

      <SettingGroup title="法律信息" :collapsible="false">
        <div
          :class="['accordion-item legal-item', legalOpen ? 'active' : '']"
          @click="legalOpen = !legalOpen"
        >
          <div class="accordion-header">
            <span>许可与版权声明</span>
            <AlxIcon name="chevron-down" :size="16" />
          </div>
          <div class="accordion-content">
            <p class="legal-text">
              本软件及其界面形态均为独立实现，未包含任何第三方项目的源代码或素材。
              软件按 MIT 许可证发布，你可以在保留版权声明的前提下自由使用、修改与再分发。
              软件内展示的游戏名称、图标及相关资源归各自权利人所有，本项目仅用于标识与说明用途。
            </p>
          </div>
        </div>
      </SettingGroup>
    </template>

    <!-- ============================ 反馈与建议 ============================ -->
    <template v-else-if="section === 'feedback'">
      <SettingGroup title="反馈渠道" :collapsible="false">
        <div class="list-item feedback-row">
          <div class="item-left">
            <div class="item-icon"><AlxIcon name="message-square" :size="20" /></div>
            <div class="item-info">
              <div class="item-title">GitHub Issues</div>
              <div class="item-desc">遇到问题或有功能建议？欢迎提交 Issue。</div>
            </div>
          </div>
          <button type="button" class="btn-download btn-ghost feedback-action" @click="openExternal(ISSUES_URL)">
            前往反馈
          </button>
        </div>
        <div class="list-item feedback-row">
          <div class="item-left">
            <div class="item-icon"><AlxIcon name="globe" :size="20" /></div>
            <div class="item-info">
              <div class="item-title">官方交流群</div>
              <div class="item-desc">加入官方交流群，与其他玩家交流使用技巧。</div>
            </div>
          </div>
          <button type="button" class="btn-download btn-ghost feedback-action" @click="openExternal(GROUP_URL)">
            查看群信息
          </button>
        </div>
      </SettingGroup>

      <SettingGroup title="提交前请准备" :collapsible="false">
        <div v-for="(t, i) in FEEDBACK_TIPS" :key="t.title" class="list-item feedback-row">
          <div class="item-left">
            <span class="feedback-index">{{ i + 1 }}</span>
            <div class="item-info">
              <div class="item-title">{{ t.title }}</div>
              <div class="item-desc">{{ t.desc }}</div>
            </div>
          </div>
          <button
            v-if="t.title === '相关日志文件'"
            type="button"
            class="btn-download btn-ghost feedback-action"
            @click="openLogs"
          >
            查看日志
          </button>
        </div>
      </SettingGroup>
    </template>

    <!-- ============================== 日志 ============================== -->
    <template v-else-if="section === 'logs'">
      <!-- 某个版本的日志列表 -->
      <template v-if="currentInstance">
        <SettingGroup
          :title="currentInstance.name"
          :collapsible="false"
          :extra="`${currentLogs.length} 个日志`"
        >
          <p class="setting-note">
            {{ currentInstance.version }} · {{ loaderLabel(currentInstance) }}
          </p>

          <div v-if="currentLogs.length === 0" class="empty-state log-empty">
            <AlxIcon name="file-text" :size="32" />
            <div>该版本还没有日志，启动一次游戏后就会生成。</div>
          </div>

          <div v-for="l in currentLogs" :key="l.path" class="list-item log-row">
            <div class="item-left">
              <div class="item-icon"><AlxIcon name="file-text" :size="20" /></div>
              <div class="item-info">
                <div class="item-title">{{ logTitle(l) }}</div>
                <div class="item-desc">{{ logDesc(l) }}</div>
              </div>
            </div>
            <div class="item-right">
              <button type="button" class="btn-download btn-ghost log-action" @click="openLogFolder(l)">
                打开文件夹
              </button>
              <button type="button" class="btn-download btn-ghost log-action danger" @click="deleteLog(l)">
                删除
              </button>
            </div>
          </div>
        </SettingGroup>
      </template>

      <!-- 版本列表 -->
      <template v-else>
        <SettingGroup
          title="日志"
          :collapsible="false"
          :extra="`${store.instances.length} 个版本`"
        >
          <p class="setting-note">
            按版本查看启动器与游戏生成的日志；进入后可打开所在文件夹或删除。
          </p>

          <div v-if="logsLoading" class="empty-state log-empty">
            <AlxIcon name="clock" :size="32" />
            <div>正在读取日志…</div>
          </div>

          <div v-else-if="logsError" class="empty-state log-empty">
            <AlxIcon name="alert-circle" :size="32" />
            <div>读取日志失败：{{ logsError }}</div>
            <button type="button" class="btn-download btn-ghost log-retry" @click="loadLogs">重试</button>
          </div>

          <div v-else-if="store.instances.length === 0" class="empty-state log-empty">
            <AlxIcon name="info" :size="32" />
            <div>还没有安装任何版本，安装后才能查看日志。</div>
          </div>

          <template v-else>
            <div
              v-for="i in store.instances"
              :key="i.id"
              class="list-item list-clickable log-instance-row"
              @click="logInstanceId = i.id"
            >
              <div class="item-left">
                <div class="item-icon">
                  <img v-if="loaderIconSrc(i)" :src="loaderIconSrc(i) || ''" width="20" height="20" alt="" />
                  <AlxIcon v-else :name="loaderIcon(i)" :size="20" />
                </div>
                <div class="item-info">
                  <div class="item-title">{{ i.name }}</div>
                  <div class="item-desc">{{ i.version }} · {{ loaderLabel(i) }}</div>
                </div>
              </div>
              <div class="item-right">
                <span class="tag">{{ logCount(i.id) }} 个日志</span>
                <AlxIcon name="chevron-right" :size="16" class="log-chevron" />
              </div>
            </div>
          </template>
        </SettingGroup>
      </template>
    </template>

    <!-- ============================== 联机 ============================== -->
    <template v-else>
      <!-- 社区联机暂未开放提示 -->
      <div class="online-notice">
        <div class="online-notice-icon"><AlxIcon name="globe" :size="22" /></div>
        <div class="online-notice-info">
          <div class="online-notice-title">社区联机暂未开放</div>
          <div class="online-notice-desc">
            当前版本暂不支持社区联机匹配。你仍然可以保存常用服务器地址，进入游戏后直接连接。
          </div>
        </div>
        <span class="tag">开发中</span>
      </div>

      <SettingGroup
        title="已保存服务器"
        :collapsible="false"
        :extra="`${store.servers.length} 个`"
      >
        <div v-if="store.servers.length === 0" class="empty-state server-empty">
          <AlxIcon name="globe" :size="28" />
          <div>还没有保存任何服务器，在下方添加一个吧。</div>
        </div>
        <div v-for="s in store.servers" :key="s.id" class="list-item server-row">
          <div class="item-left">
            <div class="item-icon"><AlxIcon name="globe" :size="20" /></div>
            <div class="item-info">
              <div class="item-title">{{ s.name }}</div>
              <div class="item-desc">{{ serverAddress(s) }}</div>
            </div>
          </div>
          <div class="item-right">
            <button type="button" class="btn-download btn-ghost server-action" @click="copyAddress(s)">
              复制地址
            </button>
            <button type="button" class="btn-download btn-ghost server-action" @click="handleRemoveServer(s)">
              删除
            </button>
          </div>
        </div>
      </SettingGroup>

      <SettingGroup title="添加服务器" :collapsible="false">
        <div class="setting-row">
          <div class="setting-label">名称</div>
          <input v-model="form.name" class="setting-input" type="text" placeholder="我的服务器" />
        </div>
        <div class="setting-row">
          <div class="setting-label">地址</div>
          <input v-model="form.host" class="setting-input" type="text" placeholder="mc.example.com" />
        </div>
        <div class="setting-row">
          <div class="setting-label">
            端口
            <div class="setting-desc">留空时使用默认端口 25565</div>
          </div>
          <input v-model="form.port" class="setting-input" type="text" placeholder="25565" />
        </div>
        <div class="setting-row">
          <div class="setting-label">
            保存
            <div class="setting-desc">保存后会出现在上方服务器列表</div>
          </div>
          <button type="button" class="btn-download server-action" @click="handleAddServer">保存</button>
        </div>
      </SettingGroup>
    </template>
  </div>
</template>

<style scoped>
/* ------------------------------ 帮助文档 ------------------------------ */
.help-item {
  border-radius: 0;
}
.help-item + .help-item {
  border-top: 1px solid var(--border-light);
}
.help-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.help-summary {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-sub);
}
.help-read {
  height: 32px;
}

/* -------------------------------- 关于 -------------------------------- */
.about-hero {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  margin-bottom: 16px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-color);
}
.about-logo {
  width: 64px;
  height: 64px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: var(--icon-bg);
  color: var(--text-main);
}
.about-hero-info {
  min-width: 0;
}
.about-name {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-main);
}
.about-desc {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-sub);
}
.about-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.thanks-open {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
}
.legal-item {
  border-radius: 0;
}
.legal-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-sub);
}

/* ------------------------------ 反馈与建议 ------------------------------ */
.feedback-row {
  padding: 12px 16px;
}
.feedback-index {
  width: 24px;
  height: 24px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--icon-bg);
  color: var(--text-sub);
  font-size: 12px;
  font-weight: 600;
}
.feedback-action {
  height: 32px;
  flex: none;
}

/* -------------------------------- 日志 -------------------------------- */
.log-instance-row {
  padding: 10px 16px;
}
.log-row {
  padding: 10px 16px;
}
.log-action {
  height: 32px;
}
.log-action.danger {
  color: #e5484d;
}
.log-chevron {
  color: var(--text-sub);
  flex: none;
}
.log-empty {
  padding: 48px 0;
}
.log-retry {
  height: 32px;
  margin-top: 12px;
}

/* -------------------------------- 联机 -------------------------------- */
.online-notice {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  margin-bottom: 16px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--icon-bg);
}
.online-notice-icon {
  width: 36px;
  height: 36px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: var(--bg-color);
  color: var(--text-main);
}
.online-notice-info {
  flex: 1;
  min-width: 0;
}
.online-notice-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
}
.online-notice-desc {
  margin-top: 5px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-sub);
}
.server-empty {
  padding: 40px 0;
}
.server-row {
  padding: 12px 16px;
}
.server-action {
  height: 32px;
}
</style>
