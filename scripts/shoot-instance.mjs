/**
 * 实例页截图脚本：先在预览模式注入演示实例，再逐个标签页截图。
 *
 * 用法：node scripts/shoot-instance.mjs [baseUrl] [outDir]
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const base = process.argv[2] ?? 'http://127.0.0.1:5180/'
const outDir = process.argv[3] ?? '.shots'

await mkdir(outDir, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()

const errors = []
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('WebSocket')) errors.push(`[console] ${m.text()}`)
})
page.on('pageerror', (e) => {
  if (!e.message.includes('WebSocket')) errors.push(`[pageerror] ${e.message}`)
})

// 预览适配器的 get_instances 返回空数组，无法进入实例页。
// 这里在页面加载后拦截 invoke，让它返回演示实例。
await page.addInitScript(() => {
  const orig = window.__TAURI_INTERNALS__?.invoke
  window.__TAURI_INTERNALS__ = {
    ...(window.__TAURI_INTERNALS__ ?? {}),
    invoke: async (cmd, args) => {
      if (cmd === 'get_instances') {
        return [
          {
            id: 'demo-1',
            name: '[Fabric]方块酒馆[生电]',
            version: '1.21',
            loader: 'fabric',
          },
          {
            id: 'demo-2',
            name: 'Better MC [FABRIC] - BMC2',
            version: '1.21',
            loader: 'fabric',
          },
          {
            id: 'demo-3',
            name: '宝石世界',
            version: '1.20.1',
            loader: 'fabric',
          },
        ]
      }
      if (cmd === 'list_jres') {
        return [{ path: 'C:\\Java\\jdk-24\\bin\\java.exe', major: 24, version: '24.0.1' }]
      }
      return orig ? orig(cmd, args) : null
    },
  }
})

await page.goto(base, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

async function shot(name) {
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${outDir}/${name}.png` })
  console.log(`shot: ${name}`)
}

async function clickText(sel, text) {
  const el = page.locator(sel, { hasText: text }).first()
  if (await el.count()) {
    await el.click()
    await page.waitForTimeout(700)
    return true
  }
  console.log(`  not found: ${sel} / ${text}`)
  return false
}

// 首页：应有实例列表
await shot('20-home-with-instances')

// 进版本选择子页
await clickText('.alx-btn', '版本选择')
await shot('21-select')

// 点第一条实例进实例页
const first = page.locator('.alx-listitem').first()
if (await first.count()) {
  await first.click()
  await page.waitForTimeout(900)
  await shot('22-instance-overview')

  await clickText('.alx-nav-item', '设置')
  await shot('23-instance-setup')

  await clickText('.alx-nav-item', 'Mod 管理')
  await shot('24-instance-mod')

  await clickText('.alx-nav-item', '导出')
  await shot('25-instance-export')
} else {
  console.log('  未找到实例条目')
}

console.log('\n--- errors ---')
console.log(errors.length ? errors.join('\n') : '(none)')

await browser.close()
