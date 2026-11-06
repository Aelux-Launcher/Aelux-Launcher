/**
 * 启动器界面语言配置。
 *
 * 语言资源按 `<code>.ts` 命名放在 src/locales（如 zh-CN.ts），
 * 新增语言只需补齐语言文件并把 code 加入 SUPPORTED_LOCALES，
 * 未支持的语言一律回退到 zh-CN，不会出现空白界面。
 */
import zhCN from '../locales/zh-CN'

/** 语言包（新增语言按同结构补文件即可）。 */
export type Messages = Record<string, unknown>

/** 当前已提供语言包的语言。 */
export const SUPPORTED_LOCALES: readonly string[] = ['zh-CN']

/** 默认语言（系统语言无法匹配时使用）。 */
export const DEFAULT_LOCALE = 'zh-CN'

/** 「跟随系统」的偏好值。 */
export const SYSTEM_LANGUAGE_VALUE = 'system'

/** 支持的语言清单（code 即语言文件名）。 */
export const LOCALES: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文（台灣）' },
  { code: 'zh-HK', label: '繁體中文（香港）' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'ja-JP', label: '日本語' },
  { code: 'ko-KR', label: '한국어' },
  { code: 'th-TH', label: 'ไทย' },
  { code: 'vi-VN', label: 'Tiếng Việt' },
  { code: 'id-ID', label: 'Bahasa Indonesia' },
  { code: 'de-DE', label: 'Deutsch' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'es-ES', label: 'Español (España)' },
  { code: 'es-MX', label: 'Español (México)' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'ru-RU', label: 'Русский' },
  { code: 'tr-TR', label: 'Türkçe' },
  { code: 'ar-SA', label: 'العربية' },
]

/** 语言下拉选项：「跟随系统」+ 全部语言（未支持的语言标注）。 */
export const LAUNCHER_LANGUAGE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: SYSTEM_LANGUAGE_VALUE, label: '跟随系统（简体中文）' },
  ...LOCALES.map((l) => ({
    value: l.code,
    label: SUPPORTED_LOCALES.includes(l.code) ? l.label : `${l.label}（暂未支持）`,
  })),
]

/** 语言包表：键为语言 code。 */
const CATALOGS: Record<string, Messages> = {
  'zh-CN': zhCN,
}

/** 是否已提供该语言的语言包。 */
export function isLocaleSupported(code: string): boolean {
  return SUPPORTED_LOCALES.includes(code)
}

/**
 * 读取系统首选语言并匹配到受支持的语言：
 * 先精确匹配，再按主语言前缀匹配（如 zh-TW → zh-CN），都不中则用默认语言。
 */
export function detectSystemLocale(): string {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE
  const candidates = [...(navigator.languages ?? []), navigator.language]
  for (const tag of candidates) {
    if (!tag) continue
    if (isLocaleSupported(tag)) return tag
    const primary = tag.toLowerCase().split('-')[0]
    const hit = SUPPORTED_LOCALES.find((c) => c.toLowerCase().split('-')[0] === primary)
    if (hit) return hit
  }
  return DEFAULT_LOCALE
}

/** 把语言偏好（system 或具体 code）解析为实际生效的语言。 */
export function resolveLocale(preference: string): string {
  if (preference === SYSTEM_LANGUAGE_VALUE) return detectSystemLocale()
  return isLocaleSupported(preference) ? preference : DEFAULT_LOCALE
}

/** 应用语言：同步 <html lang>，供字体与排版规则使用。 */
export function applyLocale(code: string) {
  if (typeof document !== 'undefined') document.documentElement.lang = code
}

/** 取语言包（缺失时回退 zh-CN）。 */
export function getMessages(code: string): Messages {
  return CATALOGS[code] ?? zhCN
}
