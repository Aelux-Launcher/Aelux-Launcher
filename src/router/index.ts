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
    { path: '/:pathMatch(.*)*', redirect: '/home' },
  ],
})
