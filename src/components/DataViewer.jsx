import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Copy, Check, Braces, Download, ExternalLink } from 'lucide-react'

import { cx, money, num, dateTime, toDate, base64ToBlob, downloadBlob } from '../utils/format'
import { Badge, Button } from './ui'

/* ===== Maydon turini aniqlash ==================================== */

/** Qiymati pul birligida bo'lgan maydonlar (Uzum barcha summalarni butun so'mda beradi) */
const MONEY_KEYS = new Set([
  'price',
  'fullPrice',
  'sellPrice',
  'purchasePrice',
  'sellerPrice',
  'acceptedPrice',
  'paymentPrice',
  'commission',
  'minCommission',
  'maxCommission',
  'sellerProfit',
  'withdrawnProfit',
  'logisticDeliveryFee',
  'turnover',
  'paidStorageAmount',
  'paidStoragePriceItem',
])

/** Sana/vaqt maydonlari */
const isDateKey = (key) =>
  /(^date|Date$|DateTime$|Until$|^timestamp$|^executionDate$|^dateService$)/.test(key)

/** Base64 hujjat — katta satrni ko'rsatish o'rniga yuklab olish tugmasi beriladi */
const isDocKey = (key) => /^document$|Document$|closingDocument/i.test(key)

const IMAGE_RE = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i

const isImageUrl = (v) => typeof v === 'string' && /^https?:\/\//.test(v) && IMAGE_RE.test(v)

const isUrl = (v) => typeof v === 'string' && /^https?:\/\//.test(v)

/** camelCase → «Camel case» (lug'atda tarjima topilmaganda) */
function humanize(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
}

/**
 * Ichma-ich joylashgan obyektdan barcha rasm havolalarini yig'adi.
 * Uzum ProductImageDto ko'rinishi: { photo: { "240": { high, low }, "540": {...} }, url }
 */
function collectImages(value, acc = [], depth = 0) {
  if (depth > 4 || acc.length >= 12) return acc
  if (isImageUrl(value)) {
    if (!acc.includes(value)) acc.push(value)
    return acc
  }
  if (Array.isArray(value)) {
    for (const v of value) collectImages(v, acc, depth + 1)
    return acc
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectImages(v, acc, depth + 1)
  }
  return acc
}

/* ===== Bitta qiymatni chizish ==================================== */

function Value({ name, value, lang, t }) {
  const [expanded, setExpanded] = useState(false)

  if (value === null || value === undefined || value === '') {
    return <span className="text-faint">—</span>
  }

  if (typeof value === 'boolean') {
    return (
      <Badge tone={value ? 'success' : 'neutral'} size="sm" dot={false}>
        {value ? t('common.yes') : t('common.no')}
      </Badge>
    )
  }

  if (typeof value === 'number') {
    if (MONEY_KEYS.has(name)) return <span className="tabular font-medium">{money(value, lang)}</span>
    if (isDateKey(name) && value > 1e9) return <span className="tabular">{dateTime(value, lang)}</span>
    return <span className="tabular">{num(value, lang)}</span>
  }

  if (typeof value === 'string') {
    if (isDocKey(name) && value.length > 200) {
      return (
        <Button
          size="sm"
          variant="secondary"
          icon={Download}
          onClick={() => downloadBlob(base64ToBlob(value), `uzum-${name}-${Date.now()}.pdf`)}
        >
          PDF
        </Button>
      )
    }

    if (isImageUrl(value)) {
      return (
        <a href={value} target="_blank" rel="noreferrer" title={t('common.openImage')}>
          <img
            src={value}
            alt=""
            loading="lazy"
            className="bg-surface-2 size-14 rounded-lg border object-cover"
          />
        </a>
      )
    }

    if (isUrl(value)) {
      return (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="text-brand-600 dark:text-brand-400 inline-flex items-center gap-1 break-all"
        >
          {value.length > 60 ? `${value.slice(0, 60)}…` : value}
          <ExternalLink size={12} className="shrink-0" />
        </a>
      )
    }

    // ISO sana ko'rinishidagi satr
    if (isDateKey(name) || /^\d{4}-\d{2}-\d{2}[T ]/.test(value)) {
      const d = toDate(value)
      if (d) return <span className="tabular">{dateTime(d, lang)}</span>
    }

    if (value.length > 220) {
      return (
        <span className="break-words">
          {expanded ? value : `${value.slice(0, 220)}…`}{' '}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-brand-600 dark:text-brand-400 text-[12px] font-medium"
          >
            {expanded ? t('common.collapse') : t('common.expand')}
          </button>
        </span>
      )
    }

    return <span className="break-words">{value}</span>
  }

  return null
}

/* ===== Rekursiv daraxt =========================================== */

function Node({ name, value, lang, t, depth = 0 }) {
  const [open, setOpen] = useState(depth < 1)
  const label = t(`fields.${name}`, { defaultValue: humanize(name) })

  // Primitiv qiymat — oddiy qator
  const isPrimitive = value === null || value === undefined || typeof value !== 'object'
  if (isPrimitive) {
    return (
      <div className="border-app grid grid-cols-[minmax(9rem,38%)_1fr] gap-3 border-b py-2 last:border-0">
        <dt className="text-muted text-[12.5px]">{label}</dt>
        <dd className="text-app min-w-0 text-[13px]">
          <Value name={name} value={value} lang={lang} t={t} />
        </dd>
      </div>
    )
  }

  // Massiv
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <div className="border-app grid grid-cols-[minmax(9rem,38%)_1fr] gap-3 border-b py-2 last:border-0">
          <dt className="text-muted text-[12.5px]">{label}</dt>
          <dd className="text-faint text-[13px]">{t('common.empty')}</dd>
        </div>
      )
    }

    // Primitivlar massivi — bitta qatorda
    if (value.every((v) => v === null || typeof v !== 'object')) {
      return (
        <div className="border-app grid grid-cols-[minmax(9rem,38%)_1fr] gap-3 border-b py-2 last:border-0">
          <dt className="text-muted text-[12.5px]">{label}</dt>
          <dd className="text-app flex flex-wrap gap-1.5 text-[13px]">
            {value.map((v, i) => (
              <Badge key={i} size="sm" dot={false}>
                <Value name={name} value={v} lang={lang} t={t} />
              </Badge>
            ))}
          </dd>
        </div>
      )
    }

    return (
      <div className="border-app border-b py-2 last:border-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-app flex w-full items-center gap-1.5 text-left text-[12.5px] font-medium"
        >
          <ChevronRight size={13} className={cx('text-faint transition-transform', open && 'rotate-90')} />
          {label}
          <span className="text-faint font-normal">({value.length})</span>
        </button>
        {open && (
          <div className="mt-2 space-y-2 pl-4">
            {value.map((item, i) => (
              <div key={i} className="border-app bg-surface-2 rounded-lg border p-3">
                <p className="text-faint mb-1.5 text-[11px] font-semibold">#{i + 1}</p>
                <Tree data={item} lang={lang} t={t} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Obyekt
  return (
    <div className="border-app border-b py-2 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-app flex w-full items-center gap-1.5 text-left text-[12.5px] font-medium"
      >
        <ChevronRight size={13} className={cx('text-faint transition-transform', open && 'rotate-90')} />
        {label}
      </button>
      {open && (
        <div className="mt-1.5 pl-4">
          <Tree data={value} lang={lang} t={t} depth={depth + 1} />
        </div>
      )}
    </div>
  )
}

function Tree({ data, lang, t, depth = 0, exclude = [] }) {
  if (!data || typeof data !== 'object') {
    return <Value name="" value={data} lang={lang} t={t} />
  }
  const entries = Object.entries(data).filter(([k]) => !exclude.includes(k))
  if (!entries.length) return <p className="text-faint py-2 text-[13px]">{t('common.empty')}</p>

  return (
    <dl>
      {entries.map(([key, value]) => (
        <Node key={key} name={key} value={value} lang={lang} t={t} depth={depth} />
      ))}
    </dl>
  )
}

/* ===== Tashqi komponent ========================================== */

/**
 * API qaytargan obyektning BARCHA maydonlarini ko'rsatadi.
 *
 * Maydon nomlari `fields.*` lug'atidan tarjima qilinadi; lug'atda bo'lmagan
 * yangi maydonlar ham yo'qolmaydi — nomi o'qiladigan ko'rinishga keltiriladi.
 *
 * @param {object} data       ko'rsatiladigan obyekt
 * @param {string[]} [exclude] chetlab o'tiladigan kalitlar
 */
export function DataViewer({ data, title, hint, exclude = [], defaultOpen = false, className }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const [open, setOpen] = useState(defaultOpen)
  const [raw, setRaw] = useState(false)
  const [copied, setCopied] = useState(false)

  const images = useMemo(() => collectImages(data), [data])

  if (!data || typeof data !== 'object') return null

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard ruxsati yo'q — e'tiborsiz */
    }
  }

  return (
    <section className={cx('bg-surface rounded-[--radius-card] border shadow-soft', className)}>
      <div className="flex items-start justify-between gap-3 p-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronRight size={15} className={cx('text-faint shrink-0 transition-transform', open && 'rotate-90')} />
          <span className="min-w-0">
            <span className="text-app block text-[14px] font-semibold">{title || t('common.allFields')}</span>
            <span className="text-faint block text-[12px]">{hint ?? t('common.allFieldsHint')}</span>
          </span>
        </button>

        <div className="flex shrink-0 gap-1">
          <Button size="iconSm" variant="ghost" onClick={() => setRaw((v) => !v)} title={raw ? t('common.hideRaw') : t('common.showRaw')}>
            <Braces size={14} />
          </Button>
          <Button size="iconSm" variant="ghost" onClick={copyJson} title={t('common.copyJson')}>
            {copied ? <Check size={14} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={14} />}
          </Button>
        </div>
      </div>

      {open && (
        <div className="border-app border-t px-4 pb-4">
          {images.length > 0 && (
            <div className="border-app border-b py-3">
              <p className="text-muted mb-2 text-[12.5px] font-medium">{t('common.photos')}</p>
              <div className="flex flex-wrap gap-2">
                {images.map((src) => (
                  <a key={src} href={src} target="_blank" rel="noreferrer" title={t('common.openImage')}>
                    <img
                      src={src}
                      alt=""
                      loading="lazy"
                      className="bg-surface-2 size-16 rounded-lg border object-cover transition-transform hover:scale-105"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {raw ? (
            <pre className="bg-surface-2 text-app mt-3 max-h-96 overflow-auto rounded-lg p-3 font-mono text-[11.5px] whitespace-pre-wrap">
              {JSON.stringify(data, null, 2)}
            </pre>
          ) : (
            <Tree data={data} lang={lang} t={t} exclude={exclude} />
          )}
        </div>
      )}
    </section>
  )
}
