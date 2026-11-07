/**
 * SPA 路由（vue-router，hash 模式兼容 Tauri 协议）。
 *
 * 页面层级模型（对应极简黑白设计稿）：
 *   启动页 /home —— 左栏显示「基础」组
 *   模块页 /download/:cat、/settings/:sec、/more/:sec —— 左栏切换为模块分组
 *   详情页 /tasks、/select、/instance/:id/:tab、/resource/:kind/:id、/help/:id
 *     —— 顶栏出现返回按钮，侧栏保持来源模块分组
 */
import { createRouter, createWebHashHistory } from 'vue-router'
import Home from '../views/Home.vue'
import Download from '../views/Download.vue'
import Settings from '../views/Settings.vue'
import More from '../views/More.vue'
import Select from '../views/Select.vue'
import TaskManager from '../views/TaskManager.vue'
import Instance from '../views/Instance.vue'
import ResourceDetail from '../views/ResourceDetail.vue'
import HelpDetail from '../views/HelpDetail.vue'
import VersionDetail from '../views/VersionDetail.vue'
import Accounts from '../views/Accounts.vue'

const LAST_ROUTE_KEY = 'aelux:last-route'

/**
 * 只有「刷新 / 崩溃重载」才恢复上次页面；全新启动一律回首页。
 * 进程重启时 navigation.type 为 navigate，reload 时为 reload。
 */
function isReloadNavigation() {
  try {
    const [entry] = performance.getEntriesByType('navigation')
    return (entry as PerformanceNavigationTiming | undefined)?.type === 'reload'
  } catch {
    return false
  }
}

/**
 * 应用重载会丢掉 hash，路由兜底会落到首页。
 * 这里把上一次的详情/模块页写回 hash，保证下载中、下载完成或意外重载后仍停留在原页面。
 * 用 localStorage：WebView 进程重启后 sessionStorage 会被清空，localStorage 才能跨进程保留。
 */
function restoreLastRoute() {
  try {
    if (!isReloadNavigation()) return
    const saved = localStorage.getItem(LAST_ROUTE_KEY)
    if (!saved || location.hash) return
    const path = saved.split(/[?#]/)[0]
    const allowed =
      path === '/tasks' ||
      path === '/select' ||
      path === '/accounts' ||
      path.startsWith('/version/') ||
      path.startsWith('/download') ||
      path.startsWith('/instance/') ||
      path.startsWith('/settings') ||
      path.startsWith('/more/') ||
      path.startsWith('/resource/') ||
      path.startsWith('/help/')
    if (allowed) history.replaceState(null, '', `#${saved}`)
  } catch {
    /* localStorage 不可用时忽略 */
  }
}

restoreLastRoute()

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/home' },
    { path: '/home', name: 'home', component: Home, meta: { module: 'home' } },
    { path: '/download', redirect: '/download/original' },
    { path: '/download/:cat', name: 'download', component: Download, meta: { module: 'download' } },
    { path: '/settings', redirect: '/settings/global' },
    { path: '/settings/:sec', name: 'settings', component: Settings, meta: { module: 'settings' } },
    { path: '/more', redirect: '/more/help' },
    { path: '/more/:sec', name: 'more', component: More, meta: { module: 'more' } },
    // 详情页（顶栏返回态）
    { path: '/select', name: 'select', component: Select, meta: { sub: 'select' } },
    { path: '/tasks', name: 'tasks', component: TaskManager, meta: { sub: 'tasks' } },
    {
      path: '/instance/:instanceId/:tab?',
      name: 'instance',
      component: Instance,
      meta: { sub: 'instance' },
    },
    {
      path: '/resource/:kind/:projectId',
      name: 'resource',
      component: ResourceDetail,
      meta: { sub: 'resource' },
    },
    { path: '/help/:entryId', name: 'help', component: HelpDetail, meta: { sub: 'help' } },
    { path: '/version/:versionId', name: 'version', component: VersionDetail, meta: { sub: 'version' } },
    { path: '/accounts', name: 'accounts', component: Accounts, meta: { sub: 'accounts' } },
    { path: '/:pathMatch(.*)*', redirect: '/home' },
  ],
})

router.afterEach((to) => {
  try {
    localStorage.setItem(LAST_ROUTE_KEY, to.fullPath)
  } catch {
    /* localStorage 不可用时忽略 */
  }
})
