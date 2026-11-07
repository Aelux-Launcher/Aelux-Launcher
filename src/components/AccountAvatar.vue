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

/** 本地上传头像：用户裁剪过的方图，直接铺满。 */
const overrideUrl = computed(() =>
  props.override && isTauri ? convertFileSrc(props.override) : '',
)

/**
 * 皮肤贴图：在线皮肤（Mojang / 认证服务器）或本地素材。
 * 都是 64×64 全身图，由 `.skin-img` 放大 8 倍只露出头部正面。
 */
const skinSrc = computed(() => {
  if (failed.value) return localSkinUrl(props.name)
  return props.skinUrl || localSkinUrl(props.name)
})
</script>

<template>
  <div class="account-avatar-box" :style="{ width: `${size}px`, height: `${size}px` }">
    <img v-if="overrideUrl" class="avatar-img" :src="overrideUrl" alt="" />
    <img v-else class="skin-img" :src="skinSrc" alt="" @error="failed = true" />
  </div>
</template>

<style scoped>
.account-avatar-box {
  position: relative;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 6px;
  background: var(--icon-bg);
}
/* 自定义头像：整图铺满 */
.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
/* 皮肤：64×64 全身图放大 8 倍，偏移 1/8 后只露出头部正面（8,8–16,16） */
.skin-img {
  position: absolute;
  left: -100%;
  top: -100%;
  width: 800%;
  height: 800%;
  object-fit: fill;
  image-rendering: pixelated;
}
</style>
