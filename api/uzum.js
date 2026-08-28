/**
 * Uzum Seller OpenAPI proxy — Vercel serverless funksiyasi.
 *
 * `server/index.js` bilan bir xil vazifani bajaradi, lekin Vercel'da
 * uzoq ishlaydigan Express serveri bo'lmaydi: har bir so'rov alohida
 * funksiya sifatida ishga tushadi.
 *
 * Marshrutlash: `vercel.json` dagi rewrite `/api/uzum/<yo'l>` ni
 * `/api/uzum?__path=<yo'l>` ga aylantiradi. Katalog ichidagi catch-all
 * (`[...path].js`) ko'p segmentli yo'llarni ishonchli ushlamagani uchun
 * shu aniq usul tanlangan.
 *
 *   brauzer  ->  /api/uzum/v1/shops?shopIds=1
 *   rewrite  ->  /api/uzum?__path=v1/shops&shopIds=1
 *   bu fayl  ->  https://api-seller.uzum.uz/api/seller-openapi/v1/shops?shopIds=1
 *                Authorization: <token>   (Bearer prefiksisiz)
 */
import {
  ALLOWED_METHODS,
  FORWARD_HEADERS,
  MAX_BODY_BYTES,
  apiError,
  buildUpstreamUrl,
  clientIp,
  rateLimit,
} from './_lib/proxy.js'

const SERVER_TOKEN = process.env.UZUM_API_TOKEN || ''

/** Ochiq deployda serverdagi token hammaga ma'lumot ochib qo'yadi — ataylab yoqilishi kerak */
const ALLOW_SERVER_TOKEN = process.env.ALLOW_SERVER_TOKEN === '1'

/** So'rov tanasini oladi (Vercel JSON tanani o'zi tahlil qilishi mumkin) */
async function getBody(req) {
  if (req.body !== undefined && req.body !== null && req.body !== '') {
    if (Buffer.isBuffer(req.body)) return req.body
    if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8')
    return Buffer.from(JSON.stringify(req.body), 'utf8')
  }

  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/** Rewrite qo'shgan `__path` ni ajratib, qolgan parametrlarni saqlab qoladi */
function originalPath(req) {
  const u = new URL(req.url, 'http://localhost')
  const path = u.searchParams.get('__path') || ''
  u.searchParams.delete('__path')
  const qs = u.searchParams.toString()
  return `/api/uzum/${path}${qs ? `?${qs}` : ''}`
}

export default async function handler(req, res) {
  // Bu manzil boshqa saytlardan chaqirilmasligi kerak — CORS sarlavhalari qo'yilmaydi
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')

  if (!ALLOWED_METHODS.has(req.method)) {
    res.status(405).json(apiError('METHOD_NOT_ALLOWED', 'Faqat GET va POST qabul qilinadi'))
    return
  }

  const limit = rateLimit(clientIp(req))
  if (!limit.ok) {
    res.setHeader('retry-after', '60')
    res.status(429).json(apiError('RATE_LIMITED', "So'rovlar juda ko'p. Biroz kuting."))
    return
  }

  const built = buildUpstreamUrl(originalPath(req))
  if (built.error) {
    res.status(400).json(apiError('BAD_PATH', built.error))
    return
  }

  const clientToken = req.headers['x-uzum-token']
  const token = clientToken || (ALLOW_SERVER_TOKEN ? SERVER_TOKEN : '')

  if (!token) {
    res.status(401).json(
      apiError(
        'NO_TOKEN',
        SERVER_TOKEN && !ALLOW_SERVER_TOKEN
          ? "Serverda token bor, lekin ochiq deployda o'chirilgan. Yoqish uchun ALLOW_SERVER_TOKEN=1 qo'ying yoki tokenni ilovada kiriting."
          : 'API token berilmagan. Sozlamalarda tokenni kiriting.',
      ),
    )
    return
  }

  const headers = { Authorization: token }
  for (const h of FORWARD_HEADERS) {
    const v = req.headers[h]
    if (v) headers[h] = v
  }

  let body
  if (req.method === 'POST') {
    try {
      body = await getBody(req)
    } catch {
      res.status(413).json(apiError('BODY_TOO_LARGE', "So'rov tanasi juda katta"))
      return
    }
    if (body.length && !headers['content-type']) headers['content-type'] = 'application/json'
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25_000)

  try {
    const upstream = await fetch(built.url, {
      method: req.method,
      headers,
      body: body && body.length ? body : undefined,
      signal: controller.signal,
      redirect: 'follow',
    })

    res.status(upstream.status)
    const ct = upstream.headers.get('content-type')
    if (ct) res.setHeader('content-type', ct)
    const cd = upstream.headers.get('content-disposition')
    if (cd) res.setHeader('content-disposition', cd)

    res.send(Buffer.from(await upstream.arrayBuffer()))
  } catch (err) {
    const aborted = err?.name === 'AbortError'
    res.status(aborted ? 504 : 502).json(
      apiError(
        aborted ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR',
        aborted ? 'Uzum API javob bermadi (timeout).' : "Uzum API bilan bog'lanib bo'lmadi.",
      ),
    )
  } finally {
    clearTimeout(timer)
  }
}
