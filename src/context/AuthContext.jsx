import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getToken, setToken as persistToken } from '../api/client'
import { getShops } from '../api/endpoints'

const SHOP_KEY = 'uzum.shopId'

const AuthContext = createContext(null)

/**
 * Autentifikatsiya va do'kon konteksti.
 *
 * Token ikki manbadan kelishi mumkin:
 *  1. Foydalanuvchi kiritgan token (localStorage)
 *  2. Serverning .env faylidagi UZUM_API_TOKEN — u holda brauzerda token
 *     umuman bo'lmaydi, /api/config `serverToken: true` qaytaradi.
 */
export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() => getToken())
  const [serverToken, setServerToken] = useState(false)
  const [ready, setReady] = useState(false)

  const [shops, setShops] = useState([])
  const [shopsLoading, setShopsLoading] = useState(false)
  const [shopsError, setShopsError] = useState(null)
  const [activeShopId, setActiveShopId] = useState(() => {
    try {
      const raw = localStorage.getItem(SHOP_KEY)
      return raw ? Number(raw) : null
    } catch {
      return null
    }
  })

  // Serverda token sozlanganmi — bilib olamiz (dev'da bu endpoint yo'q, xato normal)
  useEffect(() => {
    let alive = true
    fetch('/api/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (alive && cfg?.serverToken) setServerToken(true)
      })
      .catch(() => {})
      .finally(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [])

  const authenticated = Boolean(token) || serverToken

  /** Do'konlarni yuklash — bu bir vaqtning o'zida tokenni tekshirish ham. */
  const loadShops = useCallback(async (signal) => {
    setShopsLoading(true)
    setShopsError(null)
    try {
      const list = await getShops({ signal })
      const arr = Array.isArray(list) ? list : []
      setShops(arr)
      setActiveShopId((prev) => {
        if (prev && arr.some((s) => s.id === prev)) return prev
        return arr[0]?.id ?? null
      })
      return arr
    } catch (err) {
      if (err?.name !== 'AbortError') setShopsError(err)
      throw err
    } finally {
      setShopsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authenticated || !ready) return undefined
    const ctrl = new AbortController()
    loadShops(ctrl.signal).catch(() => {})
    return () => ctrl.abort()
  }, [authenticated, ready, loadShops])

  useEffect(() => {
    try {
      if (activeShopId) localStorage.setItem(SHOP_KEY, String(activeShopId))
      else localStorage.removeItem(SHOP_KEY)
    } catch {
      /* e'tiborsiz */
    }
  }, [activeShopId])

  /** Tokenni tekshirib, to'g'ri bo'lsa saqlaydi. Xato bo'lsa ApiError uloqtiradi. */
  const login = useCallback(async (candidate) => {
    persistToken(candidate)
    try {
      const list = await getShops()
      setTokenState(candidate)
      const arr = Array.isArray(list) ? list : []
      setShops(arr)
      setActiveShopId((prev) => (prev && arr.some((s) => s.id === prev) ? prev : (arr[0]?.id ?? null)))
      return arr
    } catch (err) {
      persistToken('') // noto'g'ri tokenni saqlab qo'ymaymiz
      throw err
    }
  }, [])

  const logout = useCallback(() => {
    persistToken('')
    setTokenState('')
    setShops([])
    setActiveShopId(null)
    try {
      localStorage.removeItem(SHOP_KEY)
    } catch {
      /* e'tiborsiz */
    }
  }, [])

  const activeShop = useMemo(
    () => shops.find((s) => s.id === activeShopId) || null,
    [shops, activeShopId],
  )

  const value = useMemo(
    () => ({
      token,
      serverToken,
      authenticated,
      ready,
      login,
      logout,
      shops,
      shopsLoading,
      shopsError,
      reloadShops: loadShops,
      activeShopId,
      activeShop,
      setActiveShopId,
      /** Ko'p endpointlar shopIds massivini kutadi */
      shopIds: activeShopId ? [activeShopId] : shops.map((s) => s.id),
    }),
    [
      token,
      serverToken,
      authenticated,
      ready,
      login,
      logout,
      shops,
      shopsLoading,
      shopsError,
      loadShops,
      activeShopId,
      activeShop,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth faqat AuthProvider ichida ishlaydi')
  return ctx
}
