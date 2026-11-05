/**
 * 平台桥接：前端与 Rust 的唯一通信面。
 *
 * - Tauri 环境：全部走 invoke（命令层见 src-tauri/src/commands.rs，
 *   TS 绑定由 tauri-specta 生成到 src/lib/bindings.ts）。
 * - 浏览器预览（npm run dev:web）：无 IPC，走本地模拟实现，
 *   保证 UI 布局预览始终可用。
 */
import { invoke } from '@tauri-apps/api/core'

/** 是否运行在 Tauri 容器内。 */
export const isTauri: boolean =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in (window as unknown as Record<string, unknown>)

/** 调用后端命令（浏览器模式下落到模拟实现）。 */
export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) return invoke<T>(command, args ?? {})
  return mockCall<T>(command, args)
}

/* ======================= 浏览器预览模拟 ======================= */

const LS_PREFIX = 'aelux.preview.'

const PREVIEW_VERSIONS = [
  '1.21.4', '1.21.3', '1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.2', '1.20.1',
  '1.19.4', '1.19.2', '1.18.2', '1.16.5', '1.12.2', '1.7.10',
  '25w45a',
].map((id) => ({
  id,
  kind: id.startsWith('2') ? 'snapshot' : 'release',
  url: `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json#${id}`,
  time: '2026-01-01T00:00:00+00:00',
  releaseTime: '2026-01-01T00:00:00+00:00',
  sha1: null,
}))

const previewInstances: unknown[] = [
  {
    id: 'preview-1',
    name: '1.21.4 原版',
    version: '1.21.4',
    loader: 'vanilla',
    loaderVersion: null,
    icon: null,
    createdAt: '2026-01-01T00:00:00Z',
    lastPlayedAt: '2026-01-02T00:00:00Z',
    playtimeSecs: 3600,
  },
  {
    id: 'preview-2',
    name: '1.20.1 Fabric',
    version: '1.20.1',
    loader: 'fabric',
    loaderVersion: '0.16.0',
    icon: null,
    createdAt: '2025-12-01T00:00:00Z',
    lastPlayedAt: null,
    playtimeSecs: 0,
  },
]

/* ================== 资源预览数据（六类社区资源，本地测试用） ================== */

/** 浏览器预览的微软登录轮询计数：前 2 次 pending，之后成功（可测完整流程）。 */
let msPollCount = 0

function resetMsPollCount() {
  msPollCount = 0
}

interface PreviewResource {
  projectId: string
  slug: string
  title: string
  description: string
  categories: string[]
  downloads: number
  author: string
  dateModified: string
}

const PREVIEW_RESOURCES: Record<string, PreviewResource[]> = {
  modpack: [
    { projectId: 'fabulously-optimized', slug: 'fabulously-optimized', title: 'Fabulously Optimized', description: 'A pack that optimizes Minecraft while keeping vanilla gameplay.', categories: ['optimization', 'utility'], downloads: 8_620_000, author: 'README_bot', dateModified: '2026-10-28T10:00:00Z' },
    { projectId: 'additive', slug: 'additive', title: 'Additive', description: 'Vanilla+ performance and enhancement pack.', categories: ['optimization', 'vanilla-like'], downloads: 2_140_000, author: 'Starmute', dateModified: '2026-10-20T08:30:00Z' },
    { projectId: 'simply-optimized', slug: 'simply-optimized', title: 'Simply Optimized', description: 'A performance-focused modpack with no gameplay changes.', categories: ['optimization'], downloads: 1_380_000, author: 'Siphalor', dateModified: '2026-09-30T16:00:00Z' },
    { projectId: 'adrenaline', slug: 'adrenaline', title: 'Adrenaline', description: 'Boost your FPS while keeping every vanilla feature.', categories: ['optimization', 'quality-of-life'], downloads: 986_000, author: 'SettingDust', dateModified: '2026-10-11T12:00:00Z' },
    { projectId: 'aelux-demo-pack', slug: 'aelux-demo-pack', title: 'Aelux 演示整合包', description: '内置预览整合包：性能优化 + 常用工具模组组合。', categories: ['multiplayer', 'optimization'], downloads: 12_400, author: 'Aelux', dateModified: '2026-11-01T09:00:00Z' },
  ],
  mod: [
    { projectId: 'jei', slug: 'jei', title: 'Just Enough Items (JEI)', description: 'Item and recipe viewing mod for Minecraft.', categories: ['forge', 'fabric', 'neoforge', 'utility'], downloads: 329_000_000, author: 'mezz', dateModified: '2026-10-25T08:00:00Z' },
    { projectId: 'sodium', slug: 'sodium', title: 'Sodium', description: 'A modern rendering engine for Minecraft that greatly improves frame rates.', categories: ['fabric', 'optimization'], downloads: 412_000_000, author: 'jellysquid3', dateModified: '2026-10-30T14:00:00Z' },
    { projectId: 'lithium', slug: 'lithium', title: 'Lithium', description: 'Game logic optimizations with no behavior changes.', categories: ['fabric', 'optimization'], downloads: 123_000_000, author: 'jellysquid3', dateModified: '2026-10-12T09:00:00Z' },
    { projectId: 'iris', slug: 'iris', title: 'Iris Shaders', description: 'Shader pack loader for Fabric with full OptiFine parity.', categories: ['fabric', 'rendering'], downloads: 89_400_000, author: 'coderbot', dateModified: '2026-10-22T11:00:00Z' },
    { projectId: 'waystones', slug: 'waystones', title: 'Waystones', description: 'Teleport from waystone to waystone or craft magical scrolls to warp.', categories: ['forge', 'fabric', 'transport'], downloads: 31_200_000, author: 'BlayTheNinth', dateModified: '2026-09-18T07:00:00Z' },
    { projectId: 'cloth-config', slug: 'cloth-config', title: 'Cloth Config API', description: 'A config screen library used by many mods.', categories: ['fabric', 'forge', 'library'], downloads: 156_000_000, author: 'shedaniel', dateModified: '2026-10-05T13:00:00Z' },
  ],
  world: [
    { projectId: 'terralith', slug: 'terralith', title: 'Terralith', description: 'Overworld rework with 100+ new biomes, vanilla friendly.', categories: ['worldgen', 'adventure'], downloads: 3_420_000, author: 'Starmute', dateModified: '2026-10-15T10:00:00Z' },
    { projectId: 'tectonic', slug: 'tectonic', title: 'Tectonic', description: 'Height and terrain overhaul: taller mountains, deeper oceans.', categories: ['worldgen'], downloads: 1_760_000, author: 'Apollo', dateModified: '2026-09-27T09:00:00Z' },
    { projectId: 'structory', slug: 'structory', title: 'Structory', description: 'Immersive, atmospheric vanilla-style structures.', categories: ['structures', 'adventure'], downloads: 1_120_000, author: 'Botany', dateModified: '2026-08-30T15:00:00Z' },
    { projectId: 'towns-and-towers', slug: 'towns-and-towers', title: 'Towns and Towers', description: 'Adds villages, outposts and towers to every biome.', categories: ['structures', 'worldgen'], downloads: 986_000, author: 'Bibliothek', dateModified: '2026-10-02T11:00:00Z' },
    { projectId: 'aelux-demo-world', slug: 'aelux-demo-world', title: 'Aelux 演示世界', description: '内置预览世界：空岛生存地图，适合快速验证下载链路。', categories: ['adventure', 'skyblock'], downloads: 8_600, author: 'Aelux', dateModified: '2026-11-01T09:00:00Z' },
  ],
  datapack: [
    { projectId: 'incendium', slug: 'incendium', title: 'Incendium', description: 'Nether overhaul: new structures, bosses and loot.', categories: ['adventure', 'worldgen'], downloads: 2_310_000, author: 'Starmute', dateModified: '2026-10-08T10:00:00Z' },
    { projectId: 'amplified-nether', slug: 'amplified-nether', title: 'Amplified Nether', description: 'Massive nether terrain with towering ceilings and chasms.', categories: ['worldgen'], downloads: 1_450_000, author: 'Apollo', dateModified: '2026-09-14T12:00:00Z' },
    { projectId: 'nullscape', slug: 'nullscape', title: 'Nullscape', description: 'A desolate, otherworldly redesign of the End dimension.', categories: ['worldgen', 'adventure'], downloads: 1_020_000, author: 'Starmute', dateModified: '2026-08-21T09:00:00Z' },
    { projectId: 'balanced-mobs', slug: 'balanced-mobs', title: 'Balanced Mob Spawns', description: 'Fine-tuned spawning rules for a fairer survival loop.', categories: ['gameplay', 'utility'], downloads: 468_000, author: 'Relly', dateModified: '2026-10-19T08:00:00Z' },
    { projectId: 'aelux-demo-datapack', slug: 'aelux-demo-datapack', title: 'Aelux 演示数据包', description: '内置预览数据包：自定义合成与战利品表示例。', categories: ['gameplay'], downloads: 6_200, author: 'Aelux', dateModified: '2026-11-01T09:00:00Z' },
  ],
  resourcepack: [
    { projectId: 'faithless', slug: 'faithless', title: 'Faithless', description: 'A 32x continuation of the vanilla aesthetic.', categories: ['32x', 'vanilla-like'], downloads: 1_980_000, author: 'Unity', dateModified: '2026-10-14T10:00:00Z' },
    { projectId: 'bare-bones', slug: 'bare-bones', title: 'Bare Bones', description: 'A minimal, flat texture pack inspired by trailer visuals.', categories: ['16x', 'simplistic'], downloads: 2_640_000, author: 'RobotPants', dateModified: '2026-09-22T12:00:00Z' },
    { projectId: 'xalis-enchanted-books', slug: "xali's-enchanted-books", title: "xali's Enchanted Books", description: 'Color-coded enchanted books with clean overlays.', categories: ['16x', 'utility'], downloads: 1_310_000, author: 'xali', dateModified: '2026-10-03T09:00:00Z' },
    { projectId: 'better-leaves', slug: 'better-leaves', title: "Motschen's Better Leaves", description: 'Bushier leaves for a fuller forest look.', categories: ['16x', 'tweaks'], downloads: 890_000, author: 'Motschen', dateModified: '2026-07-30T11:00:00Z' },
    { projectId: 'aelux-demo-pack-texture', slug: 'aelux-demo-texture', title: 'Aelux 演示资源包', description: '内置预览资源包：界面微调与色彩统一示例。', categories: ['16x', 'tweaks'], downloads: 4_100, author: 'Aelux', dateModified: '2026-11-01T09:00:00Z' },
  ],
  shader: [
    { projectId: 'complementary-reimagined', slug: 'complementary-reimagined', title: 'Complementary Reimagined', description: 'Elevating pixel art to new heights with stunning visuals.', categories: ['vanilla-like', 'potato-friendly'], downloads: 4_820_000, author: 'EminGT', dateModified: '2026-10-26T10:00:00Z' },
    { projectId: 'bliss', slug: 'bliss', title: 'Bliss Shader', description: 'A fork of Chocapic13 with balanced performance and beauty.', categories: ['semi-realistic'], downloads: 2_150_000, author: 'X0nk', dateModified: '2026-10-17T14:00:00Z' },
    { projectId: 'solas', slug: 'solas', title: 'Solas Shader', description: 'Vibrant colors and soft lighting for vanilla worlds.', categories: ['fantasy'], downloads: 1_640_000, author: 'Septonious', dateModified: '2026-09-11T09:00:00Z' },
    { projectId: 'rethinking-voxels', slug: 'rethinking-voxels', title: 'Rethinking Voxels', description: 'Cutout voxel lighting with colored blocklight.', categories: ['realistic', 'heavy'], downloads: 1_280_000, author: 'gri573', dateModified: '2026-10-09T16:00:00Z' },
    { projectId: 'photon', slug: 'photon', title: "Photon's Shader", description: 'A lightweight shader focused on clouds and water.', categories: ['vanilla-like', 'potato-friendly'], downloads: 970_000, author: 'sixthsurge', dateModified: '2026-10-01T11:00:00Z' },
  ],
}

/** 按 id/slug 跨分类查找预览资源。 */
function findPreviewResource(id: string): (PreviewResource & { kind: string }) | null {
  for (const [kind, list] of Object.entries(PREVIEW_RESOURCES)) {
    const hit = list.find((r) => r.projectId === id || r.slug === id)
    if (hit) return { ...hit, kind }
  }
  return null
}

/** 生成预览资源的项目版本列表（3 条，含 primary 文件）。 */
function previewResourceVersions(slug: string, kind: string) {
  const loaders =
    kind === 'mod' ? ['fabric', 'forge'] : kind === 'shader' ? ['iris'] : kind === 'modpack' ? ['fabric'] : ['datapack']
  return [0, 1, 2].map((i) => ({
    id: `${slug}-1.${i}.0`,
    name: `${slug} 1.${i}.0`,
    version_number: `1.${i}.0`,
    game_versions: ['1.21.4', '1.21.1', '1.20.1'],
    loaders,
    date_published: '2026-10-15T12:00:00Z',
    downloads: 120_000 - i * 30_000,
    files: [
      {
        url: `https://preview.modrinth.com/${slug}-1.${i}.0.jar`,
        filename: `${slug}-1.${i}.0.jar`,
        primary: true,
      },
    ],
  }))
}

/** 浏览器预览的 fetch_json：拦截 Modrinth 搜索 / 详情 / 版本 URL 与加载器版本接口，其余返回占位。 */
function mockFetchJson(url: string): string {
  // Forge 版本列表：bmclapi2.bangbang93.com/forge/minecraft/{mcver}
  if (url.includes('bmclapi2.bangbang93.com/forge/minecraft/')) {
    return JSON.stringify(
      [0, 1, 2, 3].map((i) => ({ version: `54.${2 - Math.floor(i / 2)}.${i % 2 === 0 ? 22 - i : 20 - i}` })),
    )
  }

  // OptiFine 版本列表：bmclapi2.bangbang93.com/optifine/{mcver}
  if (url.includes('bmclapi2.bangbang93.com/optifine/')) {
    return JSON.stringify([
      { type: 'HD U', patch: 'H1' },
      { type: 'HD U', patch: 'I7' },
      { type: 'Ultra', patch: 'M9' },
    ])
  }

  // Fabric 加载器列表：meta.fabricmc.net/v2/versions/loader/{mcver}
  if (url.includes('meta.fabricmc.net/v2/versions/loader/')) {
    return JSON.stringify(
      ['0.16.14', '0.16.9', '0.15.11'].map((v) => ({ loader: { version: v } })),
    )
  }

  // NeoForge 版本列表：maven.neoforged.net（前端按 MC 版本段过滤）
  if (url.includes('maven.neoforged.net')) {
    return JSON.stringify({ versions: ['21.4.136', '21.4.117', '21.4.95', '20.1.112'] })
  }

  // 分类标签：/tag/category（按 project_type 供筛选下拉使用）
  if (url.includes('/tag/category')) {
    const tags = [
      ['mod', ['adventure', 'decoration', 'library', 'magic', 'optimization', 'storage', 'technology', 'utility', 'worldgen']],
      ['modpack', ['adventure', 'challenging', 'kitchen-sink', 'magic', 'multiplayer', 'optimization', 'quests', 'technology']],
      ['resourcepack', ['decoration', 'fonts', 'models', 'realism', 'themed', 'tweaks', 'utility', 'vanilla-like']],
      ['shader', ['bloom', 'cartoon', 'lighting', 'realistic', 'reflections', 'shadows', 'water']],
      ['datapack', ['adventure', 'game-mechanics', 'library', 'mobs', 'optimization', 'utility', 'worldgen']],
      ['world', ['adventure', 'buildings', 'fantasy', 'parkour', 'realistic']],
    ] as const
    return JSON.stringify(
      tags.flatMap(([projectType, names]) =>
        names.map((name) => ({ name, project_type: projectType, header: '', icon: '' })),
      ),
    )
  }

  // 搜索：/search?query=...&facets=[[ "project_type:<kind>" ], ...]
  if (url.includes('/search?')) {
    const u = new URL(url)
    const facet = JSON.parse(u.searchParams.get('facets') ?? '[]') as string[][]
    const kind = facet[0]?.[0]?.split(':')[1] ?? ''
    const categories = facet
      .slice(1)
      .map((group) => group[0] ?? '')
      .filter((f) => f.startsWith('categories:'))
      .map((f) => f.slice('categories:'.length))
    const q = (u.searchParams.get('query') ?? '').trim().toLowerCase()
    const hits = (PREVIEW_RESOURCES[kind] ?? [])
      .filter((r) => !q || r.title.toLowerCase().includes(q) || r.slug.includes(q))
      .filter((r) => categories.length === 0 || categories.some((c) => r.categories.includes(c)))
      .map((r) => ({
        project_id: r.projectId,
        slug: r.slug,
        title: r.title,
        description: r.description,
        categories: r.categories,
        display_categories: r.categories,
        downloads: r.downloads,
        date_modified: r.dateModified,
        author: r.author,
        versions: ['1.21.4', '1.20.1', '1.16.5'],
      }))
    return JSON.stringify({ total_hits: hits.length, hits })
  }

  // 项目版本列表：/project/<id>/version
  const versions = url.match(/\/project\/([^/]+)\/version$/)
  if (versions) {
    const found = findPreviewResource(versions[1])
    if (found) return JSON.stringify(previewResourceVersions(found.slug, found.kind))
  }

  // 项目详情：/project/<id>
  const project = url.match(/\/project\/([^/]+)$/)
  if (project) {
    const found = findPreviewResource(project[1])
    if (found) {
      return JSON.stringify({
        id: found.projectId,
        slug: found.slug,
        title: found.title,
        description: found.description,
        categories: found.categories,
        display_categories: found.categories,
        downloads: found.downloads,
        date_modified: found.dateModified,
        author: { username: found.author },
        body: [
          `## 简介`,
          ``,
          `**${found.title}** —— 这是本地预览数据，用于在浏览器模式下验证页面布局与交互。`,
          ``,
          `### 特性`,
          ``,
          `- 覆盖分类：${found.categories.join('、')}`,
          `- 累计下载：${found.downloads.toLocaleString('zh-CN')}`,
          `- 维护者：${found.author}`,
          ``,
          `> 正式数据在 Tauri 环境下来自 Modrinth 实时接口。`,
        ].join('\n'),
      })
    }
  }

  return JSON.stringify({ preview: true })
}

async function mockCall<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  switch (command) {
    case 'get_data_dir':
      return '/preview/.aelux' as T
    case 'get_core_version':
      return 'preview' as T
    case 'get_os_info':
      return { name: 'windows', version: '10.0.19045', arch: 'x86_64' } as T
    case 'fetch_minecraft_manifest':
      return {
        latest: { release: '1.21.4', snapshot: '25w45a' },
        versions: PREVIEW_VERSIONS,
      } as T
    case 'auth_start_device_flow':
      resetMsPollCount()
      return {
        userCode: 'MOCK-CODE-1234',
        verificationUri: 'https://microsoft.com/link',
        interval: 1,
        expiresIn: 900,
        deviceCode: 'mock-device-code',
      } as T
    case 'auth_poll_device_flow':
      msPollCount += 1
      if (msPollCount <= 2) throw new Error('等待用户完成授权')
      return {
        msaId: 'preview-msa-id',
        username: 'PreviewPlayer',
        uuid: '069a79f444e94726a5befca90e38aaf5',
        loggedInAt: String(Math.floor(Date.now() / 1000)),
      } as T
    case 'auth_logout':
      return null as T
    case 'fetch_json':
      return mockFetchJson(String(args?.url ?? '')) as T
    case 'download_file':
      await new Promise((r) => setTimeout(r, 600))
      return `/preview/${String(args?.dest ?? '')}` as T
    case 'get_instances':
      return previewInstances.slice() as T
    case 'create_instance':
      return {
        id: `preview-${Date.now()}`,
        name: String(args?.name ?? 'preview'),
        version: String(args?.version ?? '1.21.4'),
        loader: String(args?.loader ?? 'vanilla'),
        loaderVersion: null,
        icon: null,
        createdAt: new Date().toISOString(),
        lastPlayedAt: null,
        playtimeSecs: 0,
      } as T
    case 'delete_instance':
    case 'kv_set':
    case 'kv_remove':
    case 'save_config':
    case 'write_text':
    case 'minimize_window':
    case 'close_window':
    case 'open_external':
    case 'open_folder_in_explorer':
      if (command === 'open_external') window.open(String(args?.url ?? ''), '_blank', 'noopener')
      if (command === 'kv_set') localStorage.setItem(LS_PREFIX + String(args?.key), String(args?.value))
      if (command === 'kv_remove') localStorage.removeItem(LS_PREFIX + String(args?.key))
      return null as T
    case 'get_config':
      return {
        theme: 'light',
        language: 'zh-CN',
        javaPath: '',
        memoryMinMb: 512,
        memoryMaxMb: 4096,
        jvmArgs: [],
        gameArgs: [],
        gameWidth: 854,
        gameHeight: 480,
        downloadConcurrency: 8,
        hideOnLaunch: false,
      } as T
    case 'read_bundled_announcements':
      return '[]' as T
    case 'read_local_update':
      return '' as T
    default:
      console.warn(`[aelux preview] 未模拟的命令: ${command}`)
      return null as T
  }
}

/** 读取 kv（浏览器模式落 localStorage，与 mockCall 的写入对称）。 */
export async function kvGet(key: string): Promise<string | null> {
  if (isTauri) return call<string | null>('kv_get', { key })
  return localStorage.getItem(LS_PREFIX + key)
}
