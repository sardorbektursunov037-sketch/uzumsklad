import { useCallback, useEffect, useRef, useState } from 'react'
import { cacheGet, cacheSet } from '../api/cache'

/**
 * Ko'p sahifali yuklash uchun `useApi` ning hisobotlarga moslashtirilgan
 * varianti.
 *
 * `useApi` bitta so'rovni bajaradi, hisobotlarga esa o'nlab sahifa kerak —
 * shuning uchun bu yerda yuklanish jarayoni (`loaded` / `total`) ham
 * qaytariladi va eskirgan so'rov javobi yangisining ustiga yozilmasligi
 * uchun so'rov raqami kuzatiladi.
 *
 * `cacheKey` berilsa, natija brauzer keshiga (IndexedDB) yoziladi va keyingi
 * ochilishda darrov ko'rsatiladi. Uzum API sekin — bitta so'rov 2–4 soniya,
 * bir oylik hisobot esa o'nlab so'rov. Kesh eskirgan bo'lsa ham avval u
 * ko'rsatiladi, yangisi orqa fonda yuklanadi.
 *
 * @param {(signal: AbortSignal, onProgress: Function) => Promise<any>} loader
 * @param {Array} deps o'zgarganda qayta yuklanadi
 * @param {{skip?: boolean, cacheKey?: string}} options
 */
export function useBulkLoad(loader, deps = [], { skip = false, cacheKey } = {}) {
  const [state, setState] = useState({
    data: null,
    loading: !skip,
    error: null,
    loaded: 0,
    total: null,
    cachedAt: null,
    refreshing: false,
  })
  const [nonce, setNonce] = useState(0)

  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const reqRef = useRef(0)
  // `reload()` keshni chetlab o'tishi kerak
  const forceRef = useRef(false)

  useEffect(() => {
    if (skip) {
      setState({ data: null, loading: false, error: null, loaded: 0, total: null, cachedAt: null, refreshing: false })
      return undefined
    }

    const ctrl = new AbortController()
    const id = ++reqRef.current
    const force = forceRef.current
    forceRef.current = false

    let cancelled = false

    const run = async () => {
      // 1-qadam: kesh bo'lsa darrov ko'rsatamiz
      let hadCache = false
      if (cacheKey && !force) {
        const hit = await cacheGet(cacheKey)
        if (cancelled || reqRef.current !== id) return
        if (hit) {
          hadCache = true
          setState((s) => ({
            ...s,
            data: hit.data,
            loading: false,
            error: null,
            cachedAt: hit.at,
            // Eskirgan bo'lsa orqa fonda yangilaymiz
            refreshing: hit.stale,
          }))
          if (!hit.stale) return
        }
      }

      if (!hadCache) {
        setState((s) => ({ ...s, loading: true, error: null, loaded: 0, refreshing: false }))
      }

      // 2-qadam: haqiqiy yuklash
      try {
        const data = await loaderRef.current(ctrl.signal, (loaded, total) => {
          if (reqRef.current === id) setState((s) => ({ ...s, loaded, total }))
        })
        if (cancelled || reqRef.current !== id) return
        setState((s) => ({ ...s, data, loading: false, error: null, cachedAt: Date.now(), refreshing: false }))
        if (cacheKey) cacheSet(cacheKey, data)
      } catch (err) {
        if (err?.name === 'AbortError' || cancelled || reqRef.current !== id) return
        // Kesh bo'lsa uni saqlab qolamiz — bo'sh ekran ko'rsatmaymiz
        setState((s) => ({ ...s, loading: false, refreshing: false, error: hadCache ? null : err }))
      }
    }

    run()

    return () => {
      cancelled = true
      ctrl.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, skip, cacheKey])

  /** Keshni chetlab o'tib qaytadan yuklash */
  const reload = useCallback(() => {
    forceRef.current = true
    setNonce((n) => n + 1)
  }, [])

  return { ...state, reload }
}
