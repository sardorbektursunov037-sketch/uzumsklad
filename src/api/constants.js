/**
 * Uzum API enum qiymatlari.
 * Har bir qiymat uchun i18n kaliti `enums.<guruh>.<QIYMAT>` ko'rinishida.
 */

/** Buyurtma statuslari — GET /v2/fbs/orders?status= */
export const ORDER_STATUSES = [
  'CREATED',
  'PACKING',
  'PENDING_DELIVERY',
  'DELIVERING',
  'DELIVERED',
  'ACCEPTED_AT_DP',
  'DELIVERED_TO_CUSTOMER_DELIVERY_POINT',
  'COMPLETED',
  'CANCELED',
  'PENDING_CANCELLATION',
  'RETURNED',
]

/**
 * Status -> Badge rangi. Ranglar semantik: kutilmoqda / harakatda / muvaffaqiyat / xato.
 */
export const ORDER_STATUS_TONE = {
  CREATED: 'warning',
  PACKING: 'info',
  PENDING_DELIVERY: 'info',
  DELIVERING: 'info',
  DELIVERED: 'success',
  ACCEPTED_AT_DP: 'info',
  DELIVERED_TO_CUSTOMER_DELIVERY_POINT: 'success',
  COMPLETED: 'success',
  CANCELED: 'danger',
  PENDING_CANCELLATION: 'danger',
  RETURNED: 'danger',
}

/** Buyurtma sxemasi */
export const ORDER_SCHEMES = ['FBS', 'DBS']

/** Bekor qilish / qaytarish sabablari — POST /v1/fbs/order/{id}/cancel */
export const CANCEL_REASONS = [
  'OUT_OF_STOCK',
  'OUT_OF_PACKAGE',
  'OUT_OF_TIME',
  'OTHER',
  'ACCEPTANCE_TIME_EXPIRED',
  'DELIVERY_TIME_EXPIRED',
  'RETURNED_BY_CUSTOMER',
  'CANCELED_BY_CUSTOMER',
  'MARKET_REASON',
]

/** Mahsulot saralash mezonlari */
export const PRODUCT_SORT = [
  'DEFAULT',
  'ORDERS',
  'PRICE',
  'ID',
  'ROI',
  'CONVERSION',
  'LEFTOVERS',
  'CREATED_AND_TITLE',
]

/** Mahsulot filtri */
export const PRODUCT_FILTERS = [
  'ALL',
  'ACTIVE',
  'INACTIVE',
  'WARNING',
  'WITH_SKU',
  'ARCHIVE',
  'DEFECTED',
  'WITHOUT_REQUIRED_FILTERS',
]

/** Mahsulot reytingi (A eng yaxshi) */
export const PRODUCT_RANKS = ['A', 'B', 'C', 'N', 'D']

export const PRODUCT_RANK_TONE = {
  A: 'success',
  B: 'info',
  C: 'warning',
  N: 'neutral',
  D: 'danger',
}

/** Mahsulot holati — SellerProductCard.status.value */
export const PRODUCT_STATUS_TONE = {
  IN_STOCK: 'success',
  READY_TO_SEND: 'success',
  NOT_READY_TO_SEND: 'warning',
  SENT: 'info',
  NO_SKU: 'neutral',
  RUN_OUT: 'warning',
  BLOCKED: 'danger',
  SKU_BLOCKED: 'danger',
  ARCHIVED: 'neutral',
  DELETED: 'neutral',
  PERM_BANNED: 'danger',
}

/** Moderatsiya holati */
export const MODERATION_TONE = {
  MODERATED: 'success',
  ON_MODERATION: 'info',
  ON_PREMODERATION: 'info',
  NOT_MODERATED: 'neutral',
  HAS_COMPLAINTS: 'warning',
  PERM_BANNED: 'danger',
}

/** FBS yuk xati statuslari — GET /v1/fbs/invoice?statuses= */
export const FBS_INVOICE_STATUSES = ['CREATED', 'ACCEPTANCE_IN_PROGRESS', 'ACCEPTED', 'CANCELLED']

export const FBS_INVOICE_TONE = {
  CREATED: 'warning',
  ACCEPTANCE_IN_PROGRESS: 'info',
  ACCEPTED: 'success',
  CANCELLED: 'danger',
}

/** Moliyaviy buyurtma statuslari — GET /v1/finance/orders?statuses= */
export const FINANCE_STATUSES = ['TO_WITHDRAW', 'PROCESSING', 'CANCELED', 'PARTIALLY_CANCELLED']

export const FINANCE_STATUS_TONE = {
  TO_WITHDRAW: 'success',
  PROCESSING: 'info',
  CANCELED: 'danger',
  PARTIALLY_CANCELLED: 'warning',
}

/** To'lov statuslari — SellerPaymentDto.status */
export const PAYMENT_STATUS_TONE = {
  CREATED: 'warning',
  CONFIRMED: 'success',
  REFUNDED: 'info',
  CANCELED: 'danger',
}

/** Qaytarish turlari — SellerReturnLite.type */
export const RETURN_TYPES = ['RETURN', 'DEFECTED', 'FBS']

/** Etiketka o'lchamlari — GET /v1/fbs/order/{id}/labels/print?size= */
export const LABEL_SIZES = ['LARGE', 'BIG']

/** Qabul punkti turlari — DropOffPointShortDto.type */
export const DROP_OFF_TYPES = [
  'UNKNOWN',
  'STOCK',
  'ISSUE_POINT',
  'UZ_POST',
  'UCELL',
  'NOT_UZUM',
  'PHOTO_STUDIO',
  'CROSS_DOCK',
  'DROP_OFF_POINT',
  'SORT_CENTER',
]

/** Sahifadagi yozuvlar soni variantlari */
export const PAGE_SIZES = [10, 20, 50, 100]

/* ===== Muammoli buyurtmalar ===================================== */

/**
 * Muammo turlari — `utils/format.js` dagi `orderProblems()` qaytaradigan
 * kodlar. Tartib muhimlik bo'yicha: yuqoridagilari ko'proq e'tibor talab
 * qiladi. `i18n` kaliti `problems.type.<kod>` ko'rinishida.
 */
export const ORDER_PROBLEMS = [
  'overdue',
  'deliveryOverdue',
  'stuck',
  'notPickedUp',
  'inTransit',
  'cancelling',
  'returned',
]

export const ORDER_PROBLEM_TONE = {
  overdue: 'danger',
  deliveryOverdue: 'danger',
  stuck: 'warning',
  notPickedUp: 'warning',
  inTransit: 'warning',
  cancelling: 'danger',
  returned: 'info',
}

/**
 * Muammo qidirishda tekshiriladigan statuslar.
 *
 * `COMPLETED` va `CANCELED` chiqarib tashlangan: birinchisi muvaffaqiyatli
 * yakunlangan, ikkinchisi allaqachon yopilgan — ikkalasi ham harakat talab
 * qilmaydi, lekin soni bo'yicha eng katta guruh bo'lib, yuklashni
 * sekinlashtiradi.
 */
export const PROBLEM_SCAN_STATUSES = [
  'CREATED',
  'PACKING',
  'PENDING_DELIVERY',
  'DELIVERING',
  'DELIVERED',
  'ACCEPTED_AT_DP',
  'DELIVERED_TO_CUSTOMER_DELIVERY_POINT',
  'PENDING_CANCELLATION',
  'RETURNED',
]
