import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getToken, setToken as persistToken } from '../api/client'
import { getShops } from '../api/endpoints'

const SHOP_KEY = 'uzum.shopId'

const AuthContext = createContext(null)

/**
 * Autentifikatsiya va do'kon konteksti.
 *
 * Foydalanuvchi xom Uzum API tokenini bilmaydi — faqat login/parol bilan
 * kiradi (`loginWithCredentials`). Server `/api/login`da login/parolni
 * tekshiradi va to'g'ri bo'lsa `.env`dagi UZUM_API_TOKEN'ni bir marta
 * qaytaradi, u shu yerda odatdagi `login()` orqali localStorage'ga saqlanadi.
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

  // Login/parol majburiy — server tokeni bo'lishi o'zi hali autentifikatsiya
  // qilinganini bildirmaydi, u faqat `/api/login` orqali brauzerga tushadi.
  const authenticated = Boolean(token)

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

  /**
   * Login/parolni serverga tekshirtiradi — to'g'ri bo'lsa server haqiqiy
   * Uzum tokenini qaytaradi, u odatdagi `login()` orqali saqlanadi.
   */
  const loginWithCredentials = useCallback(
    async (username, password) => {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const first = Array.isArray(data?.errors) ? data.errors[0] : null
        const err = new Error(first?.message || 'Login yoki parol noto‘g‘ri')
        err.status = res.status
        err.code = first?.code
        throw err
      }
      return login(data.token)
    },
    [login],
  )

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
      loginWithCredentials,
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
      loginWithCredentials,
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
