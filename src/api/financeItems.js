/**
 * `/v1/finance/orders` pozitsiyalari bilan ishlashning umumiy qoidalari.
 *
 * Ikkita nozik joy bor, ular hamma hisobotga birdek tegishli — shuning
 * uchun bir joyda turadi.
 *
 * 1. BEKOR QILINGANLAR TUSHUMGA KIRMAYDI.
 *    Javobda `status: CANCELED` pozitsiyalar ham keladi va ularda
 *    `sellPrice` to'ldirilgan bo'ladi, lekin `commission` va
 *    `sellerProfit` nol. Ular sotuv emas — hisobga olinsa tushum
 *    sun'iy oshib ketadi.
 *
 * 2. `purchasePrice` — TANNARX EMAS.
 *    Amalda tekshirildi: bekor qilingan pozitsiyada `sellPrice` 600 000
 *    bo'lganda `purchasePrice` 1 200 000 chiqadi, ya'ni u sotuv narxidan
 *    katta. Bu chegirmagacha bo'lgan to'liq narx, xarid tannarxi emas.
 *    Uni tannarx sifatida ishlatish foydani manfiy qilib yuboradi.
 *    Shuning uchun tannarx faqat foydalanuvchi kiritgan qiymatdan olinadi
 *    (`useCostOverride`) — MoySklad ham Uzum uchun tannarxni nol qoldiradi.
 */

/** Sotuv deb hisoblanadigan moliyaviy statuslar */
export const REALIZED_STATUSES = ['TO_WITHDRAW', 'PROCESSING', 'PARTIALLY_CANCELLED']

/** Bekor qilingan pozitsiyami */
export const isCanceled = (item) => item?.status === 'CANCELED'

/** Hisobga olinadigan pozitsiyalar (bekor qilinganlarsiz) */
export const realizedItems = (items = []) => items.filter((it) => !isCanceled(it))

/** Tannarx lug'atidagi kalit — barcha sahifalarda bir xil bo'lishi shart */
export const costKey = (item) => `${item?.productId ?? '?'}|${item?.skuTitle ?? ''}`

/**
 * Pozitsiya tannarxi.
 *
 * Faqat foydalanuvchi kiritgan «o'z tannarxim» ishlatiladi. Uzum'ning
 * `purchasePrice` maydoni tannarx emas (yuqoridagi izohga qarang).
 *
 * @param {object} item pozitsiya
 * @param {object} costs `useCostOverride` lug'ati
 * @returns {number} qator uchun tannarx summasi
 */
export function itemCost(item, costs = {}) {
  const unit = costs[costKey(item)]
  if (unit === undefined) return 0
  return unit * (Number(item.amount) || 0)
}

/** Davrdagi pozitsiyalarning nechtasida tannarx kiritilgan */
export function costCoverage(items = [], costs = {}) {
  let withCost = 0
  for (const it of items) {
    if (costs[costKey(it)] !== undefined) withCost++
  }
  return { withCost, total: items.length, full: items.length > 0 && withCost === items.length }
}
