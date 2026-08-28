import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react'
import { cx } from '../utils/format'

const ToastContext = createContext(null)

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const TONE = {
  success: 'text-emerald-600 dark:text-emerald-400',
  error: 'text-red-600 dark:text-red-400',
  warning: 'text-amber-600 dark:text-amber-400',
  info: 'text-brand-600 dark:text-brand-400',
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (message, { type = 'info', duration = 4000, title } = {}) => {
      const id = ++idRef.current
      setToasts((list) => [...list.slice(-3), { id, message, type, title }])
      if (duration) setTimeout(() => dismiss(id), duration)
      return id
    },
    [dismiss],
  )

  const value = useMemo(
    () => ({
      push,
      dismiss,
      success: (m, o) => push(m, { ...o, type: 'success' }),
      error: (m, o) => push(m, { ...o, type: 'error', duration: 6000 }),
      warning: (m, o) => push(m, { ...o, type: 'warning' }),
      info: (m, o) => push(m, { ...o, type: 'info' }),
    }),
    [push, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
        role="region"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || Info
          return (
            <div
              key={t.id}
              className="animate-slide-up bg-surface pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-pop"
            >
              <Icon size={18} className={cx('mt-0.5 shrink-0', TONE[t.type])} aria-hidden />
              <div className="min-w-0 flex-1">
                {t.title && <p className="text-sm font-semibold">{t.title}</p>}
                <p className="text-app/90 text-sm break-words">{t.message}</p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="text-faint hover:text-app -m-1 rounded-md p-1 transition-colors"
                aria-label="Yopish"
              >
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast faqat ToastProvider ichida ishlaydi')
  return ctx
}
