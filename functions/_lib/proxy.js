/**
 * Uzum proxy uchun umumiy xavfsizlik qatlami — Cloudflare Pages Functions versiyasi.
 *
 * `api/_lib/proxy.js` bilan bir xil vazifani bajaradi (Vercel/Express uchun),
 * lekin Cloudflare Workers muhiti Node emas — bu yerda Fetch API (`Request`,
 * `Headers`) va `env` bog'lamalaridan foydalaniladi.
 */

export function apiBase(env) {
  return (env.UZUM_API_BASE || 'https://api-seller.uzum.uz').replace(/\/+$/, '')
}

export function apiPrefix(env) {
  return env.UZUM_API_PREFIX || '/api/seller-openapi'
}

export const ALLOWED_METHODS = new Set(['GET', 'POST'])
export const FORWARD_HEADERS = ['content-type', 'accept', 'accept-language']
export const MAX_BODY_BYTES = 2 * 1024 * 1024

export function apiError(code, message) {
  return { errors: [{ code, message }] }
}

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders },
  })
}

/** Cloudflare so'rovchi IP'ni `cf-connecting-ip`da beradi */
export function clientIp(request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

/** Bitta IP uchun oynadagi so'rovlar chegarasi */
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 240
const buckets = new Map()

/** Worker instansiyasi issiq turgancha ishlaydi — mutlaq chegara emas, qo'pol suiiste'molni to'xtatadi */
export function rateLimit(ip) {
  const now = Date.now()
  const hits = (buckets.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS)
  hits.push(now)
  buckets.set(ip, hits)

  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (!v.length || now - v[v.length - 1] > RATE_WINDOW_MS) buckets.delete(k)
    }
  }

  return { ok: hits.length <= RATE_MAX }
}

/**
 * `/api/uzum/...` dan Uzum manzilini quradi va uni tekshiradi.
 * @returns {{url: string} | {error: string}}
 */
export function buildUpstreamUrl(env, pathAndQuery) {
  const BASE = apiBase(env)
  const PREFIX = apiPrefix(env)
  const suffix = pathAndQuery.replace(/^\/api\/uzum/, '') || '/'

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
    url = new URL(BASE + PREFIX + suffix)
  } catch {
    return { error: 'Manzilni qurib bo‘lmadi' }
  }

  const allowed = new URL(BASE + PREFIX)
  if (url.origin !== allowed.origin || !url.pathname.startsWith(allowed.pathname)) {
    return { error: 'Yo‘l ruxsat etilgan doiradan tashqarida' }
  }

  const rest = url.pathname.slice(allowed.pathname.length)
  if (!/^\/v[123]\//.test(rest)) {
    return { error: 'Faqat /v1, /v2, /v3 yo‘llariga ruxsat berilgan' }
  }

  return { url: url.toString() }
}
