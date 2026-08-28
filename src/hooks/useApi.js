import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client'

/**
 * API xatosini foydalanuvchi tiliga o'giradi.
 * ApiError'da i18nKey bo'lsa — tarjima, aks holda serverning o'z xabari.
 */
export function useApiMessage() {
  const { t } = useTranslation()
  return useCallback(
    (err) => {
      if (!err) return ''
      if (err instanceof ApiError) {
        const key = err.i18nKey
        if (key) return t(key)
        if (err.message) return err.message
      }
      return err.message || t('errors.unknown')
    },
    [t],
  )
}

/**
 * Deklarativ GET so'rov.
 *
 * @param {Function|null} fn  `(signal) => Promise` — null bo'lsa so'rov yuborilmaydi
 *                            (masalan, do'kon hali tanlanmagan)
 * @param {Array} deps        o'zgarganda qayta so'raladi
 * @param {object} options    `{ skip, keepPreviousData }`
 *
 * @returns {{data, error, loading, refetch, setData}}
 */
export function useApi(fn, deps = [], { skip = false, keepPreviousData = false } = {}) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(!skip && Boolean(fn))
  const [nonce, setNonce] = useState(0)

  // fn har renderda yangi funksiya bo'ladi — uni deps'ga qo'shmaymiz,
  // chunki chaqiruvchi `deps` massivini o'zi belgilaydi.
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    if (skip || !fnRef.current) {
      setLoading(false)
      return undefined
    }

    const ctrl = new AbortController()
    let alive = true

    setLoading(true)
    setError(null)
    if (!keepPreviousData) setData(null)

    Promise.resolve(fnRef.current(ctrl.signal))
      .then((res) => {
        if (alive) {
          setData(res)
          setError(null)
        }
      })
      .catch((err) => {
        if (!alive || err?.name === 'AbortError') return
        setError(err)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
      ctrl.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, skip])

  const refetch = useCallback(() => setNonce((n) => n + 1), [])

  return { data, error, loading, refetch, setData }
}

/**
 * Yozish amallari uchun (POST/PUT). Ikki marta bosishdan himoya qiladi.
 *
 * @returns {{run, pending, error, reset}}
 */
export function useAction(fn) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const mounted = useRef(true)
  const inFlight = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = useCallback(
    async (...args) => {
      if (inFlight.current) return undefined
      inFlight.current = true
      if (mounted.current) {
        setPending(true)
        setError(null)
      }
      try {
        return await fn(...args)
      } catch (err) {
        if (mounted.current) setError(err)
        throw err
      } finally {
        inFlight.current = false
        if (mounted.current) setPending(false)
      }
    },
    [fn],
  )

  const reset = useCallback(() => setError(null), [])

  return { run, pending, error, reset }
}
