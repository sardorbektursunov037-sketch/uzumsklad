import { useTranslation } from 'react-i18next'
import { Database, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import { useTheme } from '../context/ThemeContext'
import { cx, dateTime, toQueryPreview } from '../utils/format'

/**
 * Ma'lumot qayerdan olinganini ko'rsatuvchi belgi.
 *
 * Faqat «Dev rejim» yoqilganda chiziladi (Sozlamalar → Ko'rinish).
 * Maqsadi — ekrandagi har bir raqam qaysi Uzum endpointidan, qanday
 * parametrlar bilan kelganini tekshirish imkonini berish.
 *
 * @param {Array<{method?: string, path: string, params?: object, count?: number, at?: number}>} sources
 */
export function DevSource({ sources = [], className, compact = false }) {
  const { t } = useTranslation()
  const { devMode } = useTheme()
  const [open, setOpen] = useState(!compact)

  if (!devMode || sources.length === 0) return null

  return (
    <div
      className={cx(
        'rounded-lg border border-dashed px-3 py-2',
        'border-brand-300 bg-brand-50/40 dark:border-brand-800 dark:bg-brand-950/25',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <Database size={13} className="text-brand-600 dark:text-brand-400 shrink-0" aria-hidden />
        <span className="text-brand-700 dark:text-brand-300 text-[11.5px] font-semibold tracking-wide uppercase">
          {t('dev.source')}
        </span>
        <span className="text-faint text-[11.5px]">({sources.length})</span>
        <ChevronRight
          size={12}
          className={cx('text-faint ml-auto shrink-0 transition-transform', open && 'rotate-90')}
        />
      </button>

      {open && (
        <ul className="mt-1.5 space-y-1.5">
          {sources.map((s, i) => (
            <li key={i} className="font-mono text-[11.5px] leading-relaxed break-all">
              <span className="text-emerald-700 dark:text-emerald-400">{s.method || 'GET'}</span>{' '}
              <span className="text-app">{s.path}</span>
              {s.params && Object.keys(s.params).length > 0 && (
                <span className="text-muted">{toQueryPreview(s.params)}</span>
              )}
              {(s.count !== undefined || s.at) && (
                <span className="text-faint block">
                  {s.count !== undefined && `${s.count} ${t('dev.records')}`}
                  {s.count !== undefined && s.at ? ' · ' : ''}
                  {s.at ? dateTime(s.at) : ''}
                </span>
              )}
              {s.note && <span className="text-faint block not-italic">{s.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
