/**
 * 应用入口：全量 Vapor 启动。
 *
 * Vue 3.6 RC 的 vapor API 在 @vue/runtime-vapor（正式版会并回 'vue'）。
 * vaporInteropPlugin：允许 vdom 组件（vue-router 的 RouterView、过渡组件）
 * 混用在 vapor 应用中；Pinia 通过 effectScope 天然兼容。
 */
import { createVaporApp, vaporInteropPlugin } from '@vue/runtime-vapor'
import { createPinia } from 'pinia'
import { router } from './router'
import App from './App.vue'
import './design/theme.css'
import './design/styles.css'

createVaporApp(App)
  .use(vaporInteropPlugin)
  .use(createPinia())
  .use(router)
  .mount('#app')
