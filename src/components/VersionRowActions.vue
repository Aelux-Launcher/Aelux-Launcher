<script setup lang="ts">
/**
 * 版本行悬浮操作组：另存为 / 更新日志 / 下载服务端。
 * 按钮点击 stop 冒泡，避免触发所在行的「进入版本页」点击。
 * 不区分安装状态：同版本可以反复下载，最多是命名问题。
 */
import { useAppStore } from '../stores/app'
import { toast } from '../lib/toast'
import { call } from '../lib/bridge'
import AlxIcon from './AlxIcon.vue'

const props = defineProps<{ versionId: string }>()

const store = useAppStore()

/** 另存为：对话框选位置保存客户端 jar（取消则静默）。 */
async function handleSaveAs() {
  try {
    const path = await store.saveVersionClient(props.versionId)
    if (path) toast.success(`客户端已保存到 ${path}`)
  } catch (e) {
    toast.error(`另存为失败：${(e as Error).message}`)
  }
}

/** 更新日志：打开该版本的 Wiki 页（Mojang 无官方逐版本日志源）。 */
async function openChangelog() {
  try {
    await call('open_external', {
      url: `https://minecraft.wiki/w/${encodeURIComponent(props.versionId)}`,
    })
  } catch (e) {
    toast.error(`无法打开网页：${(e as Error).message}`)
  }
}

/** 下载服务端：落到数据目录 minecraft/servers/<id>/server.jar。 */
async function handleServerDownload() {
  try {
    const dest = await store.downloadVersionServer(props.versionId)
    toast.success(`服务端已下载到 ${dest}`)
  } catch (e) {
    toast.error(`下载服务端失败：${(e as Error).message}`)
  }
}
</script>

<template>
  <div class="item-right">
    <button type="button" class="icon-btn" title="另存为" @click.stop="handleSaveAs">
      <AlxIcon name="folder" :size="16" />
    </button>
    <button type="button" class="icon-btn" title="更新日志" @click.stop="openChangelog">
      <AlxIcon name="info" :size="16" />
    </button>
    <button type="button" class="icon-btn" title="下载服务端" @click.stop="handleServerDownload">
      <AlxIcon name="server" :size="16" />
    </button>
  </div>
</template>
