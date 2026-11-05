<script setup lang="ts">
/**
 * 添加微软账户：先弹窗说明，确认后再发起设备码登录（避免一点就跳转浏览器）。
 */
import AlxModal from './AlxModal.vue'
import { call } from '../lib/bridge'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; submit: [] }>()

function openLink(url: string) {
  void call('open_external', { url }).catch(() => {})
}
</script>

<template>
  <AlxModal :open="open" title="添加微软账户" @close="emit('close')">
    <div class="ms-login-hint">
      提示：点击「登录」按钮后会在浏览器中打开微软登录页，登录完成后返回启动器即可。
    </div>

    <div class="ms-login-links">
      <button type="button" class="link-btn" @click="openLink('https://www.microsoft.com/link')">
        扫描二维码登录
      </button>
      <button type="button" class="link-btn" @click="openLink('https://account.microsoft.com/profile')">
        编辑账户个人信息
      </button>
      <button type="button" class="link-btn" @click="openLink('https://www.minecraft.net/store/minecraft-java-bedrock-edition')">
        购买 Minecraft
      </button>
    </div>

    <template #actions>
      <button type="button" class="btn-sub" @click="emit('close')">取消</button>
      <button type="button" class="btn-download" @click="emit('submit')">登录</button>
    </template>
  </AlxModal>
</template>
