<script setup lang="ts">
/**
 * 统一账户头像：
 *   1. 本地自定义头像（用户上传，Tauri asset 协议）
 *   2. 正版 / 第三方账户的在线皮肤贴图（内核拉取的 Mojang / 认证服务器地址）
 *   3. 离线或在线加载失败 → PCL 内置皮肤按用户名确定性裁切头部
 */
import { computed, ref, watch } from 'vue'
import { convertFileSrc } from '@tauri-apps/api/core'
import { isTauri } from '../lib/bridge'
import { localSkinUrl } from '../lib/skins'

const props = withDefaults(
  defineProps<{
    name: string
    type?: string
    uuid?: string
    override?: string
    skinUrl?: string
    size?: number
  }>(),
  { type: 'offline', uuid: '', override: '', skinUrl: '', size: 40 },
)

/** 在线头像加载失败后回退到本地皮肤。 */
const failed = ref(false)

watch(
  () => [props.name, props.type, props.uuid, props.override, props.skinUrl],
  () => {
    failed.value = false
  },
)

/** 本地上传头像。 */
const overrideUrl = computed(() =>
  props.override && isTauri ? convertFileSrc(props.override) : '',
)

const imgUrl = computed(() => (failed.value ? '' : overrideUrl.value || props.skinUrl))

/** PCL 皮肤第 8–16 像素为头部正面，用 800% 背景缩放裁出来。 */
const faceStyle = computed(() => ({ backgroundImage: `url("${localSkinUrl(props.name)}")` }))
</script>

<template>
  <div class="account-avatar-box" :style="{ width: `${size}px`, height: `${size}px` }">
    <img v-if="imgUrl" :src="imgUrl" alt="" @error="failed = true" />
    <span v-else class="skin-face" :style="faceStyle" />
  </div>
</template>

<style scoped>
.account-avatar-box {
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 6px;
  background: var(--icon-bg);
}
.account-avatar-box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
/* 64×64 皮肤只取头部正面（8,8–16,16） */
.skin-face {
  display: block;
  width: 100%;
  height: 100%;
  background-repeat: no-repeat;
  background-size: 800% 800%;
  background-position: 14.2857% 14.2857%;
  image-rendering: pixelated;
}
</style>
