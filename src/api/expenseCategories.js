/**
 * Uzum xarajatlarini moddalar bo'yicha tasniflash.
 *
 * `/v1/finance/expenses` javobidagi `source` va `name` maydonlari erkin matn —
 * Uzum modda uchun alohida enum bermaydi. MoySklad integratsiyasi ularni
 * oltita xizmatga ajratadi (Логистика · Хранение · Маркетинг · Подписка ·
 * Фотостудия · Прочее), shuning uchun biz ham xuddi shu oltitasini
 * ishlatamiz — ikkala tizimdagi «Foyda va zarar» bir xil chiqishi uchun.
 *
 * Tasnif nom bo'yicha bajariladi, shuning uchun har bir sahifada xom
 * `source` qiymatlari ham ko'rsatiladi: modda noto'g'ri tushsa, foydalanuvchi
 * buni darhol ko'radi va aytadi.
 */

/** Moddalar — ko'rsatish tartibida. `other` doim oxirida. */
export const EXPENSE_CATEGORIES = [
  'logistics',
  'storage',
  'marketing',
  'subscription',
  'photoStudio',
  'taxes',
  'other',
]

/**
 * Har bir modda uchun kalit so'zlar: uz · ru · en va Uzum enum'larida
 * uchraydigan yozuvlar. Tartib muhim — birinchi mos kelgani g'olib,
 * shuning uchun aniqroq iboralar yuqorida turadi.
 */
const RULES = [
  {
    key: 'taxes',
    // Soliq alohida qatorda ko'rsatiladi (MoySklad: «Налоги и сборы»)
    test: /(soliq|nalog|налог|\btax\b|qqs|ндс|\bnds\b|\bvat\b|sbor|сбор|yig['’]im)/i,
  },
  {
    key: 'logistics',
    test: /(logisti|логисти|доставк|delivery|yetkaz|курьер|kuryer|shipping|транспорт)/i,
  },
  {
    key: 'storage',
    test: /(хранен|storage|saqlash|склад|warehouse|ombor)/i,
  },
  {
    key: 'marketing',
    test: /(маркетинг|marketing|реклам|reklama|advert|продвижен|promotion|promo|boost|баннер|banner|акци|ko‘paytirish|kopaytirish)/i,
  },
  {
    key: 'subscription',
    test: /(подписк|subscription|obuna|тариф|tarif|абонент)/i,
  },
  {
    key: 'photoStudio',
    test: /(фотостуди|photo|studio|foto|съемк|s['’]yomka)/i,
  },
]

/**
 * To'lov qaysi moddaga tegishli.
 * @param {{source?: string, name?: string}} payment
 * @returns {string} modda kaliti
 */
export function expenseCategory(payment) {
  const text = `${payment?.source ?? ''} ${payment?.name ?? ''}`
  for (const rule of RULES) {
    if (rule.test.test(text)) return rule.key
  }
  return 'other'
}

/**
 * To'lovlarni moddalar bo'yicha yig'adi.
 *
 * `INCOME` turidagi to'lovlar xarajat emas — ular hisobga yechib olingan
 * foyda, ya'ni allaqachon sanalgan pulning ko'chirilishi. Shuning uchun
 * ular alohida `income` yig'indisiga tushadi.
 *
 * @param {Array} payments `/v1/finance/expenses` javobidagi `payments`
 * @returns {{byCategory: object, bySource: Array, outcome: number, income: number}}
 */
export function groupExpenses(payments = []) {
  const byCategory = {}
  for (const key of EXPENSE_CATEGORIES) byCategory[key] = 0

  const bySource = new Map()
  let outcome = 0
  let income = 0

  for (const p of payments) {
    const amount = Number(p.paymentPrice) || 0

    if (p.type === 'INCOME') {
      income += amount
      continue
    }

    const category = expenseCategory(p)
    byCategory[category] += amount
    outcome += amount

    // Xom manba nomi bo'yicha taqsimot — tasnifni tekshirish uchun
    const key = p.source || p.name || '—'
    const row = bySource.get(key) || { key, source: key, category, amount: 0, count: 0 }
    row.amount += amount
    row.count++
    bySource.set(key, row)
  }

  return {
    byCategory,
    bySource: [...bySource.values()].sort((a, b) => b.amount - a.amount),
    outcome,
    income,
  }
}
