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
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const PORT = Number(process.env.PORT || 3000)
const API_BASE = (process.env.UZUM_API_BASE || 'https://api-seller.uzum.uz').replace(/\/+$/, '')
const API_PREFIX = process.env.UZUM_API_PREFIX || '/api/seller-openapi'
const SERVER_TOKEN = process.env.UZUM_API_TOKEN || ''
const ORIGINS = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const app = express()
app.disable('x-powered-by')
app.use(compression())
app.use(cors({ origin: ORIGINS.length ? ORIGINS : true, credentials: false }))

// Uzum javoblarining ba'zilari application/pdf, ba'zilari */* — shuning uchun
// tanani xom holda o'qiymiz va o'zgartirmasdan uzatamiz.
app.use('/api/uzum', express.raw({ type: '*/*', limit: '10mb' }))

/** Klientdan serverga uzatilishi mumkin bo'lgan sarlavhalar (allowlist). */
const FORWARD_HEADERS = ['content-type', 'accept', 'accept-language']

app.all('/api/uzum/*', async (req, res) => {
  const token = req.get('x-uzum-token') || SERVER_TOKEN
  if (!token) {
    return res.status(401).json({
      errors: [{ code: 'NO_TOKEN', message: 'API token berilmagan. Sozlamalarda tokenni kiriting yoki .env faylida UZUM_API_TOKEN ni to\'ldiring.' }],
    })
  }

  const suffix = req.originalUrl.replace(/^\/api\/uzum/, '')
  const url = `${API_BASE}${API_PREFIX}${suffix}`

  const headers = { Authorization: token }
  for (const h of FORWARD_HEADERS) {
    const v = req.get(h)
    if (v) headers[h] = v
  }

  const hasBody = !['GET', 'HEAD'].includes(req.method) && req.body?.length
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)

  try {
    const upstream = await fetch(url, {
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

    const buf = Buffer.from(await upstream.arrayBuffer())
    res.send(buf)
  } catch (err) {
    const aborted = err?.name === 'AbortError'
    res.status(aborted ? 504 : 502).json({
      errors: [{
        code: aborted ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR',
        message: aborted ? 'Uzum API javob bermadi (timeout).' : `Uzum API bilan bog'lanib bo'lmadi: ${err.message}`,
      }],
    })
  } finally {
    clearTimeout(timer)
  }
})

// Serverda token bor-yo'qligini bilish — UI login ekranini o'tkazib yuborishi mumkin
app.get('/api/config', (_req, res) => {
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
