import { useTranslation } from 'react-i18next'
import { AlertCircle, Inbox, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react'
import { cx, valueSizeClass } from '../../utils/format'
import { Button, Skeleton } from './primitives'

/* ===== Card ====================================================== */

export function Card({ children, className, padded = true, ...rest }) {
  return (
    <div className={cx('bg-surface rounded-[--radius-card] border shadow-soft', padded && 'p-5', className)} {...rest}>
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, action, className }) {
  return (
    <div className={cx('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="text-app truncate text-[15px] font-semibold">{title}</h2>
        {subtitle && <p className="text-muted mt-0.5 text-[13px]">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/* ===== Sahifa sarlavhasi ========================================= */

export function PageHeader({ title, subtitle, children }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-app text-[22px] leading-tight font-semibold tracking-[-0.01em]">{title}</h1>
        {subtitle && <p className="text-muted mt-1 text-sm">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  )
}

/* ===== Statistika kartasi ======================================== */

/**
 * @param {object} p
 * @param {string} p.label   sarlavha
 * @param {string} p.value   asosiy qiymat (formatlangan)
 * @param {string} [p.hint]  qo'shimcha izoh
 * @param {number} [p.delta] o'zgarish foizi — ijobiy/salbiy strelka
 * @param {string} [p.tone]  'brand' | 'success' | 'warning' | 'danger'
 */
/**
 * Har bir ohang uchun to'plam: ikonka pallasi, yuqoridagi rangli chiziq,
 * kartaning ichidagi juda yumshoq tovlanish va chegara rangi.
 *
 * Oq karta oq fonda yo'qolib ketmasligi uchun ranglar aynan shu yerda
 * beriladi — ohang ko'rsatkichning ma'nosiga bog'liq (foyda yashil,
 * xarajat qizil, kutilayotgan sariq, umumiy — brend binafshasi).
 */
const STAT_TONES = {
  brand: {
    icon: 'bg-brand-100 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400',
    bar: 'bg-brand-500',
    tint: 'from-brand-50/80 dark:from-brand-950/30',
    border: 'border-brand-200/70 dark:border-brand-900/50',
    hover: 'hover:border-brand-400 dark:hover:border-brand-700',
  },
  success: {
    icon: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400',
    bar: 'bg-emerald-500',
    tint: 'from-emerald-50/80 dark:from-emerald-950/25',
    border: 'border-emerald-200/70 dark:border-emerald-900/50',
    hover: 'hover:border-emerald-400 dark:hover:border-emerald-700',
  },
  warning: {
    icon: 'bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400',
    bar: 'bg-amber-500',
    tint: 'from-amber-50/80 dark:from-amber-950/25',
    border: 'border-amber-200/70 dark:border-amber-900/50',
    hover: 'hover:border-amber-400 dark:hover:border-amber-700',
  },
  danger: {
    icon: 'bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400',
    bar: 'bg-red-500',
    tint: 'from-red-50/80 dark:from-red-950/25',
    border: 'border-red-200/70 dark:border-red-900/50',
    hover: 'hover:border-red-400 dark:hover:border-red-700',
  },
  neutral: {
    icon: 'bg-surface-2 text-muted',
    bar: 'bg-[var(--border-strong)]',
    tint: 'from-transparent',
    border: 'border-app',
    hover: 'hover:border-app-strong',
  },
}

export function StatCard({ label, value, hint, delta, icon: Icon, tone = 'brand', loading, onClick }) {
  const t = STAT_TONES[tone] || STAT_TONES.brand
  const Wrapper = onClick ? 'button' : 'div'

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cx(
        'bg-surface relative overflow-hidden rounded-[--radius-card] border p-4 text-left shadow-soft transition-colors',
        t.border,
        onClick && cx('cursor-pointer', t.hover),
      )}
    >
      {/* Yuqoridagi rangli chiziq — kartani bir qarashda ajratadi */}
      <span className={cx('absolute inset-x-0 top-0 h-[3px]', t.bar)} aria-hidden />
      {/* Yumshoq rangli tovlanish — oq fon tekis bo'lib qolmasligi uchun */}
      <span
        className={cx('pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b to-transparent', t.tint)}
        aria-hidden
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <p className="text-muted text-[13px] font-medium">{label}</p>
          {Icon && (
            <span className={cx('grid size-8 shrink-0 place-items-center rounded-lg', t.icon)}>
              <Icon size={16} aria-hidden />
            </span>
          )}
        </div>

        {loading ? (
          <Skeleton className="mt-2.5 h-7 w-24" />
        ) : (
          <p
            className={cx(
              'text-app tabular mt-1.5 leading-tight font-semibold break-words',
              valueSizeClass(value),
            )}
            title={typeof value === 'string' ? value : undefined}
          >
            {value}
          </p>
        )}

        <div className="mt-1 flex items-center gap-2">
          {typeof delta === 'number' && Number.isFinite(delta) && (
            <span
              className={cx(
                'inline-flex items-center gap-0.5 text-[12px] font-medium',
                delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
              )}
            >
              {delta >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {hint && <span className="text-faint truncate text-[12px]">{hint}</span>}
        </div>
      </div>
    </Wrapper>
  )
}

/* ===== Bo'sh holat =============================================== */

export function EmptyState({ icon: Icon = Inbox, title, hint, action, className, compact = false }) {
  const { t } = useTranslation()
  return (
    <div className={cx('flex flex-col items-center justify-center text-center', compact ? 'py-10' : 'py-16', className)}>
      <span className="bg-surface-2 text-faint mb-3 grid size-12 place-items-center rounded-2xl">
        <Icon size={22} aria-hidden />
      </span>
      <p className="text-app text-[15px] font-medium">{title || t('common.noData')}</p>
      {hint !== null && <p className="text-muted mt-1 max-w-sm text-[13px]">{hint ?? t('common.noDataHint')}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/* ===== Xato holati =============================================== */

export function ErrorState({ message, onRetry, compact = false, className }) {
  const { t } = useTranslation()
  return (
    <div className={cx('flex flex-col items-center justify-center text-center', compact ? 'py-8' : 'py-14', className)}>
      <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400">
        <AlertCircle size={22} aria-hidden />
      </span>
      <p className="text-app text-[15px] font-medium">{t('errors.title')}</p>
      {message && <p className="text-muted mt-1 max-w-md text-[13px]">{message}</p>}
      {onRetry && (
        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRetry} className="mt-4">
          {t('common.retry')}
        </Button>
      )}
    </div>
  )
}

/* ===== Segmented control ========================================= */

/**
 * Kichik variantlar to'plami uchun (mavzu, til, davr).
 * @param {Array<{value: string, label: string, icon?: Function}>} options
 */
export function Segmented({ value, onChange, options, size = 'md', className, ariaLabel }) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cx('bg-surface-2 inline-flex gap-0.5 rounded-lg border p-0.5', className)}
    >
      {options.map((o) => {
        const active = o.value === value
        const Icon = o.icon
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            title={o.title || o.label}
            className={cx(
              'inline-flex items-center justify-center gap-1.5 rounded-[7px] font-medium transition-colors',
              size === 'sm' ? 'h-7 px-2 text-[12px]' : 'h-8 px-3 text-[13px]',
              active ? 'bg-surface text-app shadow-soft' : 'text-muted hover:text-app',
            )}
          >
            {Icon && <Icon size={14} aria-hidden />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ===== Tabs ====================================================== */

export function Tabs({ value, onChange, tabs, className }) {
  return (
    <div className={cx('border-app flex gap-1 overflow-x-auto border-b', className)} role="tablist">
      {tabs.map((tab) => {
        const active = tab.value === value
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cx(
              'relative shrink-0 px-3.5 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors',
              active ? 'text-brand-600 dark:text-brand-400' : 'text-muted hover:text-app',
            )}
          >
            <span className="inline-flex items-center gap-2">
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={cx(
                    'tabular rounded px-1.5 py-0.5 text-[11px]',
                    active ? 'bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300' : 'bg-surface-2 text-muted',
                  )}
                >
                  {tab.count}
                </span>
              )}
            </span>
            {active && <span className="bg-brand-600 dark:bg-brand-400 absolute inset-x-0 -bottom-px h-0.5 rounded-full" />}
          </button>
        )
      })}
    </div>
  )
}

/* ===== Ma'lumot qatori (detail view uchun) ======================= */

export function Field({ label, children, className, mono = false }) {
  return (
    <div className={cx('min-w-0', className)}>
      <dt className="text-faint text-[12px] font-medium">{label}</dt>
      <dd className={cx('text-app mt-0.5 text-[13.5px] break-words', mono && 'font-mono text-[12.5px]')}>
        {children ?? '—'}
      </dd>
    </div>
  )
}

export function FieldGrid({ children, cols = 2, className }) {
  return (
    <dl
      className={cx(
        'grid gap-x-6 gap-y-4',
        cols === 2 && 'sm:grid-cols-2',
        cols === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        cols === 4 && 'sm:grid-cols-2 lg:grid-cols-4',
        className,
      )}
    >
      {children}
    </dl>
  )
}
