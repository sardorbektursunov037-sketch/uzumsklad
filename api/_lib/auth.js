/**
 * Ilova kirish (login/parol) tekshiruvi.
 *
 * Foydalanuvchi endi xom Uzum API tokenini kiritmaydi — faqat login/parol
 * bilan kiradi. To'g'ri bo'lsa, server haqiqiy `UZUM_API_TOKEN`ni bir marta
 * qaytaradi va brauzer uni odatdagidek (`X-Uzum-Token`) ishlataveradi —
 * qolgan proxy/keshlash/qayta-urinish logikasi o'zgarmaydi.
 */
import { createHash, timingSafeEqual } from 'node:crypto'

/** Doim bir xil uzunlikdagi xesh bilan solishtiramiz — vaqt bo'yicha hujumdan himoya */
function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a ?? '')).digest()
  const hb = createHash('sha256').update(String(b ?? '')).digest()
  return timingSafeEqual(ha, hb)
}

/**
 * `.env` dagi APP_LOGIN / APP_PASSWORD bilan solishtiradi.
 *
 * Odatda `process.env`dan o'qiydi (Express va Vercel shu yerga joylaydi).
 * Vite dev-server esa `.env`ni `process.env`ga qo'ymaydi — shu sabab
 * kutilgan qiymatlarni tashqaridan (`loadEnv`dan) uzatish ham mumkin.
 */
export function checkCredentials(username, password, { expectedUser, expectedPass } = {}) {
  const user = expectedUser ?? process.env.APP_LOGIN ?? ''
  const pass = expectedPass ?? process.env.APP_PASSWORD ?? ''
  if (!user || !pass) return false
  return safeEqual(username, user) && safeEqual(password, pass)
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
