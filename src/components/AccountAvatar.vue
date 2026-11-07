<script setup lang="ts">
/**
 * 统一账户头像：
 *   1. 本地自定义头像（用户上传，Tauri asset 协议）
 *   2. 正版 / 第三方账户的在线皮肤贴图（内核拉取的 Mojang / 认证服务器地址）
 *   3. 离线或在线加载失败 → 内置皮肤按用户名确定性裁切头部
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

/** 已预加载完成的在线皮肤地址（切换新地址期间保留旧图，避免闪动）。 */
const loadedSkinUrl = ref('')

/** 账户身份变化（换账户 / 换本地上传图）：清空已加载皮肤与失败态，回落本地皮肤。 */
watch(
  () => [props.name, props.uuid, props.override],
  () => {
    failed.value = false
    loadedSkinUrl.value = ''
  },
)

/** 本地上传头像：用户裁剪过的方图，直接铺满。 */
const overrideUrl = computed(() =>
  props.override && isTauri ? convertFileSrc(props.override) : '',
)

/**
 * 在线皮肤预加载：下载完成后才切换 src。
 * 新旧在线地址切换期间保留旧皮肤显示，避免「在线 → 本地 → 在线」闪一下；
 * skinUrl 清空（无在线皮肤）或账户身份变化时才回落本地兜底。
 */
watch(
  () => props.skinUrl,
  (url) => {
    if (!url) {
      loadedSkinUrl.value = ''
      return
    }
    if (url === loadedSkinUrl.value) return
    const probe = new Image()
    probe.onload = () => {
      loadedSkinUrl.value = url
    }
    probe.src = url
  },
  { immediate: true },
)

/**
 * 皮肤贴图：在线皮肤（Mojang / 认证服务器，需预加载完成）或本地素材。
 * 都是 64×64 全身图，由 `.skin-img` 放大 8 倍只露出头部正面。
 */
const skinSrc = computed(() => {
  if (failed.value) return localSkinUrl(props.name)
  // 已加载完成的在线皮肤持续显示（换地址重载期间保留旧图，不闪回本地）
  if (loadedSkinUrl.value) return loadedSkinUrl.value
  return localSkinUrl(props.name)
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
