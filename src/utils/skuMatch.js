/**
 * Turli endpointlardan kelgan SKU larni bir-biriga moslashtirish.
 *
 * Muammo: Uzum API da yagona SKU kaliti yo'q.
 *   · `/v1/finance/orders` — `productId`, `skuTitle`, `sellerSkuCode`, `barcode`
 *   · `/v1/invoice`        — `productTitle`, `skuTitle`, `skuList[].barcode`
 *   · `/v3/fbs/sku/stocks` — `skuId`, `barcode`, `sellerSkuCode`, `skuTitle`
 *
 * Ya'ni bitta manbada shtrix-kod bor, boshqasida yo'q. Shuning uchun har bir
 * yozuv uchun BIR NECHTA nomzod kalit hisoblanadi (shtrix-kod, sotuvchi kodi,
 * nom), so'ng bittasi mos kelgan yozuvlar bitta guruhga birlashtiriladi.
 *
 * Birlashtirish uchun oddiy union-find ishlatiladi: shtrix-kod bo'yicha
 * bog'langan ikki yozuv, ulardan biri nom bo'yicha uchinchisiga bog'langan
 * bo'lsa, uchalasi bitta guruhga tushadi.
 */

/** Nomni solishtirishga tayyorlash: ortiqcha bo'shliq va registr olib tashlanadi */
const norm = (v) =>
  String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

/**
 * Yozuv uchun barcha nomzod kalitlar.
 * Prefikslar kalitlar turini aralashtirib yubormaslik uchun.
 */
export function candidateKeys(o) {
  if (!o) return []
  const keys = []

  const barcode = o.barcode ?? o.skuBarcode
  if (barcode) keys.push(`b:${String(barcode).trim()}`)

  const code = o.sellerSkuCode ?? o.sellerItemCode
  if (code) keys.push(`c:${norm(code)}`)

  const skuId = o.skuId
  if (skuId !== undefined && skuId !== null && skuId !== '') keys.push(`s:${skuId}`)

  const product = norm(o.productTitle)
  const sku = norm(o.skuTitle)
  if (product || sku) keys.push(`t:${product}|${sku}`)

  return keys
}

/** Oddiy union-find (yo'lni siqish bilan) */
function createUnionFind() {
  const parent = new Map()

  const find = (x) => {
    if (!parent.has(x)) parent.set(x, x)
    let root = x
    while (parent.get(root) !== root) root = parent.get(root)
    // Yo'lni siqamiz — keyingi qidiruvlar tezroq bo'ladi
    let cur = x
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)
      parent.set(cur, root)
      cur = next
    }
    return root
  }

  const union = (a, b) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }

  return { find, union }
}

/**
 * Bir nechta manbadan kelgan yozuvlarni SKU bo'yicha guruhlaydi.
 *
 * @param {Array<{items: Array, apply: (group, item) => void}>} sources
 *        Har bir manba: yozuvlar ro'yxati va guruh yig'indisiga qo'shish usuli.
 * @param {(item) => object} meta  guruh sarlavhasi uchun ma'lumot (birinchi
 *        uchragan yozuvdan olinadi, keyingilari faqat bo'sh maydonlarni to'ldiradi)
 * @param {() => object} init      bo'sh yig'indi
 * @returns {Array<object>} guruhlar
 */
export function groupBySku(sources, { init, meta }) {
  const uf = createUnionFind()

  // 1-bosqich: barcha kalitlarni bog'lab chiqamiz
  const entries = []
  for (const src of sources) {
    for (const item of src.items) {
      const keys = candidateKeys(item)
      if (keys.length === 0) continue
      for (let i = 1; i < keys.length; i++) uf.union(keys[0], keys[i])
      entries.push({ item, apply: src.apply, key: keys[0] })
    }
  }

  // 2-bosqich: guruhlarga yig'amiz
  const groups = new Map()
  for (const { item, apply, key } of entries) {
    const root = uf.find(key)
    if (!groups.has(root)) groups.set(root, { key: root, ...init(), ...meta(item) })
    const group = groups.get(root)

    // Sarlavha maydonlari bo'sh bo'lsa keyingi manbadan to'ldiriladi
    const m = meta(item)
    for (const [k, v] of Object.entries(m)) {
      if ((group[k] === undefined || group[k] === null || group[k] === '') && v) group[k] = v
    }

    apply(group, item)
  }

  return [...groups.values()]
}
