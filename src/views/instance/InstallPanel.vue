<script setup lang="ts">
/**
 * 自动安装（参考 PCL 的实例管理 · 自动安装页）：
 * 顶部「从本地文件安装/升级」，下方按加载器列出安装状态 ——
 * 已安装显示版本号（可卸载 / 更换版本），未安装显示「未安装」，
 * 与当前加载器互斥的显示「与 X 不兼容」。
 *
 * 安装 / 更换 / 卸载全部走内核 `set_instance_loader`：
 *   · 更换 = 安装新加载器并回写实例元数据
 *   · 卸载 = 切回 vanilla（保留游戏本体）
 */
import { computed, ref } from 'vue'
import { toast } from '../../lib/toast'
import { confirmDialog } from '../../lib/dialog'
import { call } from '../../lib/bridge'
import { useAppStore } from '../../stores/app'
import type { GameInstance, InstallResult } from '../../lib/types'
import AlxIcon from '../../components/AlxIcon.vue'
import AlxModal from '../../components/AlxModal.vue'

const props = defineProps<{ instance: GameInstance }>()

const store = useAppStore()

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

/** 正在安装的加载器（按钮禁用 + 状态提示）。 */
const busy = ref<string | null>(null)

/** 版本选择弹窗：加载器 + 可选版本列表。 */
const picker = ref<{ loader: LoaderEntry; versions: string[]; loading: boolean } | null>(null)

/** 列表行：已安装显示版本号，未安装可装的显示「未安装」，互相冲突的显示说明。 */
const rows = computed(() =>
  LOADERS.map((l) => {
    const installed = l.key === 'minecraft' || l.key === currentLoader.value
    const conflict = !installed && (CONFLICTS[currentLoader.value]?.includes(l.key) ?? false)
    let state = '未安装'
    if (busy.value === l.key) {
      state = '安装中…'
    } else if (installed) {
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

/** 从本地文件安装 / 升级：内核暂不解析第三方安装包，明确提示。 */
async function installFromFile() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const picked = await open({
      multiple: false,
      filters: [{ name: '加载器安装包', extensions: ['jar', 'zip'] }],
    })
    if (!picked) return
    toast.info('本地安装包需要手动放入 minecraft/installers 后由内核安装，暂未开放')
  } catch (e) {
    toast.warning(`选择文件失败：${(e as Error).message}`)
  }
}

/** 安装 / 更换加载器：先拉版本列表，再弹窗选版本。 */
async function chooseLoaderVersion(row: LoaderEntry) {
  if (busy.value) return
  if (row.key === 'minecraft') {
    await reinstallGame()
    return
  }
  picker.value = { loader: row, versions: [], loading: true }
  try {
    await store.loadLoaderVersions(row.key, props.instance.version)
    const st = store.loaderVersions[`${row.key}:${props.instance.version}`]
    picker.value = {
      loader: row,
      versions: st?.versions ?? [],
      loading: false,
    }
    if (!st?.versions.length) {
      toast.warning(st?.error ?? `${row.label} 没有可用版本`)
    }
  } catch (e) {
    picker.value = null
    toast.error(`获取 ${row.label} 版本失败：${(e as Error).message}`)
  }
}

/** 应用所选加载器版本（内核安装并回写实例）。 */
async function applyLoader(version: string) {
  const target = picker.value
  if (!target) return
  picker.value = null
  busy.value = target.loader.key
  try {
    const result = await call<InstallResult>('set_instance_loader', {
      id: props.instance.id,
      loader: target.loader.key,
      loaderVersion: version,
    })
    await store.refreshInstances()
    toast.success(`${target.loader.label} ${result.loaderVersion ?? version} 已安装`)
  } catch (e) {
    toast.error(`安装 ${target.loader.label} 失败：${(e as Error).message}`)
  } finally {
    busy.value = null
    store.reloadInstanceTab('overall')
  }
}

/** 重装游戏本体（版本文件缺失 / 损坏时使用）。 */
async function reinstallGame() {
  busy.value = 'minecraft'
  try {
    await call<InstallResult>('install_instance', { id: props.instance.id })
    store.reloadInstanceTab('overall')
    toast.success('游戏本体已重新安装')
  } catch (e) {
    toast.error(`重新安装失败：${(e as Error).message}`)
  } finally {
    busy.value = null
  }
}

/** 卸载加载器（切回原版，游戏本体保留）。 */
async function uninstallLoader(row: LoaderEntry) {
  const ok = await confirmDialog({
    title: `卸载 ${row.label}`,
    message: `确定卸载 ${row.label}？实例将切回原版启动，游戏本体与存档不受影响。`,
    confirmText: '卸载',
    danger: true,
  })
  if (!ok) return
  busy.value = row.key
  try {
    await call<InstallResult>('set_instance_loader', {
      id: props.instance.id,
      loader: 'vanilla',
      loaderVersion: null,
    })
    await store.refreshInstances()
    toast.success(`已卸载 ${row.label}，实例切回原版`)
  } catch (e) {
    toast.error(`卸载失败：${(e as Error).message}`)
  } finally {
    busy.value = null
  }
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
          :disabled="busy !== null"
          @click="chooseLoaderVersion(row)"
        >
          <AlxIcon name="plus" :size="16" />
        </button>
        <template v-else-if="row.installed">
          <button
            v-if="row.key !== 'minecraft'"
            type="button"
            class="icon-btn"
            :title="`卸载 ${row.label}`"
            :disabled="busy !== null"
            @click="uninstallLoader(row)"
          >
            <AlxIcon name="x" :size="16" />
          </button>
          <button
            type="button"
            class="icon-btn"
            :title="row.key === 'minecraft' ? '重新安装游戏本体' : `更换 ${row.label} 版本`"
            :disabled="busy !== null"
            @click="chooseLoaderVersion(row)"
          >
            <AlxIcon name="refresh" :size="16" />
          </button>
        </template>
      </div>
    </div>
  </div>

  <!-- 版本选择弹窗 -->
  <AlxModal
    :open="picker !== null"
    :title="picker ? `选择 ${picker.loader.label} 版本` : '选择版本'"
    @close="picker = null"
  >
    <div v-if="picker?.loading" class="loading-hint">正在获取版本列表…</div>
    <div v-else-if="picker && picker.versions.length === 0" class="empty-state">
      <AlxIcon name="info" :size="28" />
      <span>没有可用的 {{ picker.loader.label }} 版本</span>
    </div>
    <div v-else class="loader-picker-list">
      <button
        v-for="v in picker?.versions ?? []"
        :key="v"
        type="button"
        class="list-item loader-picker-item"
        @click="applyLoader(v)"
      >
        <div class="item-info">
          <AlxIcon :name="picker?.loader.icon ?? 'package'" :size="20" />
          <div class="item-title">{{ v }}</div>
        </div>
        <AlxIcon name="chevron-right" :size="16" />
      </button>
    </div>
  </AlxModal>
</template>
