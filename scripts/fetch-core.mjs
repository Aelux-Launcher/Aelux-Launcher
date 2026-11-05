#!/usr/bin/env node
/**
 * 拉取 aelux-core 动态库（release-ffi 打包前的内核就位脚本）。
 *
 * 数据源（按优先级）：
 *   1. --manifest <path> 指定的本地 manifest.json
 *   2. CORE_MANIFEST_URL 指定的远端 manifest（R2 桶 / 私有 Release 均可）
 *
 * 鉴权：内核托管在**私有 GitHub Release** 时，设置 CORE_DOWNLOAD_TOKEN
 * （fine-grained PAT，对内核仓库有 Contents 只读权限）即可通过下载；
 * 公开可读的存储（R2 桶等）无需此变量。
 *
 * 流程：读 manifest → 校验 core_version 与 api_abi_hash →
 *       下载对应平台 cdylib → sha256 校验 → 落到 src-tauri/lib/<platform>/。
 *
 * 用法：node scripts/fetch-core.mjs [--manifest <url-or-path>] [--out <dir>]
 */
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const srcTauri = join(here, '..')

/** 私有 Release 资产的鉴权头（可选）。 */
function authHeaders() {
  const token = process.env.CORE_DOWNLOAD_TOKEN
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** 解析平台键（与 build.rs / manifest.json 的键一致）。 */
function platformKey() {
  const { platform, arch } = process
  if (platform === 'win32') return arch === 'arm64' ? 'windows-arm64' : 'windows-x64'
  if (platform === 'darwin') return arch === 'arm64' ? 'macos-arm64' : 'macos-x64'
  if (platform === 'linux') return arch === 'arm64' ? 'linux-arm64' : 'linux-x64'
  throw new Error(`不支持的构建平台: ${platform}/${arch}`)
}

function libFileName() {
  switch (process.platform) {
    case 'win32':
      return 'aelux_core.dll'
    case 'darwin':
      return 'libaelux_core.dylib'
    default:
      return 'libaelux_core.so'
  }
}

async function fetchText(urlOrPath) {
  if (/^https?:\/\//.test(urlOrPath)) {
    const res = await fetch(urlOrPath, { headers: authHeaders() })
    if (!res.ok) throw new Error(`下载 manifest 失败: ${res.status} ${urlOrPath}`)
    return res.text()
  }
  return readFileSync(urlOrPath, 'utf8')
}

async function downloadTo(url, dest, expectedSha256) {
  const res = await fetch(url, { headers: authHeaders() })
  if (!res.ok) throw new Error(`下载失败: ${res.status} ${url}`)
  mkdirSync(dirname(dest), { recursive: true })
  const hash = createHash('sha256')
  const file = createWriteStream(dest)
  for await (const chunk of res.body) {
    hash.update(chunk)
    file.write(chunk)
  }
  file.end()
  const actual = hash.digest('hex')
  if (expectedSha256 && actual !== expectedSha256) {
    throw new Error(`sha256 校验失败: 期望 ${expectedSha256}, 实际 ${actual}`)
  }
  return actual
}

async function main() {
  const args = process.argv.slice(2)
  const getArg = (name, fallback) => {
    const i = args.indexOf(name)
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback
  }
  const manifestSource =
    getArg('--manifest', null) ?? process.env.CORE_MANIFEST_URL ?? null
  if (!manifestSource) {
    console.error(
      '缺少 manifest 来源：使用 --manifest <url-or-path> 或设置 CORE_MANIFEST_URL 环境变量。',
    )
    process.exit(1)
  }

  const manifest = JSON.parse(await fetchText(manifestSource))
  const platform = platformKey()
  const entry = manifest[platform]
  if (!entry?.url) throw new Error(`manifest 缺少平台条目: ${platform}`)

  const outDir = getArg('--out', join(srcTauri, 'lib', platform))
  const dest = join(outDir, libFileName())

  // 本地已有 → 直接使用（本地打包测试免下载）
  if (existsSync(dest)) {
    console.log(`[fetch-core] 本地已存在 ${dest}，跳过下载（删除后可强制重新拉取）`)
    return
  }

  const sha = await downloadTo(entry.url, dest, entry.sha256)
  console.log(
    `[fetch-core] ${libFileName()} @ core ${manifest.core_version} (abi ${manifest.api_abi_hash}) -> ${dest}`,
  )
  console.log(`[fetch-core] sha256 校验通过: ${sha}`)
}

main().catch((e) => {
  console.error('[fetch-core]', e.message)
  process.exit(1)
})
