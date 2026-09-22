/**
 * Formatlash yordamchilari.
 * Barcha funksiyalar `lang` argumentini qabul qiladi ('uz' | 'ru' | 'en').
 */

const LOCALES = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-US' }

export const locale = (lang) => LOCALES[lang] || LOCALES.uz

/* ===== Pul ====================================================== */

/**
 * Uzum barcha summalarni butun so'mda qaytaradi (tiyinsiz).
 * @returns {string} masalan "1 250 000 so'm"
 */
export function money(value, lang = 'uz', { compact = false, currency = true } = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  const n = Number(value)
  const nf = new Intl.NumberFormat(locale(lang), {
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact && Math.abs(n) >= 10000 ? 'compact' : 'standard',
  })
  const unit = { uz: "so'm", ru: 'сум', en: 'UZS' }[lang] || "so'm"
  return currency ? `${nf.format(n)} ${unit}` : nf.format(n)
}

/** Oddiy son — 1 234 */
export function num(value, lang = 'uz') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return new Intl.NumberFormat(locale(lang)).format(Number(value))
}

/** Foiz — 12,5 % */
export function percent(value, lang = 'uz', digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return `${new Intl.NumberFormat(locale(lang), { maximumFractionDigits: digits }).format(Number(value))} %`
}

/* ===== Sana ===================================================== */

/**
 * Uzum sanalari ikki xil keladi: ISO satr yoki epoch millisekund (raqam).
 * Ikkalasini ham qabul qilamiz.
 */
export function toDate(value) {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'number') {
    // 10 xonali qiymat — sekund, 13 xonali — millisekund
    const ms = value < 1e11 ? value * 1000 : value
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** 28.08.2026 */
export function date(value, lang = 'uz') {
  const d = toDate(value)
  if (!d) return '—'
  return new Intl.DateTimeFormat(locale(lang), { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}

/** 28.08.2026, 14:30 */
export function dateTime(value, lang = 'uz') {
  const d = toDate(value)
  if (!d) return '—'
  return new Intl.DateTimeFormat(locale(lang), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

/** 14:30 */
export function time(value, lang = 'uz') {
  const d = toDate(value)
  if (!d) return '—'
  return new Intl.DateTimeFormat(locale(lang), { hour: '2-digit', minute: '2-digit' }).format(d)
}

/** "3 kun oldin" / "через 2 часа" — Intl.RelativeTimeFormat orqali */
export function relative(value, lang = 'uz') {
  const d = toDate(value)
  if (!d) return '—'
  const diff = d.getTime() - Date.now()
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat(locale(lang), { numeric: 'auto' })
  const units = [
    ['year', 31536e6],
    ['month', 2592e6],
    ['day', 864e5],
    ['hour', 36e5],
    ['minute', 6e4],
  ]
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit)
  }
  return rtf.format(Math.round(diff / 1000), 'second')
}

/**
 * Muddat tugashiga qancha qolgani — buyurtmani qabul qilish/yetkazish uchun.
 * @returns {{ms: number, overdue: boolean, urgent: boolean, text: string}|null}
 */
export function deadline(value, lang = 'uz') {
  const d = toDate(value)
  if (!d) return null
  const ms = d.getTime() - Date.now()
  return {
    ms,
    overdue: ms < 0,
    urgent: ms >= 0 && ms < 6 * 36e5, // 6 soatdan kam qolgan
    text: relative(d, lang),
  }
}

/** <input type="date"> uchun YYYY-MM-DD */
export function toInputDate(value) {
  const d = toDate(value)
  if (!d) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Sana satridan epoch ms — kun boshi yoki oxiri */
export function fromInputDate(str, endOfDay = false) {
  if (!str) return undefined
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return undefined
  if (endOfDay) d.setHours(23, 59, 59, 999)
  else d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Bugundan N kun oldin (epoch ms) */
export function daysAgo(n) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d.getTime()
}

/* ===== Fayllar ================================================== */

/**
 * Uzum PDF hujjatlarni base64 satr sifatida qaytaradi
 * (FbsInvoiceDocumentDto.document, SellerOrderLabelDto.document[]).
 */
export function base64ToBlob(b64, type = 'application/pdf') {
  const clean = String(b64).replace(/^data:[^;]+;base64,/, '')
  const bin = atob(clean)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}

/** Blob'ni yuklab olish */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** PDF'ni yangi oynada ochish (chop etish uchun qulay) */
export function openBlob(blob) {
  const url = URL.createObjectURL(blob)
  const w = window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return w
}

/* ===== Matn ===================================================== */

export function truncate(str, max = 60) {
  if (!str) return ''
  return str.length > max ? `${str.slice(0, max - 1)}…` : str
}

/** Bo'sh qiymatlar uchun bir xil ko'rinish */
export const dash = (v) => (v === null || v === undefined || v === '' ? '—' : v)

/** Sinf nomlarini birlashtirish (clsx o'rniga — qo'shimcha bog'liqliksiz) */
export function cx(...parts) {
  return parts.flat(Infinity).filter(Boolean).join(' ')
}

/** Mahalliy kalendar sana kaliti (UTC emas) — kun bo'yicha guruhlash uchun */
export function dayKey(value) {
  const d = toDate(value)
  if (!d) return null
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/* ===== Buyurtma muammolari ====================================== */

/** Buyurtma yig'ish bosqichida "qotib qolgan" deb hisoblanadigan kunlar */
export const STUCK_DAYS = 5

/** Qabul punktida mijoz olib ketmagan deb hisoblanadigan kunlar */
export const PICKUP_DAYS = 5

/** Yo'lda (yetkazishda) haddan ortiq qolgan deb hisoblanadigan kunlar */
export const TRANSIT_DAYS = 7

/** Statuslar bo'yicha guruhlar — muammo turlarini aniqlashda ishlatiladi */
const AT_POINT_STATUSES = ['ACCEPTED_AT_DP', 'DELIVERED', 'DELIVERED_TO_CUSTOMER_DELIVERY_POINT']
const IN_TRANSIT_STATUSES = ['PENDING_DELIVERY', 'DELIVERING']
const CLOSED_STATUSES = ['COMPLETED', 'CANCELED', 'RETURNED']

/** Kunlarda farq (musbat = o'tgan vaqt) */
const daysBetween = (value, now = Date.now()) => {
  const d = toDate(value)
  return d ? (now - d.getTime()) / 864e5 : null
}

/**
 * Buyurtmadagi muammolarni aniqlaydi.
 *
 * Uzum API muammoli buyurtmalar uchun alohida filtr bermaydi, shuning uchun
 * status va muddatlardan hisoblaymiz. Aniqlanadigan turlar:
 *
 *   overdue         qabul muddati o'tgan (CREATED, acceptUntil < hozir)
 *   stuck           tugallanmagan — CREATED/PACKING da 5 kundan ortiq
 *   deliveryOverdue yetkazish muddati o'tgan (deliverUntil < hozir, yopilmagan)
 *   inTransit       yo'lda qotib qolgan — DELIVERING/PENDING_DELIVERY da 7 kundan ortiq
 *   notPickedUp     o'z vaqtida olinmagan — punktda 5 kundan ortiq yotibdi
 *   cancelling      bekor qilinish jarayonida (PENDING_CANCELLATION)
 *   returned        qaytarilgan (RETURNED)
 *
 * @returns {string[]} muammo kodlari; bo'sh massiv — muammo yo'q
 */
export function orderProblems(order) {
  if (!order) return []
  const problems = []
  const now = Date.now()
  const status = order.status

  if (status === 'CREATED') {
    const until = toDate(order.acceptUntil)
    if (until && until.getTime() < now) problems.push('overdue')
  }

  if (status === 'CREATED' || status === 'PACKING') {
    const age = daysBetween(order.dateCreated, now)
    if (age !== null && age > STUCK_DAYS) problems.push('stuck')
  }

  // Yetkazish muddati — buyurtma hali yopilmagan bo'lsagina muammo
  if (!CLOSED_STATUSES.includes(status)) {
    const until = toDate(order.deliverUntil)
    if (until && until.getTime() < now) problems.push('deliveryOverdue')
  }

  if (IN_TRANSIT_STATUSES.includes(status)) {
    const since = daysBetween(order.deliveringDate ?? order.dateUpdated ?? order.dateCreated, now)
    if (since !== null && since > TRANSIT_DAYS) problems.push('inTransit')
  }

  if (AT_POINT_STATUSES.includes(status)) {
    const since = daysBetween(
      order.deliveredToDeliveryPointDate ?? order.deliveryDate ?? order.acceptedDate ?? order.dateUpdated,
      now,
    )
    if (since !== null && since > PICKUP_DAYS) problems.push('notPickedUp')
  }

  if (status === 'PENDING_CANCELLATION') problems.push('cancelling')
  if (status === 'RETURNED') problems.push('returned')

  return problems
}

/* ===== Moliya maydonlari ======================================== */

/**
 * Sotuv summasi.
 *
 * `/v1/finance/orders` javobida maydon `sellPrice` deb keladi, swaggerda esa
 * `sellerPrice` deb hujjatlashtirilgan (SellerOrderItemDto). Ikkalasini ham
 * qabul qilamiz, aks holda tushum nol bo'lib qoladi.
 */
export function itemRevenue(item) {
  if (!item) return 0
  return Number(item.sellPrice ?? item.sellerPrice) || 0
}

/* ===== Dev yordamchilari ======================================== */

/**
 * So'rov parametrlarini o'qiladigan ko'rinishga keltiradi (dev belgisi uchun).
 * Massivlar takrorlanuvchi kalit sifatida yoziladi — Uzum API shunday kutadi.
 */
export function toQueryPreview(params = {}) {
  const parts = []
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '') continue
    if (Array.isArray(v)) {
      if (!v.length) continue
      parts.push(`${k}=${v.join(`&${k}=`)}`)
    } else {
      parts.push(`${k}=${v}`)
    }
  }
  return parts.length ? `?${parts.join('&')}` : ''
}

/**
 * Uzun summa StatCard ichiga sig'ishi uchun shrift o'lchamini tanlaydi.
 * Qisqartirilgan ko'rinish o'rniga to'liq raqam ko'rsatiladi.
 */
export function valueSizeClass(value) {
  const len = String(value ?? '').length
  if (len <= 12) return 'text-[22px]'
  if (len <= 16) return 'text-[19px]'
  if (len <= 21) return 'text-[16px]'
  return 'text-[14px]'
}

/** Oy kaliti — 2026-08 */
export function monthKey(value) {
  const d = toDate(value)
  if (!d) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Oy nomlari.
 *
 * Chrome'da `uz-UZ` uchun `Intl` oy nomini «M08» ko'rinishida qaytaradi,
 * shuning uchun o'zbekcha nomlar qo'lda yozilgan.
 */
const UZ_MONTHS = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'Iyun',
  'Iyul',
  'Avgust',
  'Sentabr',
  'Oktabr',
  'Noyabr',
  'Dekabr',
]

/** «Avgust 2026» */
export function monthLabel(key, lang = 'uz') {
  if (!key) return '—'
  const [y, m] = key.split('-').map(Number)
  if (lang === 'uz') return `${UZ_MONTHS[m - 1] ?? m} ${y}`
  const s = new Intl.DateTimeFormat(locale(lang), { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Grafik o'qi uchun qisqa sana — «28.08» (uz da Intl «M08» beradi) */
export function shortDate(value, lang = 'uz') {
  const d = toDate(value)
  if (!d) return ''
  const p = (n) => String(n).padStart(2, '0')
  if (lang === 'uz') return `${p(d.getDate())}.${p(d.getMonth() + 1)}`
  return new Intl.DateTimeFormat(locale(lang), { day: '2-digit', month: 'short' }).format(d)
}
