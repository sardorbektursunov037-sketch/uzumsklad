/**
 * Login/parol tekshiruvi — Cloudflare Pages Functions versiyasi.
 *
 * Cloudflare Workers muhitida `node:crypto` kafolatlanmagan, shuning uchun
 * Web Crypto API (`crypto.subtle`) orqali SHA-256 xesh solishtiriladi —
 * `api/_lib/auth.js`dagi Node versiyasi bilan bir xil vazifa.
 */

async function sha256(text) {
  const data = new TextEncoder().encode(String(text ?? ''))
  const digest = await crypto.subtle.digest('SHA-256', data)
  return new Uint8Array(digest)
}

/** Doim bir xil uzunlikdagi baytlar bilan solishtiramiz — vaqt bo'yicha hujumdan himoya */
function timingSafeEqualBytes(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/** `env`dagi APP_LOGIN / APP_PASSWORD bilan solishtiradi */
export async function checkCredentials(username, password, env) {
  const expectedUser = env.APP_LOGIN || ''
  const expectedPass = env.APP_PASSWORD || ''
  if (!expectedUser || !expectedPass) return false

  const [userHash, expectedUserHash, passHash, expectedPassHash] = await Promise.all([
    sha256(username),
    sha256(expectedUser),
    sha256(password),
    sha256(expectedPass),
  ])

  return timingSafeEqualBytes(userHash, expectedUserHash) && timingSafeEqualBytes(passHash, expectedPassHash)
}

/** Login urinishlari uchun qattiqroq chegara — parol taxmin qilishning oldini oladi */
const WINDOW_MS = 5 * 60_000
const MAX_ATTEMPTS = 10
const buckets = new Map()

export function loginRateLimit(ip) {
  const now = Date.now()
  const hits = (buckets.get(ip) || []).filter((t) => now - t < WINDOW_MS)
  hits.push(now)
  buckets.set(ip, hits)

  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (!v.length || now - v[v.length - 1] > WINDOW_MS) buckets.delete(k)
    }
  }

  return { ok: hits.length <= MAX_ATTEMPTS }
}
