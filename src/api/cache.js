/**
 * Uzum javoblarining brauzerdagi keshi (IndexedDB).
 *
 * MoySklad tez ochilishining sababi shundaki, u sahifani chizayotganda
 * Uzum'ga umuman murojaat qilmaydi — ma'lumot oldindan uning o'z bazasiga
 * ko'chirib qo'yilgan. Uzum API'ning o'zi sekin: bitta so'rov 2–4 soniya,
 * bir oylik hisobot esa o'nlab so'rov talab qiladi.
 *
 * Shuning uchun biz ham bir marta yuklaganimizni saqlab qo'yamiz. Bu yangi
 * ma'lumot yaratish emas — Uzum bergan javobning o'zi, faqat qayta so'ramaslik
 * uchun. Kesh brauzerda turadi, boshqa hech qayerga ketmaydi.
 *
 * Kesh eskirganda ham darrov ko'rsatiladi, yangisi esa orqa fonda yuklanadi
 * (stale-while-revalidate) — shunda sahifa hech qachon bo'sh turmaydi.
 */

const DB_NAME = 'uzum-sklad-cache'
const DB_VERSION = 1
const STORE = 'responses'

/** Kesh shu muddatdan keyin eskirgan hisoblanadi (lekin o'chirilmaydi) */
export const CACHE_TTL_MS = 30 * 60 * 1000

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB mavjud emas'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }).catch((err) => {
    // Private rejim yoki bloklangan bo'lsa — keshsiz davom etamiz
    dbPromise = null
    throw err
  })

  return dbPromise
}

function tx(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const store = t.objectStore(STORE)
        const req = fn(store)
        t.oncomplete = () => resolve(req?.result)
        t.onerror = () => reject(t.error)
        t.onabort = () => reject(t.error)
      }),
  )
}

/** Keshdan o'qish. Topilmasa yoki xato bo'lsa — `null`. */
export async function cacheGet(key) {
  try {
    const row = await tx('readonly', (store) => store.get(key))
    if (!row) return null
    return { data: row.data, at: row.at, stale: Date.now() - row.at > CACHE_TTL_MS }
  } catch {
    return null
  }
}

/** Keshga yozish. Xato bo'lsa jimgina o'tkazib yuboriladi. */
export async function cacheSet(key, data) {
  try {
    await tx('readwrite', (store) => store.put({ key, at: Date.now(), data }))
  } catch {
    /* kesh ishlamasa ham ilova ishlayveradi */
  }
}

/** Butun keshni tozalash (Sozlamalardan chaqiriladi) */
export async function cacheClear() {
  try {
    await tx('readwrite', (store) => store.clear())
  } catch {
    /* e'tiborsiz */
  }
}

/** Keshdagi yozuvlar soni va umumiy hajmi — Sozlamalarda ko'rsatish uchun */
export async function cacheStats() {
  try {
    const rows = await tx('readonly', (store) => store.getAll())
    const list = rows || []
    let bytes = 0
    for (const r of list) {
      try {
        bytes += JSON.stringify(r.data).length
      } catch {
        /* o'lchab bo'lmadi */
      }
    }
    return { count: list.length, bytes, oldest: list.reduce((m, r) => (m === null || r.at < m ? r.at : m), null) }
  } catch {
    return { count: 0, bytes: 0, oldest: null }
  }
}

/**
 * Kesh kaliti — bir xil so'rov doim bir xil kalitga tushishi uchun
 * parametrlar tartiblanadi.
 */
export function cacheKey(name, params = {}) {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('.') : v}`)
  return `${name}|${parts.join('&')}`
}
