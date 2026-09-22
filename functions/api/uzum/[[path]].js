/**
 * Uzum Seller OpenAPI proxy — Cloudflare Pages Function.
 *
 * `[[path]]` — `/api/uzum/*` ostidagi har qanday yo'lni ushlaydi
 * (masalan `/api/uzum/v1/shops` → `context.params.path = ['v1', 'shops']`).
 *
 *   brauzer  ->  /api/uzum/v1/shops?shopIds=1
 *   bu fayl  ->  https://api-seller.uzum.uz/api/seller-openapi/v1/shops?shopIds=1
 *                Authorization: <token>   (Bearer prefiksisiz)
 */
import { ALLOWED_METHODS, FORWARD_HEADERS, MAX_BODY_BYTES, apiError, buildUpstreamUrl, clientIp, json, rateLimit } from '../../_lib/proxy.js'

export async function onRequest({ request, env }) {
  if (!ALLOWED_METHODS.has(request.method)) {
    return json(apiError('METHOD_NOT_ALLOWED', 'Faqat GET va POST qabul qilinadi'), 405)
  }

  const limit = rateLimit(clientIp(request))
  if (!limit.ok) {
    return json(apiError('RATE_LIMITED', "So'rovlar juda ko'p. Biroz kuting."), 429, { 'retry-after': '60' })
  }

  const url = new URL(request.url)
  const built = buildUpstreamUrl(env, url.pathname + url.search)
  if (built.error) {
    return json(apiError('BAD_PATH', built.error), 400)
  }

  const token = request.headers.get('x-uzum-token') || env.UZUM_API_TOKEN || ''
  if (!token) {
    return json(apiError('NO_TOKEN', 'API token berilmagan. Sozlamalarda tokenni kiriting.'), 401)
  }

  const upstreamHeaders = { Authorization: token }
  for (const h of FORWARD_HEADERS) {
    const v = request.headers.get(h)
    if (v) upstreamHeaders[h] = v
  }

  let body
  if (request.method === 'POST') {
    const buf = await request.arrayBuffer()
    if (buf.byteLength > MAX_BODY_BYTES) {
      return json(apiError('BODY_TOO_LARGE', "So'rov tanasi juda katta"), 413)
    }
    if (buf.byteLength) body = buf
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25_000)

  try {
    const upstream = await fetch(built.url, {
      method: request.method,
      headers: upstreamHeaders,
      body,
      signal: controller.signal,
    })

    const headers = new Headers({ 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
    const ct = upstream.headers.get('content-type')
    if (ct) headers.set('content-type', ct)
    const cd = upstream.headers.get('content-disposition')
    if (cd) headers.set('content-disposition', cd)

    return new Response(upstream.body, { status: upstream.status, headers })
  } catch (err) {
    const aborted = err?.name === 'AbortError'
    return json(
      apiError(
        aborted ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR',
        aborted ? 'Uzum API javob bermadi (timeout).' : "Uzum API bilan bog'lanib bo'lmadi.",
      ),
      aborted ? 504 : 502,
    )
  } finally {
    clearTimeout(timer)
  }
}
