/**
 * Uzum Sklad — production proxy server.
 *
 * Nima uchun kerak:
 *   Uzum Seller OpenAPI (api-seller.uzum.uz) brauzerdan kelgan so'rovlar uchun
 *   CORS sarlavhalarini qaytarmaydi. Shu sababli barcha so'rovlar shu server
 *   orqali o'tkaziladi. Bundan tashqari, agar .env da UZUM_API_TOKEN berilgan
 *   bo'lsa, token umuman brauzerga tushmaydi.
 *
 * Ishga tushirish:  npm run start   (build + server)
 *                   npm run server  (faqat server)
 */
import 'dotenv/config'
import express from 'express'
import compression from 'compression'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ALLOWED_METHODS,
  FORWARD_HEADERS,
  MAX_BODY_BYTES,
  apiError,
  buildUpstreamUrl,
  clientIp,
  rateLimit,
  API_BASE,
  API_PREFIX,
} from '../api/_lib/proxy.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const PORT = Number(process.env.PORT || 3000)
const SERVER_TOKEN = process.env.UZUM_API_TOKEN || ''

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(compression())

/* ── Xavfsizlik sarlavhalari ──────────────────────────────────────── */

app.use((_req, res, next) => {
  res.setHeader('x-content-type-options', 'nosniff')
  res.setHeader('x-frame-options', 'DENY')
  res.setHeader('referrer-policy', 'no-referrer')
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()')
  res.setHeader('cross-origin-opener-policy', 'same-origin')
  res.setHeader(
    'content-security-policy',
    [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "form-action 'self'",
      "script-src 'self'",
      // Recharts va React inline uslub qo'yadi
      "style-src 'self' 'unsafe-inline'",
      // Mahsulot rasmlari Uzum CDN'idan keladi
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "worker-src 'self' blob:",
    ].join('; '),
  )
  next()
})

/* ── Uzum proxy ───────────────────────────────────────────────────── */

// Uzum javoblarining ba'zilari application/pdf, ba'zilari */* — shuning uchun
// tanani xom holda o'qiymiz va o'zgartirmasdan uzatamiz.
app.use('/api/uzum', express.raw({ type: '*/*', limit: MAX_BODY_BYTES }))

app.all('/api/uzum/*', async (req, res) => {
  res.setHeader('cache-control', 'no-store')

  if (!ALLOWED_METHODS.has(req.method)) {
    return res.status(405).json(apiError('METHOD_NOT_ALLOWED', 'Faqat GET va POST qabul qilinadi'))
  }

  const limit = rateLimit(clientIp(req))
  if (!limit.ok) {
    res.setHeader('retry-after', '60')
    return res.status(429).json(apiError('RATE_LIMITED', "So'rovlar juda ko'p. Biroz kuting."))
  }

  const built = buildUpstreamUrl(req.originalUrl)
  if (built.error) {
    return res.status(400).json(apiError('BAD_PATH', built.error))
  }

  const token = req.get('x-uzum-token') || SERVER_TOKEN
  if (!token) {
    return res
      .status(401)
      .json(apiError('NO_TOKEN', "API token berilmagan. Sozlamalarda tokenni kiriting yoki .env faylida UZUM_API_TOKEN ni to'ldiring."))
  }

  const headers = { Authorization: token }
  for (const h of FORWARD_HEADERS) {
    const v = req.get(h)
    if (v) headers[h] = v
  }

  const hasBody = req.method === 'POST' && req.body?.length
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)

  try {
    const upstream = await fetch(built.url, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      signal: controller.signal,
      redirect: 'follow',
    })

    res.status(upstream.status)
    const ct = upstream.headers.get('content-type')
    if (ct) res.set('content-type', ct)
    const cd = upstream.headers.get('content-disposition')
    if (cd) res.set('content-disposition', cd)

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
})

// Serverda token bor-yo'qligini bilish — UI login ekranini o'tkazib yuborishi mumkin
app.get('/api/config', (_req, res) => {
  res.setHeader('cache-control', 'no-store')
  res.json({ serverToken: Boolean(SERVER_TOKEN), apiBase: API_BASE + API_PREFIX })
})

// Qurilgan SPA
const dist = path.join(ROOT, 'dist')
app.use(express.static(dist, { maxAge: '1h', index: false }))
app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))

app.listen(PORT, () => {
  console.log(`\n  Uzum Sklad  →  http://localhost:${PORT}`)
  console.log(`  Proxy       →  ${API_BASE}${API_PREFIX}`)
  console.log(`  Token       →  ${SERVER_TOKEN ? 'serverda (.env)' : 'klientdan kutiladi'}\n`)
})
