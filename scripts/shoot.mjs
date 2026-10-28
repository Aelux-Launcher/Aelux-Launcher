/**
 * 逐页截图脚本（仅用于开发期核对布局，不参与产品构建）。
 *
 * 用法：node scripts/shoot.mjs [baseUrl] [outDir]
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const base = process.argv[2] ?? 'http://127.0.0.1:5180/'
const outDir = process.argv[3] ?? '.shots'

await mkdir(outDir, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
})
const page = await ctx.newPage()

const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[console] ${m.text()}`)
})
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))

await page.goto(base, { waitUntil: 'networkidle' })
await page.waitForTimeout(900)

/** 截当前整窗 */
async function shot(name) {
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${outDir}/${name}.png` })
  console.log(`shot: ${name}`)
}

/** 点左栏某一项（按文本） */
async function clickNav(text) {
  const el = page.locator('.alx-nav-item', { hasText: text }).first()
  if (await el.count()) {
    await el.click()
    await page.waitForTimeout(500)
    return true
  }
  console.log(`  nav not found: ${text}`)
  return false
}

/** 点顶栏标签 */
async function clickTab(text) {
  const el = page.locator('.alx-tab', { hasText: text }).first()
  if (await el.count()) {
    await el.click()
    await page.waitForTimeout(600)
    return true
  }
  console.log(`  tab not found: ${text}`)
  return false
}

await shot('01-home')

await clickTab('下载')
await shot('02-download-vanilla')

// 下载页左栏切到 Mod
await clickNav('Mod')
await page.waitForTimeout(1200)
await shot('03-download-mod')

await clickTab('设置')
await shot('04-settings-launch')

await clickNav('个性化')
await shot('05-settings-personal')

await clickNav('其他')
await shot('06-settings-other')

await clickTab('更多')
await shot('07-more-help')

await clickNav('关于与鸣谢')
await shot('08-more-about')

// 回到启动页，进「版本选择」子页
await clickTab('启动')
await page.waitForTimeout(400)
const selBtn = page.locator('button', { hasText: '版本选择' }).first()
if (await selBtn.count()) {
  await selBtn.click()
  await page.waitForTimeout(900)
  await shot('09-select')
} else {
  console.log('  版本选择 button not found')
}

// 进实例设置页
const gear = page.locator('.alx-iconbtn').first()
if (await gear.count()) {
  await gear.click()
  await page.waitForTimeout(900)
  await shot('10-instance-overview')
  await clickNav('设置')
  await shot('11-instance-setup')
  await clickNav('Mod 管理')
  await shot('12-instance-mod')
  await clickNav('导出')
  await shot('13-instance-export')
}

console.log('\n--- console errors ---')
console.log(errors.length ? errors.join('\n') : '(none)')

await browser.close()
