import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'

const THEME_KEY = 'uzum.theme'
const DENSITY_KEY = 'uzum.density'
const DEV_KEY = 'uzum.devMode'

const ThemeContext = createContext(null)

function read(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private rejim — davom etaveramiz */
  }
}

/** 'system' tanlanganda OS sozlamasiga qarab .dark sinfini qo'yadi. */
function applyTheme(theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b0d12' : '#7000ff')
  return dark
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => read(THEME_KEY, 'system'))
  const [density, setDensityState] = useState(() => read(DENSITY_KEY, 'comfortable'))
  // Dev rejim: har bir raqam qaysi API endpointidan kelganini ko'rsatadi
  const [devMode, setDevModeState] = useState(() => read(DEV_KEY, '1') === '1')
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))

  useEffect(() => {
    setIsDark(applyTheme(theme))
    write(THEME_KEY, theme)
  }, [theme])

  // 'system' rejimida OS mavzusi o'zgarsa — darhol ergashamiz
  useEffect(() => {
    if (theme !== 'system') return undefined
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setIsDark(applyTheme('system'))
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  useEffect(() => {
    write(DENSITY_KEY, density)
    document.documentElement.dataset.density = density
  }, [density])

  const setTheme = useCallback((next) => setThemeState(next), [])
  const setDensity = useCallback((next) => setDensityState(next), [])

  const setDevMode = useCallback((next) => {
    setDevModeState(next)
    write(DEV_KEY, next ? '1' : '0')
  }, [])

  /** Tugma bilan almashtirish: yorug' <-> qorong'i */
  const toggle = useCallback(() => {
    setThemeState((prev) => {
      if (prev === 'system') return matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark'
      return prev === 'dark' ? 'light' : 'dark'
    })
  }, [])

  const value = useMemo(
    () => ({ theme, setTheme, toggle, isDark, density, setDensity, devMode, setDevMode }),
    [theme, setTheme, toggle, isDark, density, setDensity, devMode, setDevMode],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme faqat ThemeProvider ichida ishlaydi')
  return ctx
}
