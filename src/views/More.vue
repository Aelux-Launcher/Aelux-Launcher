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

/** 删除服务器（store 会同步持久化）。 */
async function handleRemoveServer(s: ServerEntry) {
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

      <template v-for="g in helpGroups" :key="g.title">
        <div class="section-title">{{ g.title }}</div>
        <div
          v-for="e in g.items"
          :key="e.id"
          :class="['accordion-item', openHelpId === e.id ? 'active' : '']"
          @click="toggleHelp(e.id)"
        >
          <div class="accordion-header">
            <span>{{ e.title }}</span>
            <AlxIcon name="chevron-down" :size="16" />
          </div>
          <div class="accordion-content">
            <!-- 摘要取第一条正文段落，全文进详情副页面看 -->
            <p style="margin: 0 0 12px">{{ e.paragraphs[0] }}</p>
            <button type="button" class="btn-download btn-ghost" @click.stop="readFull(e)">
              阅读全文
            </button>
          </div>
        </div>
      </template>
    </template>

    <!-- ============================== 关于 ============================== -->
    <template v-else-if="section === 'about'">
      <PageHeader title="关于" />

      <div class="section-title">软件信息</div>
      <div class="list-item">
        <div class="item-left">
          <div class="item-icon"><AlxIcon name="aperture" :size="20" /></div>
          <div class="item-info">
            <div class="item-title">Aelux Launcher</div>
            <div class="item-desc">极简风格的 Minecraft 启动器</div>
          </div>
        </div>
      </div>
      <div class="list-item">
        <div class="item-left">
          <div class="item-icon"><AlxIcon name="code" :size="20" /></div>
          <div class="item-info">
            <div class="item-title">启动器版本</div>
            <div class="item-desc">v{{ store.appVersion }}</div>
          </div>
        </div>
        <span class="tag">测试版</span>
      </div>
      <div class="list-item">
        <div class="item-left">
          <div class="item-icon"><AlxIcon name="package" :size="20" /></div>
          <div class="item-info">
            <div class="item-title">内核版本</div>
            <div class="item-desc">
              {{ store.coreVersion === 'preview' ? '预览模式（无内核）' : `aelux-core v${store.coreVersion}` }}
            </div>
          </div>
        </div>
        <span class="tag">动态库</span>
      </div>
      <div class="list-item">
        <div class="item-left">
          <div class="item-icon"><AlxIcon name="info" :size="20" /></div>
          <div class="item-info">
            <div class="item-title">开源协议</div>
            <div class="item-desc">MIT License</div>
          </div>
        </div>
      </div>

      <div class="section-title">特别鸣谢</div>
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
          class="btn-download btn-ghost"
          @click="openExternal(t.url)"
        >
          打开
        </button>
      </div>

      <div class="section-title">法律信息</div>
      <div :class="['accordion-item', legalOpen ? 'active' : '']" @click="legalOpen = !legalOpen">
        <div class="accordion-header">
          <span>许可与版权声明</span>
          <AlxIcon name="chevron-down" :size="16" />
        </div>
        <div class="accordion-content">
          <p style="margin: 0">
            本软件及其界面形态均为独立实现，未包含任何第三方项目的源代码或素材。
            软件按 MIT 许可证发布，你可以在保留版权声明的前提下自由使用、修改与再分发。
            软件内展示的游戏名称、图标及相关资源归各自权利人所有，本项目仅用于标识与说明用途。
          </p>
        </div>
      </div>
    </template>

    <!-- ============================ 反馈与建议 ============================ -->
    <template v-else-if="section === 'feedback'">
      <PageHeader title="反馈与建议" />

      <div class="setting-group">
        <div class="setting-group-title">反馈</div>
        <div class="setting-row">
          <div class="setting-label">
            GitHub Issues
            <div class="setting-desc">
              遇到问题或有功能建议？欢迎提交 Issue，反馈时请附上启动器版本号与复现步骤。
            </div>
          </div>
          <button type="button" class="btn-download btn-ghost" @click="openExternal(ISSUES_URL)">
            前往反馈
          </button>
        </div>
        <div class="setting-row">
          <div class="setting-label">
            官方交流群
            <div class="setting-desc">加入官方交流群，与其他玩家交流使用技巧。</div>
          </div>
          <button type="button" class="btn-download btn-ghost" @click="openExternal(GROUP_URL)">
            查看群信息
          </button>
        </div>
      </div>
    </template>

    <!-- ============================== 联机 ============================== -->
    <template v-else>
      <PageHeader title="联机" />

      <div class="section-title">服务器列表</div>
      <div v-if="store.servers.length === 0" class="empty-state">
        <AlxIcon name="globe" :size="32" />
        <div>还没有保存任何服务器，在下方添加一个吧。</div>
      </div>
      <template v-else>
        <div v-for="s in store.servers" :key="s.id" class="list-item">
          <div class="item-left">
            <div class="item-icon"><AlxIcon name="globe" :size="20" /></div>
            <div class="item-info">
              <div class="item-title">{{ s.name }}</div>
              <div class="item-desc">{{ serverAddress(s) }}</div>
            </div>
          </div>
          <div class="item-right">
            <button type="button" class="btn-download btn-ghost" @click="copyAddress(s)">
              复制地址
            </button>
            <button type="button" class="btn-download btn-ghost" @click="handleRemoveServer(s)">
              删除
            </button>
          </div>
        </div>
      </template>

      <div class="section-title">添加服务器</div>
      <div class="setting-group">
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
          <button type="button" class="btn-download" @click="handleAddServer">保存</button>
        </div>
      </div>
    </template>
  </div>
</template>
