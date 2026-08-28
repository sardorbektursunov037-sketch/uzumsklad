import { useTranslation } from 'react-i18next'
import { ImageOff, Calendar } from 'lucide-react'
import { cx, toInputDate, fromInputDate, daysAgo } from '../utils/format'
import { Badge, Select, Segmented } from './ui'
import {
  ORDER_STATUS_TONE,
  PRODUCT_STATUS_TONE,
  MODERATION_TONE,
  FBS_INVOICE_TONE,
  FINANCE_STATUS_TONE,
  PAYMENT_STATUS_TONE,
  PRODUCT_RANK_TONE,
} from '../api/constants'

/* ===== Status nishonlari ========================================= */

const TONE_MAPS = {
  orderStatus: ORDER_STATUS_TONE,
  productStatus: PRODUCT_STATUS_TONE,
  moderation: MODERATION_TONE,
  fbsInvoiceStatus: FBS_INVOICE_TONE,
  financeStatus: FINANCE_STATUS_TONE,
  paymentStatus: PAYMENT_STATUS_TONE,
  rank: PRODUCT_RANK_TONE,
}

/**
 * Enum qiymatini tarjima qilib, mos rangdagi nishon sifatida ko'rsatadi.
 *
 * @param {string} group  'orderStatus' | 'productStatus' | 'fbsInvoiceStatus' | ...
 * @param {string} value  enum qiymati (CREATED, ACCEPTED, ...)
 * @param {string} [fallback]  API o'z matnini bergan bo'lsa (masalan InvoiceStatus.text)
 */
export function StatusBadge({ group, value, fallback, size, dot = true, className }) {
  const { t } = useTranslation()
  if (!value && !fallback) return <span className="text-faint">—</span>

  const tone = TONE_MAPS[group]?.[value] || 'neutral'
  const key = `enums.${group}.${value}`
  const translated = value ? t(key) : null
  const label = translated && translated !== key ? translated : fallback || value

  return (
    <Badge tone={tone} size={size} dot={dot} className={className}>
      {label}
    </Badge>
  )
}

/** Sxema (FBS/DBS) nishoni — buyurtmalar jadvalida ajratib turadi */
export function SchemeBadge({ scheme }) {
  if (!scheme) return null
  return (
    <Badge tone={scheme === 'DBS' ? 'info' : 'neutral'} size="sm" dot={false} className="font-mono">
      {scheme}
    </Badge>
  )
}

/* ===== Mahsulot rasmi ============================================ */

export function Thumb({ src, alt, size = 40, className }) {
  if (!src) {
    return (
      <span
        className={cx('bg-surface-2 text-faint grid shrink-0 place-items-center rounded-lg border', className)}
        style={{ width: size, height: size }}
        aria-hidden
      >
        <ImageOff size={size * 0.4} />
      </span>
    )
  }
  return (
    <img
      src={src}
      alt={alt || ''}
      loading="lazy"
      width={size}
      height={size}
      className={cx('bg-surface-2 shrink-0 rounded-lg border object-cover', className)}
      style={{ width: size, height: size }}
      onError={(e) => {
        e.currentTarget.style.visibility = 'hidden'
      }}
    />
  )
}

/** Rasm + nom + qo'shimcha satr — jadvallarda ko'p ishlatiladi */
export function ProductCell({ image, title, subtitle, size = 40, href }) {
  const body = (
    <div className="flex min-w-0 items-center gap-3">
      <Thumb src={image} alt={title} size={size} />
      <div className="min-w-0">
        <p className="text-app truncate text-[13.5px] font-medium" title={title}>
          {title || '—'}
        </p>
        {subtitle && (
          <p className="text-faint truncate text-[12px]" title={subtitle}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  )
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="hover:text-brand-600 block">
      {body}
    </a>
  ) : (
    body
  )
}

/* ===== Do'kon tanlagich ========================================== */

export function ShopSelect({ shops, value, onChange, includeAll = false, className, label }) {
  const { t } = useTranslation()
  const options = [
    ...(includeAll ? [{ value: '', label: t('common.allShops') }] : []),
    ...shops.map((s) => ({ value: s.id, label: s.name || `#${s.id}` })),
  ]

  return (
    <Select
      label={label}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      options={options}
      placeholder={shops.length === 0 ? t('common.selectShop') : undefined}
      disabled={shops.length === 0}
      className={cx('min-w-[11rem]', className)}
      aria-label={t('common.shop')}
    />
  )
}

/* ===== Sana oralig'i filtri ====================================== */

const PRESETS = [
  { days: null, key: 'common.allTime' },
  { days: 7, key: 'common.last7days' },
  { days: 30, key: 'common.last30days' },
  { days: 90, key: 'common.last90days' },
]

/**
 * @param {object} value  `{ dateFrom, dateTo }` — epoch millisekundlarda
 */
export function DateRangeFilter({ value, onChange, showPresets = true, className }) {
  const { t } = useTranslation()

  // Sana filtri umuman qo'yilmagan bo'lsa — «Barchasi» faol
  const activePreset = PRESETS.find((p) =>
    p.days === null
      ? value.dateFrom === undefined && value.dateTo === undefined
      : value.dateFrom === daysAgo(p.days) && !value.dateTo,
  )?.days

  return (
    <div className={cx('flex flex-wrap items-end gap-2', className)}>
      {showPresets && (
        <Segmented
          size="sm"
          ariaLabel={t('common.period')}
          value={activePreset === null ? 'all' : (activePreset ?? '')}
          onChange={(days) =>
            onChange(
              days === 'all'
                ? { dateFrom: undefined, dateTo: undefined }
                : { dateFrom: daysAgo(days), dateTo: undefined },
            )
          }
          options={PRESETS.map((p) => ({ value: p.days === null ? 'all' : p.days, label: t(p.key) }))}
        />
      )}

      <label className="relative">
        <span className="sr-only">{t('common.dateFrom')}</span>
        <Calendar size={14} className="text-faint pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2" aria-hidden />
        <input
          type="date"
          value={toInputDate(value.dateFrom)}
          onChange={(e) => onChange({ ...value, dateFrom: fromInputDate(e.target.value) })}
          className="bg-surface text-app h-8 rounded-lg border pr-2 pl-8 text-[13px] focus:outline-none"
        />
      </label>

      <span className="text-faint pb-1.5 text-[13px]">—</span>

      <label className="relative">
        <span className="sr-only">{t('common.dateTo')}</span>
        <Calendar size={14} className="text-faint pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2" aria-hidden />
        <input
          type="date"
          value={toInputDate(value.dateTo)}
          onChange={(e) => onChange({ ...value, dateTo: fromInputDate(e.target.value, true) })}
          className="bg-surface text-app h-8 rounded-lg border pr-2 pl-8 text-[13px] focus:outline-none"
        />
      </label>
    </div>
  )
}

/* ===== Filtrlar paneli =========================================== */

export function FilterBar({ children, onReset, className }) {
  const { t } = useTranslation()
  return (
    <div className={cx('bg-surface mb-4 flex flex-wrap items-end gap-3 rounded-[--radius-card] border p-3.5 shadow-soft', className)}>
      {children}
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="text-muted hover:text-app ml-auto h-8 shrink-0 px-2 text-[13px] font-medium transition-colors"
        >
          {t('common.resetFilters')}
        </button>
      )}
    </div>
  )
}

/* ===== Muddat ko'rsatkichi ======================================= */

/**
 * Buyurtmani qabul qilish/yetkazish muddati.
 * Muddat o'tgan bo'lsa qizil, 6 soatdan kam qolgan bo'lsa sariq.
 */
export function DeadlineCell({ deadline: dl, text }) {
  const { t } = useTranslation()
  if (!dl) return <span className="text-faint">—</span>

  return (
    <span
      className={cx(
        'tabular text-[13px]',
        dl.overdue && 'font-medium text-red-600 dark:text-red-400',
        dl.urgent && 'font-medium text-amber-600 dark:text-amber-400',
      )}
      title={dl.text}
    >
      {text}
      {(dl.overdue || dl.urgent) && (
        <span className="ml-1.5 text-[11px] opacity-80">
          {dl.overdue ? t('orders.overdue') : t('orders.urgent')}
        </span>
      )}
    </span>
  )
}
