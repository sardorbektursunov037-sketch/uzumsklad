/**
 * Uzum Seller OpenAPI — barcha endpointlar (35 ta, 8 bo'lim).
 * Manba: https://api-seller.uzum.uz/api/seller-openapi/swagger/api-docs
 *
 * Har bir funksiya oxirgi argument sifatida `{ signal }` qabul qiladi —
 * komponent unmount bo'lganda so'rovni bekor qilish uchun.
 */
import { api } from './client'
import { ORDER_STATUSES } from './constants'
import { toDate } from '../utils/format'

/**
 * Sana parametrlari Uzum API'ga SEKUNDDA yuboriladi.
 *
 * Swaggerda tur `integer(int64)` deb ko'rsatilgan, birlik esa yozilmagan.
 * Amalda tekshirildi: millisekund yuborilganda API bo'sh ro'yxat qaytaradi,
 * sekund yuborilganda esa to'g'ri filtrlaydi. Ilova ichida hamma joyda
 * millisekund ishlatiladi, chegarada shu yerda o'giriladi.
 */
const apiDate = (ms) => (ms === null || ms === undefined || ms === '' ? undefined : Math.floor(Number(ms) / 1000))

/* ===== Shop ===================================================== */

/** GET /v1/shops — sotuvchining o'z do'konlari ro'yxati */
export const getShops = (opts) => api.get('/v1/shops', opts)

/* ===== Product ================================================== */

/**
 * GET /v1/product/shop/{shopId} — do'kon mahsulotlari (SKU bilan)
 * @param {object} p size*, page* (0 dan), searchQuery, sortBy, order, productRank, filter
 */
export const getProducts = (shopId, p = {}, opts) =>
  api.get(`/v1/product/shop/${shopId}`, {
    ...opts,
    query: {
      size: p.size ?? 20,
      page: p.page ?? 0,
      searchQuery: p.searchQuery,
      sortBy: p.sortBy,
      order: p.order,
      productRank: p.productRank,
      filter: p.filter,
    },
  })

/** POST /v1/product/{shopId}/sendPriceData — SKU narxlarini o'zgartirish */
export const updatePrices = (shopId, body, opts) =>
  api.post(`/v1/product/${shopId}/sendPriceData`, { ...opts, body })

/** GET /v1/product/barcodes/types — etiketka o'lchamlari ma'lumotnomasi */
export const getBarcodeTypes = (opts) => api.get('/v1/product/barcodes/types', opts)

/** POST /v1/product/shop/{shopId}/barcodes/print — SKU etiketkalarini chop etish (PDF blob) */
export const printBarcodes = (shopId, body, opts) =>
  api.post(`/v1/product/shop/${shopId}/barcodes/print`, { ...opts, body, raw: true })

/* ===== Stocks (FBS qoldiqlari) ================================== */

/**
 * GET /v3/fbs/sku/stocks — SKU qoldiqlari (sahifalab)
 * @param {object} p page (0 dan), size (1-100), skuIdFrom (kursor)
 */
export const getStocks = (p = {}, opts) =>
  api.get('/v3/fbs/sku/stocks', {
    ...opts,
    query: { page: p.page, size: p.size ?? 50, skuIdFrom: p.skuIdFrom },
  })

/** GET /v2/fbs/sku/stocks — eskirgan versiya (moslik uchun qoldirilgan) */
export const getStocksLegacy = (opts) => api.get('/v2/fbs/sku/stocks', opts)

/**
 * POST /v2/fbs/sku/stocks — qoldiqlarni yangilash
 * @param {Array<{barcode: string, amount: number}>} skuAmountList barcode majburiy maydon
 */
export const updateStocks = (skuAmountList, opts) =>
  api.post('/v2/fbs/sku/stocks', { ...opts, body: { skuAmountList } })

/* ===== Buyurtmalar (FBS / DBS) ================================== */

/**
 * GET /v2/fbs/orders — sotuvchi buyurtmalari
 * @param {object} p shopIds*, status, scheme (FBS|DBS), dateFrom, dateTo (ms), page, size (<=50)
 */
export const getOrders = (p = {}, opts) =>
  api.get('/v2/fbs/orders', {
    ...opts,
    query: {
      shopIds: p.shopIds,
      status: p.status,
      scheme: p.scheme,
      dateFrom: apiDate(p.dateFrom),
      dateTo: apiDate(p.dateTo),
      page: p.page ?? 0,
      size: p.size ?? 20,
    },
  })

/**
 * GET /v2/fbs/orders — barcha statuslar bo'yicha.
 *
 * Uzum `status` ko'rsatilmaganda BO'SH ro'yxat qaytaradi (swaggerda
 * parametr ixtiyoriy deb belgilangan, amalda esa majburiy). Shuning uchun
 * «barchasi» rejimida har bir status alohida so'raladi va natijalar
 * yaratilgan sana bo'yicha birlashtiriladi.
 *
 * @param {object} p  getOrders parametrlari + `perStatus` (har status uchun soni)
 */
export async function getOrdersAllStatuses(p = {}, opts) {
  const statuses = p.statuses?.length ? p.statuses : ORDER_STATUSES
  const perStatus = p.perStatus ?? 20
  const forbiddenFlag = { value: false }

  const results = await Promise.all(
    statuses.map((status) =>
      getOrders({ ...p, status, page: 0, size: perStatus }, opts).catch((err) => {
        if (err?.name === 'AbortError') throw err
        if (err?.status === 403 || err?.status === 401) forbiddenFlag.value = true
        return null
      }),
    ),
  )

  const orders = []
  const byStatus = {}
  const failed = []
  let totalAmount = 0

  results.forEach((r, i) => {
    const status = statuses[i]
    if (!r) {
      // So'rov muvaffaqiyatsiz — «0» deb ko'rsatmaymiz, noma'lum deb belgilaymiz
      byStatus[status] = null
      failed.push(status)
      return
    }
    const list = r.orders || []
    orders.push(...list)
    const n = Number(r.totalAmount)
    byStatus[status] = Number.isFinite(n) ? n : list.length
    totalAmount += byStatus[status]
  })

  orders.sort((a, b) => (toDate(b.dateCreated)?.getTime() || 0) - (toDate(a.dateCreated)?.getTime() || 0))
  return {
    orders,
    totalAmount,
    byStatus,
    failed,
    partial: failed.length > 0,
    forbidden: forbiddenFlag.value,
  }
}

/** GET /v2/fbs/orders/count — buyurtmalar soni */
export const getOrdersCount = (p = {}, opts) =>
  api.get('/v2/fbs/orders/count', {
    ...opts,
    query: { shopIds: p.shopIds, status: p.status, dateFrom: apiDate(p.dateFrom), dateTo: apiDate(p.dateTo) },
  })

/**
 * GET /v2/fbs/orders/count — har bir status bo'yicha haqiqiy son.
 *
 * Ro'yxat javobidagi `totalAmount` so'ralgan sahifa hajmi bilan cheklangan,
 * shuning uchun aniq sonni alohida `count` endpointidan olamiz.
 * Muvaffaqiyatsiz so'rov `null` bo'ladi — UI uni «?» deb ko'rsatadi,
 * nol deb emas.
 */
export async function getOrdersCountByStatus(p = {}, opts) {
  const statuses = p.statuses?.length ? p.statuses : ORDER_STATUSES

  let forbidden = false

  const results = await Promise.all(
    statuses.map((status) =>
      getOrdersCount({ ...p, status }, opts).catch((err) => {
        if (err?.name === 'AbortError') throw err
        // 403 — token bu do'konga ruxsat bermaydi (chegara emas)
        if (err?.status === 403 || err?.status === 401) forbidden = true
        return null
      }),
    ),
  )

  const byStatus = {}
  const failed = []
  let total = 0

  results.forEach((r, i) => {
    const status = statuses[i]
    const n = typeof r === 'number' ? r : Number(r)
    if (r === null || !Number.isFinite(n)) {
      byStatus[status] = null
      failed.push(status)
      return
    }
    byStatus[status] = n
    total += n
  })

  return { byStatus, failed, total, forbidden }
}

/** GET /v1/fbs/order/{orderId} — bitta buyurtma tafsiloti */
export const getOrder = (orderId, opts) => api.get(`/v1/fbs/order/${orderId}`, opts)

/** POST /v1/fbs/order/{orderId}/confirm — buyurtmani tasdiqlash */
export const confirmOrder = (orderId, opts) => api.post(`/v1/fbs/order/${orderId}/confirm`, opts)

/** POST /v1/fbs/order/{orderId}/cancel — buyurtmani bekor qilish */
export const cancelOrder = (orderId, { reason, comment } = {}, opts) =>
  api.post(`/v1/fbs/order/${orderId}/cancel`, { ...opts, body: { reason, comment } })

/** POST /v1/fbs/order/{orderId}/identifier — tovarlarga identifikator biriktirish */
export const setOrderIdentifiers = (orderId, items, opts) =>
  api.post(`/v1/fbs/order/${orderId}/identifier`, { ...opts, body: { items } })

/** GET /v1/fbs/order/return-reasons — bekor qilish / qaytarish sabablari */
export const getReturnReasons = (opts) => api.get('/v1/fbs/order/return-reasons', opts)

/** GET /v1/fbs/order/{orderId}/labels/print — FBS buyurtma etiketkasi (base64 PDF) */
export const getOrderLabel = (orderId, size = 'LARGE', opts) =>
  api.get(`/v1/fbs/order/${orderId}/labels/print`, { ...opts, query: { size } })

/* ----- DBS ----- */

/** POST /v1/dbs/order/{orderId}/delivering — DBS buyurtmani yetkazishga berish */
export const dbsDelivering = (orderId, opts) => api.post(`/v1/dbs/order/${orderId}/delivering`, opts)

/** POST /v1/dbs/order/{orderId}/completed — DBS buyurtma topshirilganini tasdiqlash */
export const dbsCompleted = (orderId, issueCode, opts) =>
  api.post(`/v1/dbs/order/${orderId}/completed`, { ...opts, query: { issueCode } })

/** POST /v1/dbs/order/{orderId}/refund — DBS buyurtma bo'yicha qaytarish yaratish */
export const dbsRefund = (orderId, opts) => api.post(`/v1/dbs/order/${orderId}/refund`, opts)

/* ===== FBS yuk xatlari (invoices) =============================== */

/** GET /v1/fbs/invoice — FBS yuk xatlari ro'yxati */
export const getFbsInvoices = (p = {}, opts) =>
  api.get('/v1/fbs/invoice', {
    ...opts,
    query: { statuses: p.statuses, page: p.page ?? 0, size: p.size ?? 20 },
    headers: p.lang ? { 'Accept-Language': p.lang } : undefined,
  })

/** POST /v1/fbs/invoice — yuk xati yaratish */
export const createFbsInvoice = (body, lang, opts) =>
  api.post('/v1/fbs/invoice', { ...opts, body, headers: lang ? { 'Accept-Language': lang } : undefined })

/** GET /v1/fbs/invoice/{invoiceId} — yuk xati tafsiloti */
export const getFbsInvoice = (invoiceId, lang, opts) =>
  api.get(`/v1/fbs/invoice/${invoiceId}`, {
    ...opts,
    headers: lang ? { 'Accept-Language': lang } : undefined,
  })

/** GET /v1/fbs/invoice/{invoiceId}/orders — yuk xatidagi buyurtmalar */
export const getFbsInvoiceOrders = (invoiceId, lang, opts) =>
  api.get(`/v1/fbs/invoice/${invoiceId}/orders`, {
    ...opts,
    headers: lang ? { 'Accept-Language': lang } : undefined,
  })

/** GET /v1/fbs/invoice/{invoiceId}/closing-documents — qabul dalolatnomasi (base64 PDF) */
export const getFbsInvoiceClosingDocs = (invoiceId, opts) =>
  api.get(`/v1/fbs/invoice/${invoiceId}/closing-documents`, opts)

/** GET /v1/fbs/invoice/{invoiceId}/print — yetkazib berish dalolatnomasi (base64 PDF) */
export const printFbsInvoice = (invoiceId, opts) => api.get(`/v1/fbs/invoice/${invoiceId}/print`, opts)

/** POST /v1/fbs/invoice/{invoiceId}/update-content — yuk xati tarkibini o'zgartirish */
export const updateFbsInvoiceContent = (invoiceId, body, lang, opts) =>
  api.post(`/v1/fbs/invoice/${invoiceId}/update-content`, {
    ...opts,
    body,
    headers: lang ? { 'Accept-Language': lang } : undefined,
  })

/** POST /v1/fbs/invoice/{invoiceId}/cancel — yuk xatini bekor qilish */
export const cancelFbsInvoice = (invoiceId, lang, opts) =>
  api.post(`/v1/fbs/invoice/${invoiceId}/cancel`, {
    ...opts,
    headers: lang ? { 'Accept-Language': lang } : undefined,
  })

/** GET /v1/fbs/invoice/dop/drop-off-points — mos qabul punktlari */
export const getDropOffPoints = (customerOrderIds, lang, opts) =>
  api.get('/v1/fbs/invoice/dop/drop-off-points', {
    ...opts,
    query: { customerOrderIds },
    headers: lang ? { 'Accept-Language': lang } : undefined,
  })

/** GET /v1/fbs/invoice/dop/time-slot — punkt bo'yicha bo'sh vaqt oraliqlari */
export const getTimeSlots = (dopId, sellerOrderIds, lang, opts) =>
  api.get('/v1/fbs/invoice/dop/time-slot', {
    ...opts,
    query: { dopId, sellerOrderIds },
    headers: lang ? { 'Accept-Language': lang } : undefined,
  })

/** POST /v1/fbs/invoice/dop/time-slot — punkt va vaqt oralig'ini yangilash */
export const updateTimeSlot = (body, lang, opts) =>
  api.post('/v1/fbs/invoice/dop/time-slot', {
    ...opts,
    body,
    headers: lang ? { 'Accept-Language': lang } : undefined,
  })

/* ===== FBO yuk xatlari (yetkazib berish) ======================== */

/** GET /v1/shop/{shopId}/invoice — do'kon bo'yicha yetkazib berish xatlari */
export const getShopInvoices = (shopId, p = {}, opts) =>
  api.get(`/v1/shop/${shopId}/invoice`, { ...opts, query: { page: p.page ?? 0, size: p.size ?? 20 } })

/** GET /v1/shop/{shopId}/invoice/products — yuk xati tarkibi */
export const getInvoiceProducts = (shopId, invoiceId, opts) =>
  api.get(`/v1/shop/${shopId}/invoice/products`, { ...opts, query: { invoiceId } })

/** GET /v1/invoice — barcha yuk xatlari (SKU ro'yxati bilan) */
export const getAllInvoices = (p = {}, opts) =>
  api.get('/v1/invoice', { ...opts, query: { page: p.page ?? 0, size: p.size ?? 20 } })

/* ===== Qaytarishlar ============================================= */

/** GET /v1/shop/{shopId}/return — do'kon bo'yicha qaytarishlar */
export const getShopReturns = (shopId, p = {}, opts) =>
  api.get(`/v1/shop/${shopId}/return`, { ...opts, query: { page: p.page ?? 0, size: p.size ?? 20 } })

/** GET /v1/shop/{shopId}/return/{returnId} — qaytarish tarkibi */
export const getShopReturn = (shopId, returnId, opts) =>
  api.get(`/v1/shop/${shopId}/return/${returnId}`, opts)

/** GET /v1/return — sotuvchining barcha qaytarishlari */
export const getReturns = (p = {}, opts) =>
  api.get('/v1/return', {
    ...opts,
    query: { returnId: p.returnId, page: p.page ?? 0, size: p.size ?? 20 },
  })

/* ===== Moliya =================================================== */

/**
 * GET /v1/finance/orders — sotuvlar ro'yxati
 * @param {object} p shopIds*, page, size, group, dateFrom, dateTo, statuses
 */
export const getFinanceOrders = (p = {}, opts) =>
  api.get('/v1/finance/orders', {
    ...opts,
    query: {
      shopIds: p.shopIds,
      page: p.page ?? 0,
      size: p.size ?? 20,
      group: p.group,
      dateFrom: apiDate(p.dateFrom),
      dateTo: apiDate(p.dateTo),
      statuses: p.statuses,
    },
  })

/** GET /v1/finance/expenses — sotuvchi xarajatlari */
export const getExpenses = (p = {}, opts) =>
  api.get('/v1/finance/expenses', {
    ...opts,
    query: {
      page: p.page ?? 0,
      size: p.size ?? 20,
      shopId: p.shopId,
      shopIds: p.shopIds,
      dateFrom: apiDate(p.dateFrom),
      dateTo: apiDate(p.dateTo),
      sources: p.sources,
    },
  })
