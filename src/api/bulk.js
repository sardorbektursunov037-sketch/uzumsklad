/**
 * Hisobotlar uchun «barcha sahifani yuklab olish» qatlami.
 *
 * Uzum API hamma ro'yxatni sahifalab qaytaradi, hisobot esa butun davrni
 * talab qiladi. Shuning uchun bu yerda sahifalar ketma-ket so'raladi va
 * bitta massivga yig'iladi. Har bir funksiya `capped` bayrog'ini qaytaradi —
 * chegaraga yetilgan bo'lsa UI foydalanuvchini ogohlantiradi, ya'ni raqamlar
 * jimgina to'liqsiz bo'lib qolmaydi.
 */
import {
  getFinanceOrders,
  getExpenses,
  getAllInvoices,
  getShopReturns,
  getStocks,
  getOrders,
  getProducts,
} from './endpoints'
import { toDate } from '../utils/format'

/**
 * Vazifalarni cheklangan parallellik bilan bajaradi.
 *
 * `client.js` dagi navbat bir vaqtda nechta so'rov ketishini boshqaradi,
 * lekin yuklovchilar so'rovlarni birin-ketin yuborsa, o'sha navbat bo'sh
 * turadi va har sahifa uchun to'liq javob kutiladi. Shuning uchun sahifalar
 * shu yerda birdan navbatga tashlanadi.
 */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let cursor = 0

  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++
      out[i] = await fn(items[i], i)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/** Nechta sahifa/bo'lak bir vaqtda so'ralsin */
const PARALLEL = 3

/** [from, to) oralig'idagi butun sonlar */
const range = (from, to) => Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i)

/** Bir so'rovda nechtadan olinadi va ko'pi bilan necha sahifa */
export const FINANCE_PAGE = 100
export const FINANCE_MAX_PAGES = 30

/** Bir kun millisekundda */
const MS_DAY = 864e5

/** Bitta oynada nechta yozuv sig'adi */
const WINDOW_CAP = FINANCE_PAGE * FINANCE_MAX_PAGES

/** Boshlang'ich bo'lak uzunligi — bir oy */
const CHUNK_DAYS = 30

/** Xavfsizlik chegarasi: bo'laklar soni shundan oshmaydi */
const MAX_CHUNKS = 240

/**
 * Bitta oynadagi sahifalarni yig'adi.
 *
 * Oynaga chegaradan ko'p yozuv to'g'ri kelsa, oyna ikkiga bo'linadi — lekin
 * ATIGI BESH DARAJAGACHA. Bo'linish chuqurligi cheklanmasa, yozuvlar bir
 * necha kunga to'plangan hollarda so'rovlar soni geometrik o'sib ketadi.
 */
async function collectWindow(params, from, to, signal, acc, onProgress, depth = 0) {
  const { shopIds, statuses } = params

  const first = await getFinanceOrders(
    { shopIds, page: 0, size: FINANCE_PAGE, dateFrom: from, dateTo: to, statuses },
    { signal },
  )
  const total = first?.totalElements ?? null
  const batch = first?.orderItems || []

  if (total !== null && total > WINDOW_CAP && to - from > MS_DAY && depth < 5) {
    const mid = from + Math.floor((to - from) / 2)
    await collectWindow(params, from, mid, signal, acc, onProgress, depth + 1)
    await collectWindow(params, mid + 1, to, signal, acc, onProgress, depth + 1)
    return
  }

  acc.push(...batch)
  onProgress?.(acc.length, acc.expectedTotal ?? null)
  if (batch.length < FINANCE_PAGE) return

  // Umumiy son ma'lum — qolgan sahifalarni birdan so'raymiz
  const pages = total === null ? FINANCE_MAX_PAGES : Math.ceil(total / FINANCE_PAGE)
  const rest = range(1, Math.min(pages, FINANCE_MAX_PAGES))

  await mapLimit(rest, PARALLEL, async (page) => {
    const res = await getFinanceOrders(
      { shopIds, page, size: FINANCE_PAGE, dateFrom: from, dateTo: to, statuses },
      { signal },
    )
    acc.push(...(res?.orderItems || []))
    onProgress?.(acc.length, acc.expectedTotal ?? null)
  })
}

/**
 * `/v1/finance/orders` — davrdagi BARCHA sotuv pozitsiyalari.
 *
 * Uzum bitta so'rov oynasida 30 sahifadan (3000 yozuv) ortig'ini bermaydi.
 * Yozuv ko'p bo'lsa davr OYLIK bo'laklarga bo'linadi va har bo'lak alohida
 * so'raladi — bo'laklar soni shu bilan chegaralanadi (3.5 yil ≈ 42 bo'lak).
 * Agar biror oyga ham 3000 dan ortiq yozuv to'g'ri kelsa, o'sha oy ichida
 * qo'shimcha ikkiga bo'linadi.
 *
 * Davr ko'rsatilmagan bo'lsa, eng eski yozuv sanasi oxirgi sahifadan
 * aniqlanadi va butun tarix shu oraliqda bo'lib olinadi.
 *
 * @param {object} p shopIds, dateFrom, dateTo (ms), statuses
 */
export async function fetchAllFinanceOrders({ shopIds, dateFrom, dateTo, statuses }, signal, onProgress) {
  const probe = await getFinanceOrders(
    { shopIds, page: 0, size: FINANCE_PAGE, dateFrom, dateTo, statuses },
    { signal },
  )
  const total = probe?.totalElements ?? null

  const items = []
  items.expectedTotal = total

  /* ── Sig'adigan hajm: oddiy sahifalash ────────────────────────── */

  if (total === null || total <= WINDOW_CAP) {
    items.push(...(probe?.orderItems || []))
    onProgress?.(items.length, total)

    if ((probe?.orderItems || []).length === FINANCE_PAGE) {
      const pages = total === null ? FINANCE_MAX_PAGES : Math.ceil(total / FINANCE_PAGE)
      await mapLimit(range(1, Math.min(pages, FINANCE_MAX_PAGES)), PARALLEL, async (page) => {
        const res = await getFinanceOrders(
          { shopIds, page, size: FINANCE_PAGE, dateFrom, dateTo, statuses },
          { signal },
        )
        items.push(...(res?.orderItems || []))
        onProgress?.(items.length, total)
      })
    }

    return { items: [...items], total, capped: false, chunked: false }
  }

  /* ── Hajm katta: oylik bo'laklarga ajratamiz ──────────────────── */

  // Birinchi sahifa ham ishga yaraydi — darrov ko'rsatamiz
  items.push(...(probe?.orderItems || []))
  onProgress?.(items.length, total)

  const to = dateTo ?? Date.now()
  let from = dateFrom

  if (from === undefined || from === null) {
    // Eng eski yozuv oxirgi sahifada — bitta so'rov bilan chegarani topamiz
    const lastPage = Math.max(0, Math.ceil(total / FINANCE_PAGE) - 1)
    let oldest = null
    try {
      const tail = await getFinanceOrders(
        { shopIds, page: lastPage, size: FINANCE_PAGE, dateFrom, dateTo, statuses },
        { signal },
      )
      for (const it of tail?.orderItems || []) {
        const d = toDate(it.date ?? it.dateIssued)?.getTime()
        if (d && (oldest === null || d < oldest)) oldest = d
      }
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      // Oxirgi sahifa ochilmadi — uch yillik oraliqni olamiz
    }
    from = (oldest ?? to - 3 * 365 * MS_DAY) - MS_DAY
  }

  // Yangisidan eskisiga qarab oylik bo'laklar tuzamiz, so'ng parallel olamiz
  const windows = []
  let end = to
  while (end > from && windows.length < MAX_CHUNKS) {
    const begin = Math.max(from, end - CHUNK_DAYS * MS_DAY)
    windows.push([begin, end])
    end = begin - 1
  }

  await mapLimit(windows, PARALLEL, ([begin, stop]) =>
    collectWindow({ shopIds, statuses }, begin, stop, signal, items, onProgress),
  )
  const chunks = windows.length

  // Bo'laklar chegarasida takrorlanishi mumkin — tozalaymiz
  const seen = new Set()
  const unique = []
  for (const it of items) {
    const key = it.id ?? `${it.orderId}-${it.skuTitle}-${it.date ?? it.dateIssued}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(it)
  }

  return { items: unique, total, capped: chunks >= MAX_CHUNKS, chunked: true }
}

/** Xarajatlar uchun chegaralar — yozuvlar sotuvga qaraganda ancha kam */
export const EXPENSE_PAGE = 100
export const EXPENSE_MAX_PAGES = 20

/**
 * `/v1/finance/expenses` — davrdagi barcha to'lovlar (kirim + chiqim).
 *
 * Javobda `totalElements` yo'q, shuning uchun to'liq sahifa kelgani
 * davom etish belgisi bo'lib xizmat qiladi.
 */
export async function fetchAllExpenses({ shopIds, dateFrom, dateTo, sources }, signal, onProgress) {
  const first = await getExpenses(
    { shopIds, page: 0, size: EXPENSE_PAGE, dateFrom, dateTo, sources },
    { signal },
  )
  const payments = [...(first?.payments || [])]
  const total = first?.totalElements ?? null
  onProgress?.(payments.length, total)

  if (payments.length === EXPENSE_PAGE) {
    const pages = total === null ? EXPENSE_MAX_PAGES : Math.ceil(total / EXPENSE_PAGE)
    await mapLimit(range(1, Math.min(pages, EXPENSE_MAX_PAGES)), PARALLEL, async (page) => {
      const res = await getExpenses(
        { shopIds, page, size: EXPENSE_PAGE, dateFrom, dateTo, sources },
        { signal },
      )
      payments.push(...(res?.payments || []))
      onProgress?.(payments.length, total)
    })
  }

  return { payments, total, capped: payments.length >= EXPENSE_PAGE * EXPENSE_MAX_PAGES }
}

/** Yuk xatlari — bitta xatda o'nlab SKU bo'ladi, shuning uchun sahifa kichikroq */
export const INVOICE_PAGE = 50
export const INVOICE_MAX_PAGES = 20

/**
 * `/v1/invoice` — barcha yetkazib berish xatlari SKU tarkibi bilan.
 * Tovar aylanmasidagi «kirim» tomoni shu yerdan olinadi.
 */
export async function fetchAllInvoices(signal, onProgress) {
  const invoices = []

  for (let page = 0; page < INVOICE_MAX_PAGES; page++) {
    const res = await getAllInvoices({ page, size: INVOICE_PAGE }, { signal })
    const batch = Array.isArray(res) ? res : res?.content || []
    invoices.push(...batch)
    onProgress?.(invoices.length, null)
    if (batch.length < INVOICE_PAGE) break
  }

  return { invoices, capped: invoices.length >= INVOICE_PAGE * INVOICE_MAX_PAGES }
}

/** Qaytarishlar */
export const RETURN_PAGE = 50
export const RETURN_MAX_PAGES = 20

/** `/v1/shop/{shopId}/return` — do'kon bo'yicha barcha qaytarishlar */
export async function fetchAllShopReturns(shopId, signal, onProgress) {
  const returns = []
  if (!shopId) return { returns, capped: false }

  for (let page = 0; page < RETURN_MAX_PAGES; page++) {
    const res = await getShopReturns(shopId, { page, size: RETURN_PAGE }, { signal })
    const batch = Array.isArray(res) ? res : res?.content || []
    returns.push(...batch)
    onProgress?.(returns.length, null)
    if (batch.length < RETURN_PAGE) break
  }

  return { returns, capped: returns.length >= RETURN_PAGE * RETURN_MAX_PAGES }
}

/** FBS qoldiqlari — `skuIdFrom` kursori bilan */
export const STOCK_PAGE = 100
export const STOCK_MAX_PAGES = 30

/**
 * `/v3/fbs/sku/stocks` — barcha SKU qoldiqlari.
 *
 * Endpoint kursorli: oxirgi SKU id sidan keyingisini so'raymiz. Kursor
 * siljimay qolsa tsikl to'xtaydi — aks holda cheksiz aylanish bo'lardi.
 */
export async function fetchAllStocks(signal, onProgress) {
  const list = []
  let cursor
  const seen = new Set()

  for (let i = 0; i < STOCK_MAX_PAGES; i++) {
    const res = await getStocks({ size: STOCK_PAGE, skuIdFrom: cursor }, { signal })
    const batch = res?.skuAmountList || (Array.isArray(res) ? res : [])
    if (!batch.length) break

    let added = 0
    for (const s of batch) {
      const id = s.skuId ?? s.id
      if (id !== undefined && seen.has(id)) continue
      if (id !== undefined) seen.add(id)
      list.push(s)
      added++
    }
    onProgress?.(list.length, null)

    if (added === 0 || batch.length < STOCK_PAGE) break
    const last = batch[batch.length - 1]
    const nextCursor = last?.skuId ?? last?.id
    if (nextCursor === undefined || nextCursor === cursor) break
    cursor = nextCursor
  }

  return { stocks: list, capped: list.length >= STOCK_PAGE * STOCK_MAX_PAGES }
}

/* ===== Buyurtmalar ============================================== */

/** `/v2/fbs/orders` bir so'rovda ko'pi bilan 50 ta qaytaradi */
export const ORDER_PAGE = 50
export const ORDER_MAX_PAGES = 10

/**
 * Bitta status bo'yicha barcha sahifalarni yig'adi.
 *
 * Uzum `status` ko'rsatilmaganda bo'sh ro'yxat qaytaradi, shuning uchun
 * har bir status alohida so'raladi.
 */
async function fetchOrdersByStatus({ shopIds, status, scheme, dateFrom, dateTo }, signal) {
  const orders = []

  for (let page = 0; page < ORDER_MAX_PAGES; page++) {
    const res = await getOrders(
      { shopIds, status, scheme, dateFrom, dateTo, page, size: ORDER_PAGE },
      { signal },
    )
    const batch = res?.orders || []
    orders.push(...batch)
    if (batch.length < ORDER_PAGE) break
  }

  return orders
}

/**
 * Bir nechta status bo'yicha buyurtmalarni to'liq yuklaydi.
 *
 * Statuslar parallel so'raladi, chunki ular bir-biriga bog'liq emas.
 * Bitta status yiqilsa qolganlari saqlanadi — `failed` ro'yxatiga tushadi,
 * UI esa uni «noma'lum» deb ko'rsatadi, nol deb emas.
 *
 * @returns {Promise<{orders: Array, byStatus: object, failed: string[], forbidden: boolean}>}
 */
export async function fetchOrdersForStatuses({ shopIds, statuses, scheme, dateFrom, dateTo }, signal, onProgress) {
  let forbidden = false
  let loaded = 0

  const results = await Promise.all(
    statuses.map((status) =>
      fetchOrdersByStatus({ shopIds, status, scheme, dateFrom, dateTo }, signal)
        .then((list) => {
          loaded += list.length
          onProgress?.(loaded, null)
          return list
        })
        .catch((err) => {
          if (err?.name === 'AbortError') throw err
          if (err?.status === 403 || err?.status === 401) forbidden = true
          return null
        }),
    ),
  )

  const orders = []
  const byStatus = {}
  const failed = []

  results.forEach((list, i) => {
    const status = statuses[i]
    if (!list) {
      byStatus[status] = null
      failed.push(status)
      return
    }
    byStatus[status] = list.length
    orders.push(...list)
  })

  orders.sort((a, b) => (toDate(b.dateCreated)?.getTime() || 0) - (toDate(a.dateCreated)?.getTime() || 0))

  return { orders, byStatus, failed, forbidden, partial: failed.length > 0 }
}

/**
 * Sotuv va xarajatlarni birga yuklaydi — moliyaviy hisobotlarning ko'pchiligi
 * ikkalasini ham talab qiladi (foyda va zarar, pul oqimi, o'zaro hisob-kitob).
 */
export async function fetchFinanceAndExpenses({ shopIds, dateFrom, dateTo }, signal, onProgress) {
  const [sales, expenses] = await Promise.all([
    fetchAllFinanceOrders({ shopIds, dateFrom, dateTo }, signal, onProgress),
    fetchAllExpenses({ shopIds, dateFrom, dateTo }, signal),
  ])
  return { sales, expenses }
}

/* ===== Mahsulotlar ============================================== */

export const PRODUCT_PAGE = 100
export const PRODUCT_MAX_PAGES = 30

/**
 * `/v1/product/shop/{shopId}` — do'konning barcha mahsulotlari SKU tarkibi
 * bilan. Qoldiq taqsimoti va xarid rejasi shu yerdan quriladi:
 * `quantityActive`, `quantityFbs`, `quantitySold`, `quantityReturned` va
 * boshqa `quantity*` maydonlari faqat shu endpointda bor.
 */
export async function fetchAllProducts(shopId, signal, onProgress) {
  const products = []
  if (!shopId) return { products, capped: false }

  for (let page = 0; page < PRODUCT_MAX_PAGES; page++) {
    const res = await getProducts(shopId, { page, size: PRODUCT_PAGE, filter: 'ALL' }, { signal })
    const batch = res?.productList || res?.products || (Array.isArray(res) ? res : [])
    products.push(...batch)
    onProgress?.(products.length, res?.totalElements ?? null)
    if (batch.length < PRODUCT_PAGE) break
  }

  return { products, capped: products.length >= PRODUCT_PAGE * PRODUCT_MAX_PAGES }
}

/** Bir nechta do'kon bo'yicha mahsulotlar */
export async function fetchProductsForShops(shopIds = [], signal, onProgress) {
  const products = []
  for (const shopId of shopIds) {
    const res = await fetchAllProducts(shopId, signal, (n) => onProgress?.(products.length + n, null))
    products.push(...res.products.map((p) => ({ ...p, shopId })))
  }
  return { products, capped: false }
}
