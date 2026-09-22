/**
 * Uzum Seller OpenAPI klienti.
 *
 * Barcha so'rovlar `/api/uzum/...` orqali ketadi — dev'da Vite proxy,
 * production'da server/index.js uni Uzum API'ga uzatadi va Authorization
 * sarlavhasini qo'yadi. Token brauzerdan `X-Uzum-Token` da yuboriladi
 * (yoki serverning .env faylida saqlanadi va umuman yuborilmaydi).
 *
 * MUHIM: Uzum bir vaqtda ko'p so'rovni HTTP 429 bilan rad etadi. Shuning
 * uchun bu yerda navbat (concurrency limiti), 429 da qayta urinish va
 * bir xil GET so'rovlarni birlashtirish mexanizmi bor.
 */

const BASE = '/api/uzum'
const TOKEN_KEY = 'uzum.token'

/* ── Navbat sozlamalari ───────────────────────────────────────────── */

/** Bir vaqtda ketadigan so'rovlar soni */
const MAX_CONCURRENT = 3
/** So'rovlar orasidagi eng kam tanaffus (ms) */
const MIN_GAP_MS = 150
/** 429/503 da necha marta qayta urinish */
const MAX_RETRIES = 6
/** Birinchi qayta urinishgacha kutish (ms), keyin ikkilanadi */
const RETRY_BASE_MS = 600
/** Qayta urinishlar orasidagi eng uzoq kutish (ms) */
const RETRY_MAX_MS = 4000

/* ── Token saqlash ────────────────────────────────────────────────── */

let memoryToken = null

export function getToken() {
  if (memoryToken !== null) return memoryToken
  try {
    memoryToken = localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    memoryToken = ''
  }
  return memoryToken
}

export function setToken(token) {
  memoryToken = token || ''
  try {
    if (memoryToken) localStorage.setItem(TOKEN_KEY, memoryToken)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* private rejimda localStorage yopiq bo'lishi mumkin — xotiradagi nusxa yetarli */
  }
}

/* ── Xatolik turi ─────────────────────────────────────────────────── */

export class ApiError extends Error {
  constructor(message, { status = 0, code = null, details = null, url = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.url = url
  }

  /** i18n kaliti — UI shu asosda tarjima qilingan matn ko'rsatadi. */
  get i18nKey() {
    if (this.status === 401 || this.status === 403) return 'errors.unauthorized'
    if (this.status === 404) return 'errors.notFound'
    if (this.status === 429) return 'errors.rateLimit'
    if (this.status === 504 || this.code === 'UPSTREAM_TIMEOUT') return 'errors.timeout'
    if (this.status >= 500) return 'errors.server'
    if (this.status === 0) return 'errors.network'
    return null
  }
}

/* ── Query string ─────────────────────────────────────────────────── */

/**
 * Massivlarni takrorlanuvchi kalit sifatida yozadi: shopIds=1&shopIds=2
 * (Uzum API aynan shu formatni kutadi). null/undefined/'' o'tkazib yuboriladi.
 */
export function toQuery(params = {}) {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v !== null && v !== undefined && v !== '') sp.append(key, String(v))
      }
    } else {
      sp.append(key, String(value))
    }
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

/* ── So'rovlar navbati ────────────────────────────────────────────── */

let active = 0
let lastStart = 0
const waiting = []

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function pump() {
  if (active >= MAX_CONCURRENT || waiting.length === 0) return

  const gap = MIN_GAP_MS - (Date.now() - lastStart)
  if (gap > 0) {
    setTimeout(pump, gap)
    return
  }

  const job = waiting.shift()
  active++
  lastStart = Date.now()

  job.run().then(job.resolve, job.reject).finally(() => {
    active--
    pump()
  })
}

/** Funksiyani navbatga qo'yadi va natijasini qaytaradi. */
function enqueue(run) {
  return new Promise((resolve, reject) => {
    waiting.push({ run, resolve, reject })
    pump()
  })
}

/** Rate-limit holati — UI shu orqali «sekinlashtirilmoqda» deb ko'rsatishi mumkin */
export const rateLimit = {
  hits: 0,
  lastHitAt: 0,
  listeners: new Set(),
  subscribe(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  },
  notify() {
    this.hits++
    this.lastHitAt = Date.now()
    for (const fn of this.listeners) fn(this)
  },
}

/* ── Javobni normallashtirish ─────────────────────────────────────── */

/**
 * Uzum javoblari ikki xil: ba'zilari `{payload, errors, ...}` konvertida,
 * ba'zilari to'g'ridan-to'g'ri massiv/obyekt. Har ikkisini bir ko'rinishga keltiramiz.
 */
function unwrap(data, url) {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const errs = data.errors
    if (Array.isArray(errs) && errs.length) {
      const first = errs[0]
      throw new ApiError(first.message || first.code || 'API error', {
        status: 200,
        code: first.code,
        details: errs,
        url,
      })
    }
    if ('payload' in data) return data.payload
  }
  return data
}

/* ── Bir xil GET so'rovlarni birlashtirish va keshlash ────────────── */

const inFlight = new Map()

/** Qisqa muddatli kesh — sahifalar orasida yurganda qayta so'ramaslik uchun */
const CACHE_TTL_MS = 60_000
const cache = new Map()

function cacheGet(key) {
  const hit = cache.get(key)
  if (!hit) return undefined
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key)
    return undefined
  }
  return hit.value
}

function cacheSet(key, value) {
  cache.set(key, { at: Date.now(), value })
  // Cheksiz o'smasligi uchun eng eskisini olib tashlaymiz
  if (cache.size > 120) cache.delete(cache.keys().next().value)
}

/** Yozish amalidan keyin keshni tozalash — ma'lumot eskirmasligi uchun */
export function clearApiCache() {
  cache.clear()
}

/* ── Asosiy so'rov ────────────────────────────────────────────────── */

async function send(method, url, { body, signal, headers = {}, raw = false } = {}) {
  const token = getToken()

  const init = {
    method,
    signal,
    headers: {
      Accept: raw ? '*/*' : 'application/json, */*',
      ...(token ? { 'X-Uzum-Token': token } : {}),
      ...headers,
    },
  }

  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }

  for (let attempt = 0; ; attempt++) {
    let res
    try {
      res = await fetch(url, init)
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      throw new ApiError(err.message || 'Network error', { status: 0, url })
    }

    // Uzum so'rovlar chastotasini cheklaydi — biroz kutib qayta urinamiz
    if ((res.status === 429 || res.status === 503) && attempt < MAX_RETRIES) {
      rateLimit.notify()
      const retryAfter = Number(res.headers.get('retry-after'))
      const wait = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS) + Math.random() * 300
      await sleep(wait)
      if (signal?.aborted) {
        const e = new Error('Aborted')
        e.name = 'AbortError'
        throw e
      }
      continue
    }

    if (raw && res.ok) return res.blob()

    const contentType = res.headers.get('content-type') || ''
    let data = null
    if (contentType.includes('application/json')) {
      data = await res.json().catch(() => null)
    } else {
      const text = await res.text().catch(() => '')
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        data = text || null
      }
    }

    if (!res.ok) {
      const apiErr = Array.isArray(data?.errors) ? data.errors[0] : null
      throw new ApiError(
        apiErr?.message || data?.error || (typeof data === 'string' ? data : '') || `HTTP ${res.status}`,
        { status: res.status, code: apiErr?.code, details: data?.errors ?? data, url },
      )
    }

    return unwrap(data, url)
  }
}

/**
 * Chaqiruvchining `signal` i faqat SHU chaqiruvni uzadi — umumiy so'rovni emas.
 *
 * Bu React StrictMode uchun muhim: dev rejimda har bir effekt ikki marta
 * chaqiriladi va birinchisining tozalash funksiyasi signalni bekor qiladi.
 * Agar umumiy so'rov o'sha signalga bog'langan bo'lsa, hali ham ekranda
 * turgan ikkinchi chaqiruvchi ham ma'lumotsiz qolardi.
 */
function detachable(promise, signal) {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(abortError())

  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError())
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

function abortError() {
  const e = new Error('Aborted')
  e.name = 'AbortError'
  return e
}

async function request(method, path, { query, body, signal, headers = {}, raw = false } = {}) {
  const url = `${BASE}${path}${toQuery(query)}`

  // GET so'rovlari bir xil bo'lsa — bittasini kutamiz, ikkinchisini yubormaymiz
  const dedupeKey =
    method === 'GET' && !raw ? `${url}|${headers['Accept-Language'] || ''}` : null

  if (dedupeKey) {
    const running = inFlight.get(dedupeKey)
    if (running) return detachable(running, signal)

    const cached = cacheGet(dedupeKey)
    if (cached !== undefined) return cached
  }

  // Har qanday yozish amali keshni eskirtiradi
  if (method !== 'GET') clearApiCache()

  // Umumiy GET so'rovi hech bir chaqiruvchining signaliga bog'lanmaydi —
  // shunda bitta komponent yopilgani boshqasining ma'lumotini o'chirmaydi.
  const promise = enqueue(() =>
    send(method, url, { body, signal: dedupeKey ? undefined : signal, headers, raw }),
  )

  if (dedupeKey) {
    inFlight.set(dedupeKey, promise)
    promise
      .then((value) => cacheSet(dedupeKey, value))
      .catch(() => {})
      .finally(() => inFlight.delete(dedupeKey))
  }

  return detachable(promise, signal)
}

export const api = {
  get: (path, opts) => request('GET', path, opts),
  post: (path, opts) => request('POST', path, opts),
  put: (path, opts) => request('PUT', path, opts),
  del: (path, opts) => request('DELETE', path, opts),
  /** PDF va boshqa binar javoblar uchun */
  blob: (path, opts) => request('GET', path, { ...opts, raw: true }),
}
