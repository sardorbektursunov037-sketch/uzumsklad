import { useTranslation } from 'react-i18next'
import { CalendarRange } from 'lucide-react'

import { cx, date as fmtDate } from '../utils/format'

/**
 * Qaysi muddatdan qaysi muddatgacha ma'lumot ko'rsatilayotganini yozadi.
 *
 * Sana tanlanmagan bo'lsa «Butun davr» deb ko'rsatiladi — bu holda Uzum
 * eng yangi yozuvlardan boshlab qaytaradi.
 */
export function PeriodLabel({ dateFrom, dateTo, count, className }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage

  const from = dateFrom ? fmtDate(dateFrom, lang) : null
  const to = dateTo ? fmtDate(dateTo, lang) : fmtDate(Date.now(), lang)

  return (
    <span
      className={cx(
        'text-muted inline-flex flex-wrap items-center gap-1.5 text-[12.5px]',
        className,
      )}
    >
      <CalendarRange size={13} className="text-faint shrink-0" aria-hidden />
      <span className="font-medium">{t('common.periodShown')}:</span>
      <span className="tabular text-app">
        {from ? `${from} — ${to}` : t('common.allTimePeriod')}
      </span>
      {count !== undefined && count !== null && (
        <span className="text-faint tabular">
          · {count} {t('dev.records')}
        </span>
      )}
    </span>
  )
}
