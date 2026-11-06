<script setup lang="ts">
/**
 * 资源包管理（参考 PCL 的资源包页）：
 * 搜索 + 工具行 + 启用开关的资源包列表。
 *
 * 本地清单尚未接入内核目录列举（同 ModPanel，读不到时用演示数据撑起界面）。
 * 启用状态写入本地 KV 之外的部分暂只在前端生效。
 */
import { computed, ref } from 'vue'
import { useAppStore } from '../../stores/app'
import { toast } from '../../lib/toast'
import type { GameInstance } from '../../lib/types'
import AlxIcon from '../../components/AlxIcon.vue'
import AlxSearchBar from '../../components/AlxSearchBar.vue'
import AlxToggle from '../../components/AlxToggle.vue'
import { openFolderInExplorer, resolveInstanceDir } from '../instanceMeta'

const props = defineProps<{ instance: GameInstance }>()

const store = useAppStore()

/** 演示资源包（本地清单为空时撑起界面）。 */
const DEMO_PACKS: { id: string; name: string; desc: string; size: string }[] = [
  { id: 'demo-0', name: '原版高清材质', desc: '在保留原版风格的前提下提升分辨率', size: '128x · 42 MB' },
  { id: 'demo-1', name: '简约界面', desc: '重制背包、容器与 HUD，界面更干净', size: '64x · 18 MB' },
  { id: 'demo-2', name: '写实自然', desc: '重绘方块与生物材质，偏写实风格', size: '256x · 96 MB' },
  { id: 'demo-3', name: '中世纪建筑', desc: '建筑与装饰方块的中世纪风格材质', size: '128x · 36 MB' },
  { id: 'demo-4', name: '清透水体', desc: '更清澈的水面与水下视觉效果', size: '64x · 6 MB' },
  { id: 'demo-5', name: '字体优化', desc: '替换默认字体，改善中文显示效果', size: '32x · 2 MB' },
]

const query = ref('')
const enabled = ref<Record<string, boolean>>({ 'demo-0': true, 'demo-1': true })

/** 过滤后的资源包列表。 */
const rows = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  return DEMO_PACKS.filter(
    (p) => !keyword || p.name.toLowerCase().includes(keyword) || p.desc.toLowerCase().includes(keyword),
  )
})

/** 已启用数量。 */
const enabledCount = computed(() => DEMO_PACKS.filter((p) => enabled.value[p.id]).length)

/** 打开实例的 resourcepacks 目录。 */
async function openPackFolder() {
  try {
    const dir = await resolveInstanceDir(props.instance.id)
    await openFolderInExplorer(`${dir}/resourcepacks`)
  } catch (e) {
    toast.warning(`资源包文件夹尚未生成：${(e as Error).message}`)
  }
}

/** 从本地文件导入资源包（.zip）。 */
async function importPack() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const picked = await open({
      multiple: true,
      filters: [{ name: '资源包', extensions: ['zip'] }],
    })
    const files = Array.isArray(picked) ? picked : picked ? [picked] : []
    if (files.length === 0) return
    toast.info(`已选择 ${files.length} 个资源包，请放入 resourcepacks 文件夹后重启游戏`)
  } catch (e) {
    toast.warning(`选择文件失败：${(e as Error).message}`)
  }
}
</script>

<template>
  <!-- 搜索 + 工具行 -->
  <div class="panel-toolbar">
    <AlxSearchBar v-model="query" placeholder="搜索资源包" />
    <div class="panel-actions">
      <button type="button" class="btn-sub" @click="openPackFolder">打开文件夹</button>
      <button type="button" class="btn-sub" @click="importPack">从文件导入</button>
      <button type="button" class="btn-sub" @click="store.setView('download')">下载新资源包</button>
    </div>
  </div>

  <!-- 资源包列表 -->
  <div class="setting-group">
    <div class="setting-group-title">
      资源包列表
      <span class="panel-counter">已启用 {{ enabledCount }} / {{ DEMO_PACKS.length }}</span>
    </div>
    <div v-if="rows.length === 0" class="empty-state">
      <AlxIcon name="shirt" :size="32" />
      <span>没有符合条件的资源包</span>
    </div>
    <template v-else>
      <div v-for="p in rows" :key="p.id" class="list-item">
        <div class="item-left">
          <div class="item-icon"><AlxIcon name="shirt" :size="20" /></div>
          <div class="item-info">
            <div class="item-title">{{ p.name }}</div>
            <div class="item-desc">{{ p.desc }}</div>
          </div>
        </div>
        <div class="item-right">
          <span class="item-meta">{{ p.size }}</span>
          <AlxToggle
            :model-value="!!enabled[p.id]"
            @update:model-value="enabled = { ...enabled, [p.id]: !enabled[p.id] }"
          />
        </div>
      </div>
    </template>
  </div>
</template>
