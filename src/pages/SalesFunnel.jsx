import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Filter, Store, Download, ShoppingCart, CheckCircle2, XCircle, Clock } from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import { useBulkLoad } from '../hooks/useBulkLoad'
import { cacheKey as ck } from '../api/cache'
import { useApiMessage } from '../hooks/useApi'
import { fetchOrdersForStatuses } from '../api/bulk'
import { ORDER_STATUSES, ORDER_SCHEMES } from '../api/constants'
import { money, num, percent, cx, daysAgo, toDate } from '../utils/format'
import { exportCsv, csvNum } from '../utils/csv'
import {
  PageHeader,
  Card,
  CardHeader,
  StatCard,
  DataTable,
  Button,
  Select,
  EmptyState,
  ErrorState,
  Spinner,
} from '../components/ui'
import { StatusBadge, FilterBar, DateRangeFilter } from '../components/common'
import { DevSource } from '../components/DevSource'
import { PeriodLabel } from '../components/PeriodLabel'

/**
 * Savdo voronkasi (Воронка продаж).
 *
 * Uzum API buyurtmaning status tarixini bermaydi — faqat joriy holatini.
 * Shuning uchun voronka snapshotdan quriladi: buyurtma `COMPLETED` bo'lsa,
 * u avvalgi barcha bosqichlardan o'tgan. Ya'ni «bosqichga yetgan» soni =
 * shu bosqich va undan keyingi barcha bosqichlardagi buyurtmalar yig'indisi.
 *
 *   Konversiya = yetgan[i] / yetgan[i−1]
 *   Vaqt       = shu statusda hozir turgan buyurtmalarning o'rtacha yoshi
 *
 * Bekor qilingan va qaytarilganlar voronkadan tashqarida ko'rsatiladi —
 * ular qaysi bosqichda chiqib ketgani API'dan bilinmaydi.
 */

// Voronka bosqichlari — Uzum FBS oqimi tartibida
const FUNNEL_STAGES = [
  'CREATED',
  'PACKING',
  'PENDING_DELIVERY',
  'DELIVERING',
  'DELIVERED',
  'ACCEPTED_AT_DP',
  'DELIVERED_TO_CUSTOMER_DELIVERY_POINT',
  'COMPLETED',
]

/** Voronkadan chiqib ketgan holatlar */
const EXIT_STAGES = ['PENDING_CANCELLATION', 'CANCELED', 'RETURNED']

const DEFAULT_RANGE = { dateFrom: daysAgo(90), dateTo: undefined }

/** Buyurtmaning yoshi (kunlarda) */
const ageDays = (order) => {
  const d = toDate(order.dateCreated)
  return d ? (Date.now() - d.getTime()) / 864e5 : null
}

export default function SalesFunnel() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const { shopIds } = useAuth()
  const message = useApiMessage()

  const [range, setRange] = useState(DEFAULT_RANGE)
  const [scheme, setScheme] = useState('')

  const idsKey = shopIds.join(',')
  const ids = useMemo(() => (idsKey ? idsKey.split(',').map(Number) : []), [idsKey])

  const load = useCallback(
    (signal, onProgress) =>
      fetchOrdersForStatuses(
        {
          shopIds: ids,
          statuses: ORDER_STATUSES,
          scheme: scheme || undefined,
          dateFrom: range.dateFrom,
          dateTo: range.dateTo,
        },
        signal,
        onProgress,
      ),
    [ids, scheme, range.dateFrom, range.dateTo],
  )

  const { data, loading, error, loaded, reload } = useBulkLoad(
    load,
    [idsKey, scheme, range.dateFrom, range.dateTo],
    { skip: ids.length === 0, cacheKey: ck('funnel', { ids: idsKey, scheme, from: range.dateFrom, to: range.dateTo }) },
  )

  const orders = useMemo(() => data?.orders || [], [data])

  /** Status bo'yicha soni, summasi va o'rtacha yoshi */
  const byStatus = useMemo(() => {
    const map = {}
    for (const status of [...FUNNEL_STAGES, ...EXIT_STAGES]) {
      map[status] = { status, count: 0, sum: 0, ageSum: 0, ageCount: 0 }
    }

    for (const o of orders) {
      const cell = map[o.status]
      if (!cell) continue
      cell.count++
      cell.sum += Number(o.price) || 0
      const age = ageDays(o)
      if (age !== null) {
        cell.ageSum += age
        cell.ageCount++
      }
    }

    for (const cell of Object.values(map)) {
      cell.avgAge = cell.ageCount > 0 ? cell.ageSum / cell.ageCount : null
    }
    return map
  }, [orders])

  /** Voronka qatorlari — «yetgan» soni oxiridan boshlab to'planadi */
  const stages = useMemo(() => {
    const rows = []
    let reached = 0
    let reachedSum = 0

    // Teskari yo'nalishda yurib, har bosqichga yetganlar sonini yig'amiz
    for (let i = FUNNEL_STAGES.length - 1; i >= 0; i--) {
      const status = FUNNEL_STAGES[i]
      const cell = byStatus[status]
      reached += cell.count
      reachedSum += cell.sum
      rows.unshift({ ...cell, reached, reachedSum })
    }

    const top = rows[0]?.reached || 0
    let prev = null
    for (const row of rows) {
      row.share = top > 0 ? (row.reached / top) * 100 : 0
      row.conversion = prev === null ? null : prev > 0 ? (row.reached / prev) * 100 : 0
      prev = row.reached
    }

    return rows
  }, [byStatus])

  const exits = useMemo(
    () => EXIT_STAGES.map((status) => byStatus[status]).filter((c) => c.count > 0),
    [byStatus],
  )

  const totals = useMemo(() => {
    const entered = stages[0]?.reached || 0
    const completed = byStatus.COMPLETED?.count || 0
    const canceled = (byStatus.CANCELED?.count || 0) + (byStatus.PENDING_CANCELLATION?.count || 0)
    const returned = byStatus.RETURNED?.count || 0
    const all = entered + canceled + returned
    return {
      all,
      entered,
      completed,
      canceled,
      returned,
      sum: orders.reduce((s, o) => s + (Number(o.price) || 0), 0),
      completionRate: all > 0 ? (completed / all) * 100 : null,
      cancelRate: all > 0 ? (canceled / all) * 100 : null,
    }
  }, [stages, byStatus, orders])

  const handleExport = () => {
    exportCsv(
      [...stages, ...exits.map((e) => ({ ...e, reached: e.count, reachedSum: e.sum, exit: true }))],
      [
        {
          key: 'status',
          header: t('common.status'),
          value: (r) => t(`enums.orderStatus.${r.status}`, r.status),
        },
        { key: 'reached', header: t('funnel.reached'), value: (r) => csvNum(r.reached) },
        { key: 'count', header: t('funnel.current'), value: (r) => csvNum(r.count) },
        {
          key: 'share',
          header: t('funnel.share'),
          value: (r) => (r.share === undefined ? '' : csvNum(r.share.toFixed(1))),
        },
        {
          key: 'conversion',
          header: t('funnel.conversion'),
          value: (r) => (r.conversion === null || r.conversion === undefined ? '' : csvNum(r.conversion.toFixed(1))),
        },
        {
          key: 'avgAge',
          header: t('funnel.avgTime'),
          value: (r) => (r.avgAge === null ? '' : csvNum(r.avgAge.toFixed(1))),
        },
        { key: 'reachedSum', header: t('common.amount'), value: (r) => csvNum(Math.round(r.reachedSum)) },
      ],
      `savdo-voronkasi-${new Date().toISOString().slice(0, 10)}.csv`,
    )
  }

  const columns = useMemo(
    () => [
      {
        key: 'status',
        header: t('common.status'),
        width: '22%',
        render: (r) => <StatusBadge group="orderStatus" value={r.status} size="sm" />,
      },
      {
        key: 'reached',
        header: t('funnel.reached'),
        align: 'right',
        render: (r) => (
          <span className="tabular text-app text-[13.5px] font-medium">
            {num(r.reached, lang)}
            {r.share !== undefined && (
              <span className="text-faint ml-1.5 text-[11.5px]">{r.share.toFixed(1)}%</span>
            )}
          </span>
        ),
      },
      {
        key: 'bar',
        header: '',
        width: '26%',
        render: (r) => (
          <div className="bg-surface-2 h-2.5 w-full overflow-hidden rounded-full">
            <div
              className="bg-brand-500 h-full rounded-full transition-[width]"
              style={{ width: `${Math.max(0, Math.min(100, r.share ?? 0))}%` }}
            />
          </div>
        ),
      },
      {
        key: 'current',
        header: t('funnel.current'),
        align: 'right',
        render: (r) => <span className="text-muted tabular text-[13px]">{num(r.count, lang)}</span>,
      },
      {
        key: 'avgAge',
        header: t('funnel.avgTime'),
        align: 'right',
        render: (r) =>
          r.avgAge === null ? (
            <span className="text-faint">—</span>
          ) : (
            <span className="text-muted tabular text-[13px]">{t('problems.daysN', { n: r.avgAge.toFixed(1) })}</span>
          ),
      },
      {
        key: 'conversion',
        header: t('funnel.conversion'),
        align: 'right',
        render: (r) =>
          r.conversion === null || r.conversion === undefined ? (
            <span className="text-faint">—</span>
          ) : (
            <span
              className={cx(
                'tabular text-[13px] font-medium',
                r.conversion >= 90
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : r.conversion >= 60
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-red-600 dark:text-red-400',
              )}
            >
              {r.conversion.toFixed(1)}%
            </span>
          ),
      },
      {
        key: 'sum',
        header: t('common.amount'),
        align: 'right',
        render: (r) => (
          <span className="tabular text-[13.5px]">{money(Math.round(r.reachedSum ?? r.sum), lang, { currency: false })}</span>
        ),
      },
    ],
    [t, lang],
  )

  if (ids.length === 0) {
    return (
      <>
        <PageHeader title={t('funnel.title')} subtitle={t('funnel.subtitle')} />
        <Card>
          <EmptyState icon={Store} title={t('errors.noShopSelected')} hint={t('errors.shopRequired')} />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader title={t('funnel.title')} subtitle={t('funnel.subtitle')}>
        <Button variant="secondary" icon={Download} onClick={handleExport} disabled={orders.length === 0}>
          {t('common.exportCsv')}
        </Button>
      </PageHeader>

      <DevSource
        className="mb-4"
        compact
        sources={[
          {
            path: '/v2/fbs/orders',
            params: {
              shopIds: ids,
              status: ORDER_STATUSES,
              scheme: scheme || undefined,
              dateFrom: range.dateFrom,
              dateTo: range.dateTo,
              size: 50,
            },
            count: orders.length,
            note: t('funnel.sourceNote'),
          },
        ]}
      />

      <FilterBar
        onReset={() => {
          setRange(DEFAULT_RANGE)
          setScheme('')
        }}
      >
        <DateRangeFilter value={range} onChange={setRange} />
        <Select
          label={t('orders.scheme')}
          value={scheme}
          onChange={(e) => setScheme(e.target.value)}
          placeholder={t('common.all')}
          options={ORDER_SCHEMES.map((s) => ({ value: s, label: t(`enums.scheme.${s}`, s) }))}
          className="w-32"
        />
      </FilterBar>

      {loading && (
        <Card className="mb-4">
          <div className="flex items-center justify-center gap-3 py-6">
            <Spinner />
            <span className="text-muted text-[13px]">{t('problems.loading', { loaded })}</span>
          </div>
        </Card>
      )}

      {error && <ErrorState message={message(error)} onRetry={reload} className="mb-4" />}

      {data?.partial && (
        <Card className="mb-4">
          <p className="text-[13px] text-amber-600 dark:text-amber-400">
            {t('problems.partial', { statuses: data.failed.join(', ') })}
          </p>
        </Card>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('funnel.totalOrders')}
          value={num(totals.all, lang)}
          hint={money(Math.round(totals.sum), lang)}
          icon={ShoppingCart}
          tone="brand"
          loading={loading}
        />
        <StatCard
          label={t('funnel.completed')}
          value={num(totals.completed, lang)}
          hint={totals.completionRate !== null ? percent(totals.completionRate, lang) : undefined}
          icon={CheckCircle2}
          tone="success"
          loading={loading}
        />
        <StatCard
          label={t('funnel.canceled')}
          value={num(totals.canceled, lang)}
          hint={totals.cancelRate !== null ? percent(totals.cancelRate, lang) : undefined}
          icon={XCircle}
          tone={totals.canceled > 0 ? 'danger' : 'success'}
          loading={loading}
        />
        <StatCard
          label={t('funnel.inProgress')}
          value={num(totals.entered - totals.completed, lang)}
          hint={t('funnel.inProgressHint')}
          icon={Clock}
          tone="warning"
          loading={loading}
        />
      </div>

      <div className="mb-3">
        <PeriodLabel dateFrom={range.dateFrom} dateTo={range.dateTo} count={orders.length} />
      </div>

      <DataTable
        columns={columns}
        rows={stages}
        rowKey={(r) => r.status}
        loading={loading && orders.length === 0}
        emptyIcon={Filter}
        emptyTitle={t('funnel.empty')}
        emptyHint={t('funnel.emptyHint')}
      />

      {exits.length > 0 && (
        <Card className="mt-4">
          <CardHeader title={t('funnel.exits')} subtitle={t('funnel.exitsHint')} />
          <div className="divide-app divide-y">
            {exits.map((e) => (
              <div key={e.status} className="flex items-center justify-between gap-4 py-2.5">
                <StatusBadge group="orderStatus" value={e.status} size="sm" />
                <div className="flex items-center gap-6">
                  <span className="tabular text-app text-[13.5px] font-medium">{num(e.count, lang)}</span>
                  <span className="tabular text-muted text-[13px]">
                    {money(Math.round(e.sum), lang, { currency: false })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader title={t('funnel.howTitle')} />
        <p className="text-muted text-[13px]">{t('funnel.howBody')}</p>
      </Card>
    </>
  )
}
