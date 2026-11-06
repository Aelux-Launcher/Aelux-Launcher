<script setup lang="ts">
/**
 * 自动安装（参考 PCL 的实例管理 · 自动安装页）：
 * 顶部一行「从本地文件安装/升级」，下方按加载器列出安装状态 ——
 * 已安装显示版本号（可卸载 / 更换版本），未安装显示「未安装」，
 * 与当前加载器互斥的显示「与 X 不兼容」。
 *
 * 当前实例的加载器来自实例元数据；安装 / 卸载需要内核安装器，
 * 尚未接入时只完成界面流程（与其它管理面板一致）。
 */
import { computed } from 'vue'
import { toast } from '../../lib/toast'
import { confirmDialog } from '../../lib/dialog'
import type { GameInstance } from '../../lib/types'
import AlxIcon from '../../components/AlxIcon.vue'

const props = defineProps<{ instance: GameInstance }>()

/** 加载器清单行。 */
interface LoaderEntry {
  key: string
  label: string
  icon: string
}

/** 与当前加载器互斥的加载器（用于显示「与 X 不兼容」）。 */
const CONFLICTS: Record<string, string[]> = {
  fabric: ['forge', 'neoforge', 'liteloader', 'optifine', 'quilt', 'legacyfabric'],
  quilt: ['fabric', 'forge', 'neoforge', 'liteloader', 'optifine', 'legacyfabric'],
  forge: ['fabric', 'quilt', 'legacyfabric', 'neoforge'],
  neoforge: ['fabric', 'quilt', 'legacyfabric', 'forge', 'liteloader'],
  optifine: ['fabric', 'quilt', 'legacyfabric'],
  liteloader: ['fabric', 'quilt', 'legacyfabric', 'neoforge'],
  vanilla: [],
}

/** 自动安装列表（游戏本体 + 各加载器）。 */
const LOADERS: LoaderEntry[] = [
  { key: 'minecraft', label: 'Minecraft', icon: 'minecraft' },
  { key: 'forge', label: 'Forge', icon: 'forge' },
  { key: 'neoforge', label: 'NeoForge', icon: 'neoforge' },
  { key: 'liteloader', label: 'LiteLoader', icon: 'zap' },
  { key: 'optifine', label: 'OptiFine', icon: 'optifine' },
  { key: 'fabric', label: 'Fabric', icon: 'fabric' },
  { key: 'quilt', label: 'Quilt', icon: 'quilt' },
  { key: 'legacyfabric', label: 'Legacy Fabric', icon: 'fabric' },
]

/** 当前实例使用的加载器（空 / vanilla 视为原版）。 */
const currentLoader = computed(() => props.instance.loader || 'vanilla')

/** 当前加载器的显示名（用于「与 X 不兼容」文案）。 */
const currentLabel = computed(
  () => LOADERS.find((l) => l.key === currentLoader.value)?.label ?? '原版',
)

/** 列表行：已安装显示版本号，未安装可装的显示「未安装」，互相冲突的显示说明。 */
const rows = computed(() =>
  LOADERS.map((l) => {
    const installed = l.key === 'minecraft' || l.key === currentLoader.value
    const conflict = !installed && (CONFLICTS[currentLoader.value]?.includes(l.key) ?? false)
    let state = '未安装'
    if (installed) {
      state =
        l.key === 'minecraft'
          ? props.instance.version
          : props.instance.loaderVersion || '已安装'
    } else if (conflict) {
      state = `与 ${currentLabel.value} 不兼容`
    }
    return { ...l, installed, conflict, state }
  }),
)

/** 从本地文件安装 / 升级：文件选择已接入，安装流程待内核安装器。 */
async function installFromFile() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const picked = await open({
      multiple: false,
      filters: [{ name: '加载器安装包', extensions: ['jar', 'zip'] }],
    })
    if (!picked) return
    toast.info('已选择安装包，安装流程将在内核安装器接入后开放')
  } catch (e) {
    toast.warning(`选择文件失败：${(e as Error).message}`)
  }
}

/** 安装尚未安装的加载器。 */
function installLoader(row: LoaderEntry) {
  toast.info(`安装 ${row.label} 需要内核安装器支持，当前仅完成界面流程`)
}

/** 更换 / 升级已安装的加载器版本。 */
function changeLoader(row: LoaderEntry) {
  toast.info(`更换 ${row.label} 版本需要内核安装器支持，当前仅完成界面流程`)
}

/** 卸载加载器（二次确认）。 */
async function uninstallLoader(row: LoaderEntry) {
  const ok = await confirmDialog({
    title: `卸载 ${row.label}`,
    message: `确定卸载 ${row.label}？该版本对应的加载器文件将被移除。`,
    confirmText: '卸载',
    danger: true,
  })
  if (!ok) return
  toast.info(`${row.label} 的卸载需要内核安装器支持，当前仅完成界面流程`)
}
</script>

<template>
  <div class="setting-group">
    <!-- 从本地文件安装 / 升级 -->
    <button type="button" class="install-local" @click="installFromFile">
      <AlxIcon name="plus" :size="18" />
      <span>从本地文件安装/升级</span>
    </button>

    <!-- 加载器列表 -->
    <div v-for="row in rows" :key="row.key" class="install-row">
      <div class="install-icon"><AlxIcon :name="row.icon" :size="22" /></div>
      <span class="install-name">{{ row.label }}</span>
      <span :class="['install-state', !row.installed && 'muted']">{{ row.state }}</span>
      <div class="install-actions">
        <button
          v-if="!row.installed && !row.conflict"
          type="button"
          class="icon-btn"
          :title="`安装 ${row.label}`"
          @click="installLoader(row)"
        >
          <AlxIcon name="plus" :size="16" />
        </button>
        <template v-else-if="row.installed">
          <button
            v-if="row.key !== 'minecraft'"
            type="button"
            class="icon-btn"
            :title="`卸载 ${row.label}`"
            @click="uninstallLoader(row)"
          >
            <AlxIcon name="x" :size="16" />
          </button>
          <button
            type="button"
            class="icon-btn"
            :title="`更换 ${row.label} 版本`"
            @click="changeLoader(row)"
          >
            <AlxIcon name="refresh" :size="16" />
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
