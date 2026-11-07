<script setup lang="ts">
/**
 * 更多模块（与设置页同一套卡片语言）：
 *   侧栏分组由 SideNav 负责（帮助 / 关于 / 反馈 / 日志 / 联机），
 *   这里按 URL 参数 sec 渲染对应分节内容：
 *     help     —— 帮助文档（单张卡片，折叠条目，阅读全文进入详情副页面）
 *     about    —— 关于（软件信息 / 特别鸣谢 / 法律信息）
 *     feedback —— 反馈与建议（GitHub Issues / 官方交流群 / 提交前准备）
 *     logs     —— 日志（按版本分组的日志文件，可打开所在文件夹或删除）
 *     online   —— 联机（服务器广场 + 右下角加号创建房间）
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { call } from '../lib/bridge'
import { confirmDialog } from '../lib/dialog'
import { toast } from '../lib/toast'
import AlxIcon from '../components/AlxIcon.vue'
import AlxModal from '../components/AlxModal.vue'
import AlxSelect from '../components/AlxSelect.vue'
import AlxToggle from '../components/AlxToggle.vue'
import SettingGroup from '../components/SettingGroup.vue'
import type { IconName } from '../components/icons'
import { loaderIconUrl } from '../lib/loaderIcons'
import type { GameInstance } from '../lib/types'
import { useAppStore, type MultiplayerRoom } from '../stores/app'
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

/** 按条目的 group 字段分组（保持 HELP_ENTRIES 里的出现顺序）。 */
const helpGroups = computed(() => {
  const groups: Array<{ title: string; items: HelpEntry[] }> = []
  const index = new Map<string, number>()
  for (const e of HELP_ENTRIES) {
    let i = index.get(e.group)
    if (i === undefined) {
      i = groups.length
      index.set(e.group, i)
      groups.push({ title: e.group, items: [] })
    }
    groups[i].items.push(e)
  }
  return groups
})

/** 进入帮助详情副页面（顶栏切换为「← 返回 + 条目标题」）。 */
function readFull(e: HelpEntry) {
  store.openSubPage({ kind: 'help', entryId: e.id, title: e.title })
}

/* --------------------------------- 关于 --------------------------------- */

/** 特别鸣谢：启动器实际使用的项目与数据来源。 */
const THANKS: Array<{ title: string; desc: string; url: string; icon: IconName }> = [
  { title: 'Mojang', desc: '提供 Minecraft 版本清单与游戏资源', url: 'https://www.minecraft.net', icon: 'minecraft' },
  { title: 'BMCLAPI', desc: '提供 Forge / OptiFine 版本清单的镜像加速', url: 'https://bmclapi2.bangbang93.com', icon: 'server' },
  { title: 'FabricMC', desc: '提供 Fabric 加载器与安装器元数据', url: 'https://fabricmc.net', icon: 'fabric' },
  { title: 'NeoForge / Forge', desc: '提供 NeoForge 与 Forge 加载器元数据', url: 'https://neoforged.net', icon: 'neoforge' },
  { title: 'Modrinth', desc: '提供 Mod / 资源包的项目与版本数据', url: 'https://modrinth.com', icon: 'package' },
  { title: 'Adoptium', desc: '提供 Java 运行时的下载源', url: 'https://adoptium.net', icon: 'coffee' },
  { title: 'authlib-injector', desc: '提供外置登录与皮肤支持', url: 'https://github.com/yushijinhun/authlib-injector', icon: 'key' },
  { title: 'Vue / Tauri', desc: '提供界面框架与桌面运行时', url: 'https://v2.tauri.app', icon: 'code' },
]

/** 法律信息折叠面板展开态。 */
const legalOpen = ref(false)

/** 版权起始年份；当前年份大于起始年份时显示区间。 */
const COPYRIGHT_START = 2026
const copyrightYears = computed(() => {
  const year = new Date().getFullYear()
  return year > COPYRIGHT_START ? `${COPYRIGHT_START} - ${year}` : `${COPYRIGHT_START}`
})

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

/** 可选联机节点（ping 为模拟检测值，默认选延迟最低的节点）。 */
interface NodeOption {
  id: string
  label: string
  host: string
  ping: number
}

const NODES: NodeOption[] = [
  { id: 'sh', label: '上海节点', host: 'sh.aelux.app', ping: 18 },
  { id: 'bj', label: '北京节点', host: 'bj.aelux.app', ping: 32 },
  { id: 'gz', label: '广州节点', host: 'gz.aelux.app', ping: 45 },
  { id: 'hk', label: '香港节点', host: 'hk.aelux.app', ping: 62 },
]

/** 延迟最低的节点（自动检测后默认选中）。 */
const bestNode = computed(() => NODES.reduce((a, b) => (a.ping <= b.ping ? a : b)))

/** 节点下拉选项（标注推荐节点）。 */
const nodeOptions = computed(() =>
  NODES.map((n) => ({
    value: n.id,
    label: `${n.label} · ${n.ping} ms${n.id === bestNode.value.id ? '（推荐）' : ''}`,
  })),
)

/** 自己创建的房间（最多一个）。 */
const mineRoom = computed<MultiplayerRoom | null>(
  () => store.rooms.find((r) => r.mine) ?? null,
)

/** 创建服务器弹窗与表单状态。 */
const roomModalOpen = ref(false)
const roomPort = ref(0)
const roomForm = ref({
  name: '',
  nodeId: '',
  passwordEnabled: false,
  password: '',
  persist: false,
})

/** 打开创建服务器弹窗（每次重新检测节点并生成随机端口）。 */
function openRoomModal() {
  if (store.rooms.some((r) => r.mine)) {
    toast.info('只能创建一个服务器，请先删除现有房间')
    return
  }
  roomPort.value = 30000 + Math.floor(Math.random() * 10000)
  roomForm.value = {
    name: '',
    nodeId: bestNode.value.id,
    passwordEnabled: false,
    password: '',
    persist: false,
  }
  roomModalOpen.value = true
}

/** 创建服务器（公开房 / 密码房）。 */
async function submitRoom() {
  const name = roomForm.value.name.trim()
  if (!name) {
    toast.warning('请填写服务器名称')
    return
  }
  if (roomForm.value.passwordEnabled && !roomForm.value.password.trim()) {
    toast.warning('请输入房间密码')
    return
  }
  const node = NODES.find((n) => n.id === roomForm.value.nodeId) ?? bestNode.value
  try {
    await store.createRoom({
      name,
      nodeId: node.id,
      nodeLabel: node.label,
      host: node.host,
      port: roomPort.value,
      password: roomForm.value.passwordEnabled ? roomForm.value.password.trim() : '',
      persist: roomForm.value.persist,
    })
    roomModalOpen.value = false
    toast.success(`已创建服务器「${name}」`)
  } catch (e) {
    toast.error((e as Error).message)
  }
}

/** 删除自己的服务器（二级锁确认）。 */
async function handleRemoveRoom(r: MultiplayerRoom) {
  const ok = await confirmDialog({
    title: '删除服务器',
    message: `确定删除服务器「${r.name}」？该操作不可撤销。`,
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  await store.removeRoom(r.id)
  toast.success(`已删除服务器「${r.name}」`)
}

/** 切换自己的房间「退出不消失」（保留 3 天，启动后重新计时）。 */
async function toggleMinePersist(value: boolean) {
  const r = mineRoom.value
  if (!r) return
  await store.setRoomPersist(r.id, value)
  toast.success(
    value ? '已开启保留，房间将在 3 天内有效' : '已关闭保留，退出启动器后房间会销毁',
  )
}

/** 房间地址展示。 */
function roomAddress(r: MultiplayerRoom): string {
  return `${r.host}:${r.port}`
}

/** 保留到期时间展示。 */
function formatExpiry(ms: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 加入他人房间（社区联机尚未开放）。 */
function joinRoom(r: MultiplayerRoom) {
  toast.info(`「${r.name}」暂时无法加入，社区联机功能尚未开放`)
}
</script>

<template>
  <div class="page-view active sub-page settings-page">
    <!-- ============================ 帮助文档 ============================ -->
    <template v-if="section === 'help'">
      <SettingGroup
        v-for="g in helpGroups"
        :key="g.title"
        :title="g.title"
      >
        <div
          v-for="e in g.items"
          :key="e.id"
          class="list-item list-clickable help-row"
          @click="readFull(e)"
        >
          <div class="item-left">
            <div class="item-icon"><AlxIcon :name="e.icon" :size="20" /></div>
            <div class="item-info">
              <div class="item-title">{{ e.title }}</div>
              <div class="item-desc help-desc">{{ e.paragraphs[0] }}</div>
            </div>
          </div>
          <AlxIcon name="chevron-right" :size="16" class="help-chevron" />
        </div>
      </SettingGroup>
    </template>

    <!-- ============================== 关于 ============================== -->
    <template v-else-if="section === 'about'">
      <!-- 应用概览卡：图标 + 名称 + 版本标签 -->
      <div class="about-hero">
        <div class="about-logo"><img src="/favicon.svg" width="44" height="44" alt="Aelux" /></div>
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
            <div class="item-icon"><AlxIcon :name="t.icon" :size="20" /></div>
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
        <div class="setting-row">
          <div class="setting-label">
            版权所有
            <div class="setting-desc">版权署名不影响 MIT 许可证授予的使用、修改与再分发权利。</div>
          </div>
          <div class="setting-controls copyright-text">
            © {{ copyrightYears }} Re0XIAOPA / 阿Mao嚯嚯及贡献者
          </div>
        </div>
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
            <p class="legal-text">
              版权所有 © {{ copyrightYears }} Re0XIAOPA / 阿Mao嚯嚯及贡献者。
              版权署名与 MIT 许可证并不冲突：MIT 许可证允许商业使用、修改与再分发，
              仅要求在所有副本或实质性部分中保留上述版权声明与许可声明。
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
            <div class="item-icon"><AlxIcon name="github" :size="20" /></div>
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
            <div class="item-icon"><AlxIcon name="qq" :size="20" /></div>
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
            服务器广场用于展示公开房间；当前版本暂不支持加入他人房间，创建后可自行进入游戏连接。
          </div>
        </div>
        <span class="tag">开发中</span>
      </div>

      <SettingGroup
        title="服务器广场"
        :collapsible="false"
        :extra="`${store.rooms.length} 个房间`"
      >
        <div v-if="store.rooms.length === 0" class="empty-state server-empty">
          <AlxIcon name="globe" :size="28" />
          <div>广场还空着，点击右下角的加号创建一个服务器吧。</div>
        </div>

        <div
          v-for="r in store.rooms"
          :key="r.id"
          :class="['list-item', 'server-row', r.mine ? 'server-mine' : '']"
        >
          <div class="item-left">
            <div class="item-icon"><AlxIcon :name="r.mine ? 'server' : 'globe'" :size="20" /></div>
            <div class="item-info">
              <div class="item-title server-title">
                <span class="server-name">{{ r.name }}</span>
                <span v-if="r.mine" class="tag">我的服务器</span>
                <span v-if="r.password" class="tag">密码房</span>
              </div>
              <div class="item-desc">{{ r.nodeLabel }} · {{ roomAddress(r) }}</div>
              <div v-if="r.mine && r.persist" class="server-expiry">
                保留至 {{ formatExpiry(r.expiresAt) }}
              </div>
            </div>
          </div>
          <div class="item-right">
            <button type="button" class="btn-download btn-ghost server-action" @click="joinRoom(r)">
              {{ r.mine ? '进入房间' : '加入' }}
            </button>
            <button
              v-if="r.mine"
              type="button"
              class="btn-download btn-ghost server-action danger"
              @click="handleRemoveRoom(r)"
            >
              删除
            </button>
          </div>
        </div>

        <!-- 自己房间的保留设置 -->
        <div v-if="mineRoom" class="server-persist-row">
          <div class="server-persist-info">
            <div class="item-title">退出不消失</div>
            <div class="item-desc">
              开启后退出启动器仍保留房间，最多 3 天；期间再次启动会重新计时。
            </div>
          </div>
          <AlxToggle :model-value="mineRoom.persist" @update:model-value="toggleMinePersist" />
        </div>
      </SettingGroup>

      <!-- 右下角圆形加号：打开创建服务器弹窗 -->
      <button type="button" class="mp-fab" title="添加服务器" @click="openRoomModal">
        <AlxIcon name="plus" :size="22" />
      </button>

      <AlxModal :open="roomModalOpen" title="添加服务器" @close="roomModalOpen = false">
        <div class="mp-form">
          <div class="mp-field">
            <label class="mp-label">名称</label>
            <input
              v-model="roomForm.name"
              class="setting-input"
              type="text"
              placeholder="我的服务器"
            />
          </div>

          <div class="mp-grid">
            <div class="mp-field">
              <label class="mp-label">服务器节点</label>
              <AlxSelect v-model="roomForm.nodeId" :options="nodeOptions" />
            </div>
            <div class="mp-field">
              <label class="mp-label">端口</label>
              <div class="mp-port">{{ roomPort }}</div>
            </div>
          </div>
          <div class="mp-hint">节点已自动检测延迟并默认选中网络最优；端口由系统随机分配。</div>

          <div class="mp-switch-row">
            <div class="mp-switch-info">
              <div class="item-title">密码房</div>
              <div class="item-desc">开启后加入房间需要输入密码。</div>
            </div>
            <AlxToggle v-model="roomForm.passwordEnabled" />
          </div>
          <input
            v-if="roomForm.passwordEnabled"
            v-model="roomForm.password"
            class="setting-input mp-password"
            type="password"
            placeholder="设置房间密码"
          />

          <div class="mp-switch-row">
            <div class="mp-switch-info">
              <div class="item-title">退出不消失</div>
              <div class="item-desc">退出后保留房间，最多 3 天，再次启动会重新计时。</div>
            </div>
            <AlxToggle v-model="roomForm.persist" />
          </div>
        </div>

        <template #actions>
          <button type="button" class="btn-download btn-ghost" @click="roomModalOpen = false">
            取消
          </button>
          <button type="button" class="btn-download" @click="submitRoom">创建</button>
        </template>
      </AlxModal>
    </template>
  </div>
</template>

<style scoped>
/* ------------------------------ 帮助文档 ------------------------------ */
.help-row {
  padding: 10px 16px;
}
.help-desc {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.help-chevron {
  flex: none;
  color: var(--text-sub);
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
.legal-text + .legal-text {
  margin-top: 10px;
}
.copyright-text {
  text-align: right;
  font-size: 13px;
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
.server-mine {
  background: var(--hover-bg);
}
.server-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.server-name {
  font-weight: 600;
}
.server-expiry {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-sub);
}
.server-action {
  height: 32px;
}
.server-action.danger {
  color: #e5484d;
}
.server-persist-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-light);
}
.server-persist-info {
  min-width: 0;
}

/* 右下角圆形加号 */
.mp-fab {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 40;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-light);
  border-radius: 50%;
  background: var(--bg-color);
  color: var(--text-main);
  cursor: pointer;
  box-shadow: 0 6px 18px rgb(0 0 0 / 18%);
  transition: transform 0.15s ease, background 0.15s ease;
}
.mp-fab:hover {
  background: var(--hover-bg);
  transform: scale(1.06);
}

/* 创建服务器弹窗（紧凑布局，避免弹窗过高） */
.mp-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: min(58vh, 420px);
  overflow-y: auto;
  padding-right: 4px;
}
.mp-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: 12px;
}
.mp-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.mp-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}
.mp-hint {
  margin-top: -4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-sub);
}
.mp-port {
  padding: 8px 12px;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  background: var(--icon-bg);
  color: var(--text-main);
  font-size: 14px;
  letter-spacing: 0.5px;
}
.mp-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 0;
  border-top: 1px solid var(--border-light);
}
.mp-switch-info {
  min-width: 0;
}
.mp-password {
  margin-top: -4px;
}
</style>
