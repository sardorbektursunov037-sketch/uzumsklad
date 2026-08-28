import { Component } from 'react'
import { withTranslation } from 'react-i18next'
import { AlertOctagon, RotateCcw } from 'lucide-react'

/**
 * Butun ilovani o'rab turuvchi xato chegarasi.
 * i18n bilan HOC orqali bog'langan — class komponentda hook ishlatib bo'lmaydi.
 */
class ErrorBoundaryBase extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Konsolda to'liq stek qolsin — ishlab chiqishda kerak bo'ladi
    console.error('[Uzum Sklad] render xatosi:', error, info?.componentStack)
  }

  render() {
    const { error } = this.state
    const { t, children } = this.props

    if (!error) return children

    return (
      <div className="bg-app flex min-h-screen items-center justify-center p-6">
        <div className="bg-surface w-full max-w-md rounded-2xl border p-6 text-center shadow-soft">
          <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400">
            <AlertOctagon size={22} aria-hidden />
          </span>
          <h1 className="text-app text-[16px] font-semibold">{t('errors.boundary')}</h1>
          <p className="text-muted mt-1.5 text-[13px]">{t('errors.boundaryHint')}</p>

          <pre className="bg-surface-2 text-faint mt-4 max-h-32 overflow-auto rounded-lg p-3 text-left font-mono text-[11px] break-words whitespace-pre-wrap">
            {String(error?.message || error)}
          </pre>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="bg-brand-600 hover:bg-brand-700 mt-4 inline-flex h-9.5 items-center gap-2 rounded-lg px-4 text-sm font-medium text-white transition-colors"
          >
            <RotateCcw size={15} />
            {t('errors.reload')}
          </button>
        </div>
      </div>
    )
  }
}

export const ErrorBoundary = withTranslation()(ErrorBoundaryBase)
