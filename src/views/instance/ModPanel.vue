<script setup lang="ts">
/**
 * Mod 面板：搜索 + 工具行 + 分类胶囊 + Mod 列表。
 *
 * 本地 Mod 清单由 localModsRepo 提供（lib 移除后暂返回空列表），
 * 读不到时用演示数据兜底撑起界面。
 */
import { computed, ref, watch } from 'vue'
import { useAppStore } from '../../stores/app'
import { toast } from '../../lib/toast'
import type { GameInstance } from '../../lib/types'
import AlxIcon from '../../components/AlxIcon.vue'
import AlxSearchBar from '../../components/AlxSearchBar.vue'
import AlxToggle from '../../components/AlxToggle.vue'
import SettingGroup from '../../components/SettingGroup.vue'
import { localModsRepo, openFolderInExplorer, resolveInstanceDir, type LocalMod } from '../instanceMeta'

const props = defineProps<{ instance: GameInstance }>()

const store = useAppStore()

/** 演示用 Mod 清单（本地没有安装 Mod 时用于撑起界面）。 */
const DEMO_MODS: { name: string; desc: string }[] = [
  { name: 'Sodium', desc: '现代化渲染引擎，大幅提升帧率并降低显存占用' },
  { name: 'Lithium', desc: '优化游戏物理与 AI 逻辑，减少卡顿' },
  { name: 'Iris', desc: '为 Sodium 提供光影支持的可选加载器' },
  { name: 'Mod 菜单', desc: '统一的模组配置界面，可在游戏内直接调整设置' },
  { name: '传送石', desc: '新增传送石与传送门，方便快速移动' },
  { name: '家具与装饰', desc: '上百种家具与装饰方块' },
  { name: '实体动画', desc: '扩展实体模型与动画表现' },
  { name: '环境音效', desc: '为不同环境加入沉浸式环境音效' },
  { name: '高清材质', desc: '重制的高分辨率材质包' },
  { name: '自动备份', desc: '定时备份存档，避免误删进度' },
  { name: '示例整合包', desc: '包含全部模组配置的整合包' },
]

const query = ref('')
const mods = ref<LocalMod[]>([])
const selected = ref<Record<string, boolean>>({})

// 本地 Mod 清单（读不到 / 为空时用演示数据兜底）。
watch(
  () => props.instance.id,
  async (id) => {
    mods.value = await localModsRepo.list(id)
  },
  { immediate: true },
)

const rows = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  const base =
    mods.value.length > 0
      ? mods.value.map((m) => ({
          id: m.id,
          name: m.name,
          desc: m.description || m.fileName,
        }))
      : DEMO_MODS.map((m, i) => ({ id: `demo-${i}`, name: m.name, desc: m.desc }))
  return base.filter(
    (m) =>
      !keyword || m.name.toLowerCase().includes(keyword) || m.desc.toLowerCase().includes(keyword),
  )
})

const selectedCount = computed(() => Object.values(selected.value).filter(Boolean).length)

async function openModsFolder() {
  try {
    const dir = await resolveInstanceDir(props.instance.id)
    await openFolderInExplorer(`${dir}/mods`)
  } catch (e) {
    toast.warning(`Mod 文件夹尚未生成：${(e as Error).message}`)
  }
}

async function installFromFile() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const picked = await open({
      multiple: true,
      filters: [{ name: 'Mod 文件', extensions: ['jar'] }],
    })
    const files = Array.isArray(picked) ? picked : picked ? [picked] : []
    if (files.length === 0) return
    toast.info(`已选择 ${files.length} 个文件，请放入 Mod 文件夹后重启游戏`)
  } catch (e) {
    toast.warning(`选择文件失败：${(e as Error).message}`)
  }
}

/** 勾选 / 取消勾选某个 Mod。 */
function toggle(id: string) {
  selected.value = { ...selected.value, [id]: !selected.value[id] }
}

/** 全选当前过滤结果。 */
function selectAll() {
  const next: Record<string, boolean> = {}
  for (const row of rows.value) next[row.id] = true
  selected.value = next
  toast.success(`已选中 ${rows.value.length} 个 Mod`)
}
</script>

<template>
  <!-- 搜索 + 工具行 -->
  <div class="panel-toolbar">
    <AlxSearchBar v-model="query" placeholder="搜索 Mod" />
    <div class="panel-actions">
      <button type="button" class="btn-sub" @click="openModsFolder">打开文件夹</button>
      <button type="button" class="btn-sub" @click="installFromFile">从文件安装</button>
      <button type="button" class="btn-sub" @click="store.setView('download')">下载新 Mod</button>
      <button type="button" class="btn-sub" @click="selectAll">全选</button>
    </div>
  </div>

  <!-- Mod 列表 -->
  <SettingGroup title="模组列表" :collapsible="false" :extra="`已选 ${selectedCount}`">
    <div v-if="rows.length === 0" class="empty-state">
      <AlxIcon name="package" :size="32" />
      <span>没有符合条件的 Mod</span>
    </div>
    <template v-else>
      <div v-for="m in rows" :key="m.id" class="list-item">
        <div class="item-left">
          <div class="item-icon"><AlxIcon name="package" :size="20" /></div>
          <div class="item-info">
            <div class="item-title">{{ m.name }}</div>
            <div class="item-desc">{{ m.desc }}</div>
          </div>
        </div>
        <div class="item-right">
          <AlxToggle :model-value="!!selected[m.id]" @update:model-value="toggle(m.id)" />
        </div>
      </div>
    </template>
  </SettingGroup>
</template>
