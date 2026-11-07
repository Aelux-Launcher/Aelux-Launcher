/**
 * 图标注册表：name → SVG 内容（feather 风格线性图标，24 viewBox / 1.5 描边）。
 * 也可配置 `src` 使用位图素材（如 PCL 的方块图标），见下方 grass/command 条目。
 * 通过 <AlxIcon name="..." :size="16" /> 使用。
 */
import grassBlockImg from '../assets/blocks/grass-block.png'
import commandBlockImg from '../assets/blocks/command-block.png'
import grassPathImg from '../assets/blocks/grass-path.png'
import goldBlockImg from '../assets/blocks/gold-block.png'
import eggImg from '../assets/blocks/egg.png'
import optifabricImg from '../assets/blocks/optifabric.png'
import redstoneBlockImg from '../assets/blocks/redstone-block.png'
import redstoneLampOffImg from '../assets/blocks/redstone-lamp-off.png'
import redstoneLampOnImg from '../assets/blocks/redstone-lamp-on.png'

export interface IconDef {
  /** viewBox */
  vb: string
  /** SVG 内部内容（不含 <svg> 壳）；位图图标留空 */
  body: string
  /** 位图路径：存在时渲染 <img> 而非 SVG */
  src?: string
}

const V = '0 0 24 24'

export const ICONS = {
  /* -------- 设计稿核心图标（feather） -------- */
  download: { vb: V, body: `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>` },
  settings: {
    vb: V,
    body: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>`,
  },
  'more-horizontal': { vb: V, body: `<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>` },
  /* 「更多」入口：四宫格（表示更多功能/分区），避免用三点省略号。 */
  apps: { vb: V, body: `<rect x="2.5" y="2.5" width="8" height="8" rx="2"/><rect x="13.5" y="2.5" width="8" height="8" rx="2"/><rect x="2.5" y="13.5" width="8" height="8" rx="2"/><rect x="13.5" y="13.5" width="8" height="8" rx="2"/>` },
  package: { vb: V, body: `<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>` },
  tool: { vb: V, body: `<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>` },
  globe: { vb: V, body: `<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>` },
  image: { vb: V, body: `<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>` },
  columns: { vb: V, body: `<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/>` },
  sun: { vb: V, body: `<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>` },
  coffee: { vb: V, body: `<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>` },
  aperture: { vb: V, body: `<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="21.17" y1="8" x2="12" y2="8"/><line x1="3.95" y1="6.06" x2="8.54" y2="14"/><line x1="10.88" y1="21.94" x2="15.46" y2="14"/>` },
  'help-circle': { vb: V, body: `<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>` },
  info: { vb: V, body: `<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>` },
  'message-square': { vb: V, body: `<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>` },
  search: { vb: V, body: `<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>` },
  'chevron-down': { vb: V, body: `<polyline points="6 9 12 15 18 9"/>` },
  'chevron-left': { vb: V, body: `<polyline points="15 18 9 12 15 6"/>` },
  'chevron-right': { vb: V, body: `<polyline points="9 18 15 12 9 6"/>` },
  'chevrons-left': { vb: V, body: `<polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/>` },
  'chevrons-right': { vb: V, body: `<polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/>` },
  copy: {
    vb: V,
    body: `<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>`,
  },
  play: { vb: V, body: `<polygon points="6 3 20 12 6 21 6 3" fill="currentColor" stroke="none"/>` },

  /* -------- 功能页补充图标（feather） -------- */
  user: { vb: V, body: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>` },
  folder: { vb: V, body: `<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>` },
  trash: { vb: V, body: `<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>` },
  edit: { vb: V, body: `<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>` },
  refresh: { vb: V, body: `<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>` },
  star: { vb: V, body: `<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>` },
  /* 已收藏：实心星标（描边版用于未收藏） */
  'star-filled': {
    vb: V,
    body: `<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="currentColor" stroke="none"/>`,
  },
  plus: { vb: V, body: `<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>` },
  x: { vb: V, body: `<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>` },
  minus: { vb: V, body: `<line x1="5" y1="12" x2="19" y2="12"/>` },
  maximize: { vb: V, body: `<rect x="4" y="4" width="16" height="16" rx="1"/>` },
  restore: {
    vb: V,
    body: `<rect x="8" y="8" width="12" height="12" rx="1"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>`,
  },
  fullscreen: {
    vb: V,
    body: `<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M16 21h3a2 2 0 0 0 2-2v-3M8 21H5a2 2 0 0 1-2-2v-3"/>`,
  },
  external: { vb: V, body: `<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>` },
  code: { vb: V, body: `<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>` },
  layout: { vb: V, body: `<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/>` },
  grid: { vb: V, body: `<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>` },
  /* 服务端：双层机架（用于「下载服务端」，区别于普通下载图标） */
  server: { vb: V, body: `<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>` },
  /* 资源分类：模组=拼图，资源包=衣物（与侧栏图形一致）。 */
  puzzle: { vb: V, body: `<path d="M6 4h4a2 2 0 0 1 4 0h4a2 2 0 0 1 2 2v4a2 2 0 0 1 0 4v4a2 2 0 0 1-2 2h-4a2 2 0 0 0-4 0h-4a2 2 0 0 1-2-2v-4a2 2 0 0 0 0-4v-4a2 2 0 0 1 2-2z"/>` },
  shirt: { vb: V, body: `<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 .55.45 1 1 1h10a1 1 0 0 0 1-1V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>` },
  clock: { vb: V, body: `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>` },
  'bar-chart': { vb: V, body: `<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>` },
  zap: { vb: V, body: `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>` },
  send: { vb: V, body: `<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>` },
  check: { vb: V, body: `<polyline points="20 6 9 17 4 12"/>` },
  /* 加载器标识：Aelux 自绘的辨识图形，不复用第三方品牌素材。 */
  forge: { vb: V, body: `<path d="M4 14h16l-2 5H6l-2-5z"/><path d="M7 14V9h10v5M9 9V6h6v3M10 19v2M14 19v2"/>` },
  neoforge: { vb: V, body: `<path d="M12 2c2 4-1 5 1 8 1.5-1 2.5-2 3-4 3 4 3 10-1 14H9c-4-3-4-8-.5-12C9 11 10.5 12 12 10c-1.5-3 0-5 0-8z"/>` },
  fabric: { vb: V, body: `<path d="M4 7l8-4 8 4-8 4-8-4zM4 12l8 4 8-4M4 17l8 4 8-4"/>` },
  quilt: { vb: V, body: `<path d="M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v6H4zM13 14h7v6h-7z"/><path d="M8 5v7M17 14v6"/>` },
  optifine: { vb: V, body: `<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>` },
  minecraft: { vb: V, body: `<path d="M4 7l8-4 8 4v10l-8 4-8-4V7z"/><path d="M4 7l8 4 8-4M12 11v10M4 7h16"/>` },
  'arrow-left': { vb: V, body: `<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>` },
  'arrow-up': { vb: V, body: `<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>` },
  /* 日志文件：文档 + 文本行（「更多 → 日志」） */
  'file-text': { vb: V, body: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>` },
  /* 帮助教程图标：全部使用 PCL 的方块位图素材 */
  'grass-block': { vb: V, body: '', src: grassBlockImg },
  'command-block': { vb: V, body: '', src: commandBlockImg },
  'hay-block': { vb: V, body: '', src: grassPathImg },
  'gold-block': { vb: V, body: '', src: goldBlockImg },
  egg: { vb: V, body: '', src: eggImg },
  optifabric: { vb: V, body: '', src: optifabricImg },
  'redstone-block': { vb: V, body: '', src: redstoneBlockImg },
  'redstone-lamp-off': { vb: V, body: '', src: redstoneLampOffImg },
  'redstone-lamp-on': { vb: V, body: '', src: redstoneLampOnImg },
  /* 反馈渠道：GitHub / QQ */
  github: {
    vb: V,
    body: `<path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.17c-3.2.7-3.87-1.36-3.87-1.36-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.18 1.18a11.05 11.05 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.41-2.69 5.38-5.25 5.66.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" fill="currentColor" stroke="none"/>`,
  },
  qq: {
    vb: V,
    body: `<path d="M12 3c3.6 0 6 2.6 6 6v1.6c1.1.8 1.8 2 1.8 3.4 0 1.6-1 2.9-2.4 3.4.5 3.7-2 6.6-5.4 6.6s-5.9-2.9-5.4-6.6C5.2 16.3 4.2 15 4.2 13.4c0-1.4.7-2.6 1.8-3.4V9c0-3.4 2.4-6 6-6z"/><circle cx="9.4" cy="10.8" r="1.1" fill="currentColor" stroke="none"/><circle cx="14.6" cy="10.8" r="1.1" fill="currentColor" stroke="none"/><path d="M10.6 13.8h2.8l-1.4 1.4z" fill="currentColor" stroke="none"/><path d="M7.5 16.2c1 .6 1.7 1.9 2 3.2M16.5 16.2c-1 .6-1.7 1.9-2 3.2"/>`,
  },
  /* 外置登录 / 授权 */
  key: { vb: V, body: `<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3 21 2M17 6l3 3M14 9l3 3"/>` },
  'book-open': { vb: V, body: `<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>` },
  'alert-circle': { vb: V, body: `<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>` },
} satisfies Record<string, IconDef>

export type IconName = keyof typeof ICONS
