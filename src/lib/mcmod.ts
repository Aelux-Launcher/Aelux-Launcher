/**
 * MC百科（mcmod.cn）中文名查询：
 *   用项目英文名搜索，取第一条结果并解析「[缩写] 中文名 (English)」。
 *   · 有中文 → 中文为主、英文为辅；
 *   · 无中文 → 英文为主，括号里的缩写（如 YACL）作辅。
 * 结果缓存到 localStorage；列表按需异步补齐，失败不影响检索本身。
 */
import { reactive } from 'vue'
import { call } from './bridge'

export interface McmodInfo {
  /** 主名称：有中文翻译时为中文，否则为英文。 */
  primary: string
  /** 次名称（英文或缩写），无则不显示。 */
  secondary?: string
  /** MC百科条目地址。 */
  url: string
}

const CACHE_KEY = 'aelux.mcmod.v1'
const HIT_TTL = 30 * 24 * 60 * 60 * 1000
const MISS_TTL = 24 * 60 * 60 * 1000
const MAX_CONCURRENT = 2
const MIN_GAP_MS = 300
const REQUEST_TIMEOUT = 10_000

interface CacheEntry {
  primary?: string
  secondary?: string
  url?: string
  ts: number
}

const cache: Record<string, CacheEntry> = loadCache()
const infos = reactive<Record<string, McmodInfo>>({})
const misses = new Set<string>()
const pending = new Set<string>()
const queue: string[] = []
let running = 0

/** 已查询到的 MC百科信息；未查到返回 undefined。 */
export function mcmodInfo(title: string): McmodInfo | undefined {
  return infos[keyOf(title)]
}

/** 请求补齐某个项目的中文名（去重 + 限流，不阻塞调用方）。 */
export function ensureMcmod(title: string): void {
  const key = keyOf(title)
  if (!title.trim() || infos[key] || misses.has(key) || pending.has(key)) return
  pending.add(key)
  queue.push(title)
  pump()
}

function pump(): void {
  while (running < MAX_CONCURRENT && queue.length > 0) {
    const title = queue.shift()
    if (!title) break
    running += 1
    void lookup(title).finally(() => {
      running -= 1
      pump()
    })
  }
}

async function lookup(title: string): Promise<void> {
  const key = keyOf(title)
  const entry = cache[key]
  const now = Date.now()
  if (entry && now - entry.ts < (entry.primary ? HIT_TTL : MISS_TTL)) {
    if (entry.primary) {
      infos[key] = { primary: entry.primary, secondary: entry.secondary, url: entry.url ?? '' }
    } else {
      misses.add(key)
    }
    pending.delete(key)
    return
  }
  try {
    const info = await fetchInfo(title)
    if (info) {
      infos[key] = info
      cache[key] = { ...info, ts: now }
    } else {
      misses.add(key)
      cache[key] = { ts: now }
    }
    saveCache()
  } catch {
    misses.add(key)
  } finally {
    pending.delete(key)
  }
}

async function fetchInfo(title: string): Promise<McmodInfo | null> {
  await pace()
  const url = `https://search.mcmod.cn/s?key=${encodeURIComponent(baseTitle(title))}`
  const html = await withTimeout(call<string>('fetch_json', { url }), REQUEST_TIMEOUT)
  // 被限流时会返回缺少结果容器的页面：视为临时失败，不写入「未收录」缓存。
  if (!html.includes('search-result-list')) throw new Error('MC百科暂时不可用')
  return parseSearch(html, title)
}

function parseSearch(html: string, title: string): McmodInfo | null {
  const start = html.indexOf('<div class="result-item">')
  if (start < 0) return null
  const next = html.indexOf('<div class="result-item">', start + 1)
  const block = next > 0 ? html.slice(start, next) : html.slice(start)
  for (const match of block.matchAll(/<a[^>]+href="([^"]*\/class\/\d+\.html)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = plainText(match[2])
    if (!text) continue
    const parsed = parseTitleText(text, title)
    if (!parsed) continue
    const href = match[1]
    return { ...parsed, url: href.startsWith('//') ? `https:${href}` : href }
  }
  return null
}

function parseTitleText(text: string, title: string): { primary: string; secondary?: string } | null {
  const bracketMatch = text.match(/^\[([^\]]+)\]\s+([\s\S]*)$/)
  const bracket = bracketMatch?.[1]?.trim()
  const rest = (bracketMatch?.[2] ?? text).trim()
  const parenMatch = rest.match(/^(.+?)\s*\(([^()]+)\)$/)
  const main = (parenMatch?.[1] ?? rest).trim()
  const inside = parenMatch?.[2]?.trim()
  if (!main) return null

  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
  const base = norm(baseTitle(title))
  const candidates = [norm(main), inside ? norm(inside) : '']
  const matched = candidates.some(
    (value) => value === base || (base.length >= 4 && value.length >= 4 && (value.includes(base) || base.includes(value))),
  )
  if (!matched) return null

  if (/[\u3400-\u9fff]/.test(main)) {
    const english = inside || baseTitle(title)
    return { primary: main, secondary: norm(english) !== norm(main) ? english : undefined }
  }
  const alias = inside && norm(inside) !== norm(main) ? inside : bracket
  return { primary: main, secondary: alias && norm(alias) !== norm(main) ? alias : undefined }
}

/** 去掉末尾括号（Just Enough Items (JEI)）和预览序号，得到搜索词。 */
function baseTitle(title: string): string {
  const cleaned = title.replace(/\s*#\d+\s*$/, '').replace(/\s*[(（][^()（）]*[)）]\s*$/, '').trim()
  return cleaned || title.trim()
}

function keyOf(title: string): string {
  return title.trim().toLowerCase()
}

function plainText(html: string): string {
  return html
    .replace(/<\/em>\s*<em>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 请求节流：两次请求至少间隔 MIN_GAP_MS，避免被 MC百科限流。 */
let lastStarted = 0

async function pace(): Promise<void> {
  const wait = MIN_GAP_MS - (Date.now() - lastStarted)
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  lastStarted = Date.now()
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('MC百科查询超时')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function loadCache(): Record<string, CacheEntry> {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, CacheEntry>) : {}
  } catch {
    return {}
  }
}

function saveCache(): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // 存储不可用（隐私模式等）时忽略，内存缓存仍生效。
  }
}
