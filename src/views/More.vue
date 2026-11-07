<script setup lang="ts">
/**
 * 更多模块（极简黑白版）：
 *   侧栏分组由 SideNav 负责（帮助 / 关于 / 反馈 / 联机），
 *   这里按 URL 参数 sec 渲染对应分节内容：
 *     help     —— 帮助文档（折叠条目，点击「阅读全文」进入详情副页面）
 *     about    —— 关于（软件信息 / 特别鸣谢 / 法律信息）
 *     feedback —— 反馈与建议（GitHub Issues / 官方交流群）
 *     online   —— 联机（服务器列表 + 添加表单，内联旧 Multiplayer 功能）
 */
import { computed, ref } from 'vue'
import { useAppStore } from '../stores/app'
import { call } from '../lib/bridge'
import { confirmDialog } from '../lib/dialog'
import { toast } from '../lib/toast'
import AlxIcon from '../components/AlxIcon.vue'
import PageHeader from '../components/PageHeader.vue'
import { HELP_ENTRIES, type HelpEntry } from './helpEntries'

type Section = 'help' | 'about' | 'feedback' | 'online'

const props = defineProps<{ sec: string }>()

const store = useAppStore()

/** 当前分节（非法值回落到帮助）。 */
const section = computed<Section>(() =>
  (['help', 'about', 'feedback', 'online'] as const).includes(props.sec as Section)
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

/** 打开外部网页（统一走内核 open_external，失败给出提示）。 */
async function openExternal(url: string) {
  try {
    await call('open_external', { url })
  } catch (e) {
    toast.error(`无法打开网页：${(e as Error).message}`)
  }
}

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
  <div class="page-view active sub-page">
    <!-- ============================ 帮助文档 ============================ -->
    <template v-if="section === 'help'">
      <PageHeader title="帮助文档" />

      <div v-for="g in helpGroups" :key="g.title" class="setting-group help-group">
        <div class="setting-group-title">
          <span>{{ g.title }}</span>
          <span class="tag">{{ g.items.length }} 篇</span>
        </div>
        <div class="help-group-body">
          <div
            v-for="e in g.items"
            :key="e.id"
            :class="['accordion-item help-item', openHelpId === e.id ? 'active' : '']"
            @click="toggleHelp(e.id)"
          >
            <div class="accordion-header">
              <span>{{ e.title }}</span>
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
        </div>
      </div>
    </template>

    <!-- ============================== 关于 ============================== -->
    <template v-else-if="section === 'about'">
      <PageHeader title="关于" />

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

      <div class="setting-group">
        <div class="setting-group-title">软件信息</div>
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
      </div>

      <div class="setting-group">
        <div class="setting-group-title">特别鸣谢</div>
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
      </div>

      <div class="setting-group">
        <div class="setting-group-title">法律信息</div>
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
      </div>
    </template>

    <!-- ============================ 反馈与建议 ============================ -->
    <template v-else-if="section === 'feedback'">
      <PageHeader title="反馈与建议" />

      <div class="setting-group">
        <div class="setting-group-title">反馈渠道</div>
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
      </div>

      <div class="setting-group">
        <div class="setting-group-title">提交前请准备</div>
        <div class="feedback-tip">启动器版本号（可在「关于」页查看）</div>
        <div class="feedback-tip">问题复现步骤，必要时附上截图</div>
        <div class="feedback-tip">相关日志文件，便于快速定位问题</div>
      </div>
    </template>

    <!-- ============================== 联机 ============================== -->
    <template v-else>
      <PageHeader title="联机" />

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

      <div class="setting-group">
        <div class="setting-group-title">
          <span>已保存服务器</span>
          <span class="tag">{{ store.servers.length }}</span>
        </div>
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
      </div>

      <div class="setting-group">
        <div class="setting-group-title">添加服务器</div>
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
      </div>
    </template>
  </div>
</template>

<style scoped>
/* ------------------------------ 帮助文档 ------------------------------ */
.help-group-body {
  padding-bottom: 4px;
}
/* 卡片内的条目用分隔线代替悬浮圆角块，视觉更整齐 */
.help-group-body .help-item {
  margin: 0;
  border-radius: 0;
  border-top: 1px solid var(--border-light);
}
.help-group-body .help-item:first-child {
  border-top: none;
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
  margin: 0;
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
.feedback-action {
  height: 32px;
  flex: none;
}
.feedback-tip {
  position: relative;
  padding: 8px 16px 8px 30px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-sub);
}
.feedback-tip::before {
  content: '';
  position: absolute;
  left: 16px;
  top: 15px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--text-sub);
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
