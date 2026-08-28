import { useCallback, useEffect, useState } from 'react'

const KEY = 'uzum.costOverride'

/**
 * Uzum API tannarxni yozishga ruxsat bermaydi — `sendPriceData` faqat
 * `sellPrice` va `fullPrice` ni qabul qiladi. Shuning uchun o'z tannarxingizni
 * shu brauzerda saqlaymiz va foydani shunga ko'ra hisoblaymiz.
 *
 * Saqlash ko'rinishi: `{ "<guruh kaliti>": <dona uchun tannarx> }`
 */
function read() {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function write(value) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value))
  } catch {
    /* private rejim — xotiradagi nusxa bilan davom etamiz */
  }
}

/** Boshqa tablarda ham yangilanishi uchun oddiy obuna */
const listeners = new Set()
let store = null

function get() {
  if (store === null) store = read()
  return store
}

function set(next) {
  store = next
  write(next)
  for (const fn of listeners) fn(next)
}

export function useCostOverride() {
  const [costs, setCosts] = useState(get)

  useEffect(() => {
    const fn = (next) => setCosts(next)
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])

  /** @param {string} key guruh kaliti @param {number|''} unitCost dona uchun tannarx */
  const setCost = useCallback((key, unitCost) => {
    const next = { ...get() }
    const n = Number(unitCost)
    if (unitCost === '' || !Number.isFinite(n) || n < 0) delete next[key]
    else next[key] = n
    set(next)
  }, [])

  const clearAll = useCallback(() => set({}), [])

  return { costs, setCost, clearAll, count: Object.keys(costs).length }
}

/** Eksport/import uchun — CSV ga qo'shib qo'yish qulay */
export const readCostOverrides = get
