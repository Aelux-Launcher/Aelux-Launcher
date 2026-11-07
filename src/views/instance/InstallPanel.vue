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
import AlxSelect from '../../components/AlxSelect.vue'
import { loaderIconUrl } from '../../lib/loaderIcons'

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

/** 版本选择弹窗：默认选中当前版本（重装 / 修复），也可升降级。 */
interface LoaderPicker {
  loader: LoaderEntry
  versions: string[]
  /** 当前已安装版本（未安装为空） */
  current: string
  selected: string
  loading: boolean
}
const picker = ref<LoaderPicker | null>(null)

/** 加载器 → 位图图标键（旧版加载器复用 Fabric，缺素材回退矢量图标）。 */
const LOADER_ICON_KEY: Record<string, string> = {
  minecraft: 'vanilla',
  liteloader: 'fabric',
  legacyfabric: 'fabric',
}

function loaderIconSrc(key: string): string | null {
  return loaderIconUrl(LOADER_ICON_KEY[key] ?? key)
}

/** 该加载器当前已安装的版本（未安装返回空串）。 */
function installedVersion(key: string): string {
  if (key === 'minecraft') return props.instance.version
  if (key === currentLoader.value) return props.instance.loaderVersion || ''
  return ''
}

/** 目标版本下拉选项（当前版本标注为重装 / 修复）。 */
const pickerOptions = computed(() =>
  (picker.value?.versions ?? []).map((v) => ({
    value: v,
    label:
      picker.value?.current && v === picker.value.current
        ? `${v}（当前版本 · 重装/修复）`
        : v,
  })),
)

function pickSelected(version: string) {
  if (picker.value) picker.value.selected = version
}

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

/** 安装 / 更换加载器：先拉版本列表，再弹窗选版本（默认当前版本 = 重装修复）。 */
async function chooseLoaderVersion(row: LoaderEntry) {
  if (busy.value) return
  if (row.key === 'minecraft') {
    await reinstallGame()
    return
  }
  const current = installedVersion(row.key)
  picker.value = { loader: row, versions: [], current, selected: current, loading: true }
  try {
    await store.loadLoaderVersions(row.key, props.instance.version)
    const st = store.loaderVersions[`${row.key}:${props.instance.version}`]
    const list = st?.versions ?? []
    // 当前版本始终可选：即使清单里没有，也允许重装 / 修复
    const versions = current && !list.includes(current) ? [current, ...list] : list
    if (!picker.value) return // 加载期间用户已关闭弹窗
    picker.value = {
      loader: row,
      versions,
      current,
      selected: current || versions[0] || '',
      loading: false,
    }
    if (!versions.length) {
      toast.warning(st?.error ?? `${row.label} 没有可用版本`)
    }
  } catch (e) {
    picker.value = null
    toast.error(`获取 ${row.label} 版本失败：${(e as Error).message}`)
  }
}

/** 关闭版本弹窗：二级锁确认，避免误触遮罩丢失选择。 */
async function closePicker() {
  if (!picker.value) return
  const ok = await confirmDialog({
    title: '退出加载器版本选择',
    message: '尚未开始安装，退出不会改动当前版本。确定关闭？',
    confirmText: '关闭',
  })
  if (ok) picker.value = null
}

/** 应用所选加载器版本：危险操作二次确认后走内核安装。 */
async function applyLoader() {
  const target = picker.value
  if (!target || !target.selected) return
  const repairing = !!target.current && target.selected === target.current
  const ok = await confirmDialog({
    title: repairing
      ? `重新安装 ${target.loader.label} ${target.selected}`
      : `切换 ${target.loader.label} 到 ${target.selected}`,
    message:
      '更换或重装加载器版本可能导致存档异常、Mod 不兼容或游戏无法启动，请先备份存档。确定继续？',
    confirmText: '继续',
    danger: true,
  })
  if (!ok) return
  const version = target.selected
  picker.value = null
  busy.value = target.loader.key
  try {
    const result = await call<InstallResult>('set_instance_loader', {
      id: props.instance.id,
      loader: target.loader.key,
      loaderVersion: version,
    })
    await store.refreshInstances()
    toast.success(
      repairing
        ? `${target.loader.label} ${version} 已重新安装（修复）`
        : `${target.loader.label} 已切换到 ${result.loaderVersion ?? version}`,
    )
  } catch (e) {
    toast.error(`安装 ${target.loader.label} 失败：${(e as Error).message}`)
  } finally {
    busy.value = null
    store.reloadInstanceTab('overall')
  }
}

/** 重装游戏本体（版本文件缺失 / 损坏时使用；二级锁防误操作）。 */
async function reinstallGame() {
  if (busy.value) return
  const ok = await confirmDialog({
    title: '重新安装游戏本体',
    message:
      '将重新下载并覆盖游戏本体文件，用于修复缺失或损坏的版本文件。存档与 Mod 不受影响，但建议先备份存档。确定继续？',
    confirmText: '重新安装',
    danger: true,
  })
  if (!ok) return
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
      <div class="install-icon">
        <img
          v-if="loaderIconSrc(row.key)"
          :src="loaderIconSrc(row.key) || ''"
          width="22"
          height="22"
          alt=""
        />
        <AlxIcon v-else :name="row.icon" :size="22" />
      </div>
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

  <!-- 加载器版本弹窗：默认当前版本（重装 / 修复），也可升降级 -->
  <AlxModal
    :open="picker !== null"
    :title="picker ? `选择 ${picker.loader.label} 版本` : '选择版本'"
    @close="closePicker"
  >
    <div v-if="picker" class="loader-picker">
      <div class="loader-picker-head">
        <div class="install-icon">
          <img
            v-if="loaderIconSrc(picker.loader.key)"
            :src="loaderIconSrc(picker.loader.key) || ''"
            width="22"
            height="22"
            alt=""
          />
          <AlxIcon v-else :name="picker.loader.icon" :size="22" />
        </div>
        <div class="item-info">
          <div class="item-title">{{ picker.loader.label }}</div>
          <div class="item-desc">
            {{ picker.current ? `当前版本 ${picker.current}` : '尚未安装' }}
          </div>
        </div>
      </div>

      <div v-if="picker.loading" class="loading-hint">正在获取版本列表…</div>
      <template v-else>
        <div class="picker-field">
          <div class="picker-label">目标版本</div>
          <AlxSelect
            :model-value="picker.selected"
            :options="pickerOptions"
            placeholder="选择版本"
            @update:model-value="pickSelected"
          />
        </div>
        <p class="picker-note">
          更新当前版本会重新下载并覆盖原版本文件，用于修复；也可以选择升级或降级。
          更换加载器版本可能导致存档异常或游戏崩溃，请提前备份存档。
        </p>
        <div v-if="picker.versions.length === 0" class="empty-state">
          <AlxIcon name="info" :size="28" />
          <span>没有可用的 {{ picker.loader.label }} 版本</span>
        </div>
      </template>
    </div>

    <template #actions>
      <button type="button" class="btn-sub" @click="closePicker">取消</button>
      <button
        type="button"
        class="btn-download"
        :disabled="!picker || picker.loading || !picker.selected"
        @click="applyLoader"
      >
        开始安装
      </button>
    </template>
  </AlxModal>
</template>

<style scoped>
.loader-picker-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.picker-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.picker-label {
  font-size: 12px;
  color: var(--text-sub);
}
.picker-note {
  margin: 14px 0 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--hover-bg);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-sub);
}
</style>
