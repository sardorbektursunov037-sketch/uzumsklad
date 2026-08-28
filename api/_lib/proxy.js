/**
 * Uzum proxy uchun umumiy xavfsizlik qatlami.
 *
 * `api/uzum/[...path].js` (Vercel) va `server/index.js` (Express) shu
 * qoidalarni birgalikda ishlatadi — ikki joyda ikki xil xatti-harakat
 * bo'lib qolmasligi uchun.
 */

export const API_BASE = (process.env.UZUM_API_BASE || 'https://api-seller.uzum.uz').replace(/\/+$/, '')
export const API_PREFIX = process.env.UZUM_API_PREFIX || '/api/seller-openapi'

/** Uzum API'da faqat shu ikki metod ishlatiladi */
export const ALLOWED_METHODS = new Set(['GET', 'POST'])

/** Klientdan yuqoriga uzatiladigan sarlavhalar (boshqalari tashlab yuboriladi) */
export const FORWARD_HEADERS = ['content-type', 'accept', 'accept-language']

/** So'rov tanasining eng katta hajmi */
export const MAX_BODY_BYTES = 2 * 1024 * 1024

/** Bitta IP uchun oynadagi so'rovlar chegarasi */
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 240

const buckets = new Map()

/**
 * Oddiy siljuvchi oyna. Serverless'da har bir instansiya o'z hisobini yuritadi —
 * mutlaq chegara emas, lekin qo'pol suiiste'molni to'xtatadi.
 */
export function rateLimit(ip) {
  const now = Date.now()
  const hits = (buckets.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS)
  hits.push(now)
  buckets.set(ip, hits)

  // Xotira cheksiz o'smasligi uchun
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (!v.length || now - v[v.length - 1] > RATE_WINDOW_MS) buckets.delete(k)
    }
  }

  return { ok: hits.length <= RATE_MAX, remaining: Math.max(0, RATE_MAX - hits.length) }
}

/** So'rovchi IP — Vercel `x-forwarded-for` orqali beradi */
export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim()
  return req.socket?.remoteAddress || 'unknown'
}

/**
 * `/api/uzum/...` dan Uzum manzilini quradi va uni tekshiradi.
 *
 * `..` yoki kodlangan variantlari orqali boshqa yo'lga o'tib ketishning
 * oldini olish uchun yakuniy manzil `API_BASE + API_PREFIX` ichida
 * qolishi majburiy.
 *
 * @returns {{url: string} | {error: string}}
 */
export function buildUpstreamUrl(rawUrl) {
  const suffix = rawUrl.replace(/^\/api\/uzum/, '') || '/'

  // Yo'lda `..` bo'lishi mumkin emas
  let decoded = suffix
  try {
    decoded = decodeURIComponent(suffix)
  } catch {
    return { error: 'Yo‘l noto‘g‘ri kodlangan' }
  }
  if (decoded.includes('..') || decoded.includes('\\')) {
    return { error: 'Yo‘lda ruxsat etilmagan belgilar bor' }
  }

  let url
  try {
    url = new URL(API_BASE + API_PREFIX + suffix)
  } catch {
    return { error: 'Manzilni qurib bo‘lmadi' }
  }

  const allowed = new URL(API_BASE + API_PREFIX)
  if (url.origin !== allowed.origin || !url.pathname.startsWith(allowed.pathname)) {
    return { error: 'Yo‘l ruxsat etilgan doiradan tashqarida' }
  }

  // Faqat spetsifikatsiyadagi versiyalangan yo'llar
  const rest = url.pathname.slice(allowed.pathname.length)
  if (!/^\/v[123]\//.test(rest)) {
    return { error: 'Faqat /v1, /v2, /v3 yo‘llariga ruxsat berilgan' }
  }

  return { url: url.toString() }
}

/** Xatoni ilova kutadigan ko'rinishda qaytaradi */
export function apiError(code, message) {
  return { errors: [{ code, message }] }
}
