#!/usr/bin/env node
/**
 * 生成 launcher-update.json（随 Release 上传，客户端自动更新清单）。
 *
 * 字段风格与 fetch-core.mjs 的内核 manifest 对齐（camelCase / sha256）：
 *   { schema, channel, version, pubDate, notes, file, sha256, size,
 *     exeFile?, exeSha256?, exeSize? }
 *
 * `file` 始终是 ZIP（旧客户端只认 ZIP）；同时传入 `--exe` 时额外写入裸 exe
 * 字段，新客户端会优先下载 exe，旧客户端继续用 ZIP，实现平滑过渡。
 *
 * 渠道判定：--channel 显式指定，否则 tag 含 "beta"（如 v0.2.0-beta.1）→ dev 渠道，
 * 否则 release 渠道（与 release.yml 的渠道后缀规则一致）。
 *
 * 用法：node scripts/make-update-manifest.mjs --zip <path> [--exe <path>] --tag <v0.2.0> [--notes <text>] [--out <path>]
 */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'

function getArg(name) {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null
}

function sha256File(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    pipeline(createReadStream(path), hash)
      .then(() => resolve(hash.digest('hex')))
      .catch(reject)
  })
}

async function main() {
  const zip = getArg('--zip')
  const exe = getArg('--exe')
  const tag = getArg('--tag')
  if (!zip || !tag) {
    console.error('用法: node scripts/make-update-manifest.mjs --zip <path> [--exe <path>] --tag <v0.2.0> [--notes <text>] [--out <path>]')
    process.exit(1)
  }

  const info = await stat(zip)
  const channel = getArg('--channel') ?? (/beta/i.test(tag) ? 'dev' : 'release')
  const manifest = {
    schema: 1,
    channel,
    version: tag.replace(/^v/, ''),
    pubDate: new Date().toISOString(),
    notes: getArg('--notes') ?? '',
    file: basename(zip),
    sha256: await sha256File(zip),
    size: info.size,
  }

  // 可选裸 exe：新客户端优先它，旧客户端忽略这些字段继续用 ZIP
  if (exe) {
    const exeInfo = await stat(exe)
    manifest.exeFile = basename(exe)
    manifest.exeSha256 = await sha256File(exe)
    manifest.exeSize = exeInfo.size
  }

  const out = getArg('--out') ?? join(dirname(zip), 'launcher-update.json')
  await writeFile(out, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`[make-update-manifest] ${channel} ${manifest.version} (${manifest.file}, ${info.size} bytes)`)
  console.log(`[make-update-manifest] sha256 ${manifest.sha256}`)
  if (manifest.exeFile) {
    console.log(`[make-update-manifest] exe ${manifest.exeFile} (${manifest.exeSize} bytes)`)
    console.log(`[make-update-manifest] exe sha256 ${manifest.exeSha256}`)
  }
  console.log(`[make-update-manifest] -> ${out}`)
}

main().catch((e) => {
  console.error('[make-update-manifest]', e.message)
  process.exit(1)
})
