import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Download, RefreshCw, ShieldAlert, Clock, PackageX, Wallet } from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import { useBulkLoad } from '../hooks/useBulkLoad'
import { cacheKey as ck } from '../api/cache'
import { useApiMessage } from '../hooks/useApi'
import { fetchOrdersForStatuses } from '../api/bulk'
import {
  PROBLEM_SCAN_STATUSES,
  ORDER_PROBLEMS,
  ORDER_PROBLEM_TONE,
  ORDER_SCHEMES,
  PAGE_SIZES,
} from '../api/constants'
import {
  money,
  num,
  dateTime,
  deadline,
  dash,
  daysAgo,
  toDate,
  orderProblems,
  STUCK_DAYS,
  PICKUP_DAYS,
  TRANSIT_DAYS,
} from '../utils/format'
import { exportCsv, csvNum } from '../utils/csv'
import {
  PageHeader,
  Card,
  CardHeader,
  StatCard,
  DataTable,
  Pagination,
  Tabs,
  Button,
  Select,
  Badge,
  EmptyState,
  ErrorState,
  Spinner,
} from '../components/ui'
import { StatusBadge, SchemeBadge, FilterBar, DateRangeFilter, DeadlineCell } from '../components/common'
import { DevSource } from '../components/DevSource'
import { PeriodLabel } from '../components/PeriodLabel'

/**
 * Muammoli buyurtmalar.
 *
 * Uzum API «muammoli» degan filtr bermaydi — bunday buyurtmani faqat status
 * va muddatlarni solishtirib topish mumkin. Shuning uchun sahifa harakat
 * talab qiladigan statuslarni to'liq yuklab oladi va har bir buyurtmani
 * `orderProblems()` orqali tekshiradi:
 *
 *   · qabul muddati o'tgan          · yetkazish muddati o'tgan
 *   · tugallanmagan (yig'ilmagan)   · yo'lda qotib qolgan
 *   · punktda olinmagan             · bekor qilinmoqda / qaytarilgan
 */

// Muammolar odatda yaqin oylarda bo'ladi — standart 60 kun
const DEFAULT_RANGE = { dateFrom: daysAgo(60), dateTo: undefined }

/** Kunlarda yosh (buyurtma yaratilganidan beri) */
const ageDays = (order) => {
  const d = toDate(order.dateCreated)
  return d ? Math.floor((Date.now() - d.getTime()) / 864e5) : null
}

export default function ProblemOrders() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const navigate = useNavigate()
  const { shopIds } = useAuth()
  const message = useApiMessage()

  const [range, setRange] = useState(DEFAULT_RANGE)
  const [scheme, setScheme] = useState('')
  const [tab, setTab] = useState('all')
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)

  const idsKey = shopIds.join(',')
  const ids = useMemo(() => (idsKey ? idsKey.split(',').map(Number) : []), [idsKey])

  const load = useCallback(
    (signal, onProgress) =>
      fetchOrdersForStatuses(
        {
          shopIds: ids,
          statuses: PROBLEM_SCAN_STATUSES,
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
    { skip: ids.length === 0, cacheKey: ck('problem-orders', { ids: idsKey, scheme, from: range.dateFrom, to: range.dateTo }) },
  )

  const allOrders = useMemo(() => data?.orders || [], [data])

  /** Har bir buyurtmaga muammo kodlarini biriktiramiz */
  const flagged = useMemo(
    () =>
      allOrders
        .map((o) => ({ ...o, problems: orderProblems(o), age: ageDays(o) }))
        .filter((o) => o.problems.length > 0),
    [allOrders],
  )

  /** Tur bo'yicha sanoq — tab yorliqlarida ko'rsatiladi */
  const counts = useMemo(() => {
    const c = {}
    for (const code of ORDER_PROBLEMS) c[code] = 0
    for (const o of flagged) for (const p of o.problems) c[p]++
    return c
  }, [flagged])

  const rows = useMemo(
    () => (tab === 'all' ? flagged : flagged.filter((o) => o.problems.includes(tab))),
    [flagged, tab],
  )

  const pageRows = useMemo(() => rows.slice(page * size, (page + 1) * size), [rows, page, size])

  /** Xavf ostidagi summa — muammoli buyurtmalarning umumiy qiymati */
  const atRisk = useMemo(() => rows.reduce((s, o) => s + (Number(o.price) || 0), 0), [rows])

  const oldest = useMemo(
    () => rows.reduce((max, o) => (o.age !== null && o.age > max ? o.age : max), 0),
    [rows],
  )

  // Filtr o'zgarsa birinchi sahifaga qaytamiz
  const changeTab = (value) => {
    setTab(value)
    setPage(0)
  }

  const handleExport = () => {
    const columns = [
      { key: 'id', header: t('common.id') },
      { key: 'scheme', header: t('orders.scheme') },
      { key: 'status', header: t('common.status'), value: (o) => t(`enums.orderStatus.${o.status}`, o.status) },
      {
        key: 'problems',
        header: t('problems.column'),
        value: (o) => o.problems.map((p) => t(`problems.type.${p}`)).join(', '),
      },
      { key: 'age', header: t('problems.age'), value: (o) => csvNum(o.age) },
      { key: 'dateCreated', header: t('common.created'), value: (o) => dateTime(o.dateCreated, lang) },
      { key: 'acceptUntil', header: t('orders.acceptUntil'), value: (o) => dateTime(o.acceptUntil, lang) },
      { key: 'deliverUntil', header: t('orders.deliverUntil'), value: (o) => dateTime(o.deliverUntil, lang) },
      { key: 'price', header: t('common.price'), value: (o) => csvNum(o.price) },
      { key: 'invoiceNumber', header: t('orders.invoiceNo') },
    ]
    exportCsv(rows, columns, `muammoli-buyurtmalar-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  const columns = useMemo(
    () => [
      {
        key: 'id',
        header: t('common.id'),
        render: (o) => (
          <div className="flex items-center gap-2">
            <span className="text-app tabular text-[13.5px] font-medium">#{o.id}</span>
            <SchemeBadge scheme={o.scheme} />
          </div>
        ),
      },
      {
        key: 'problems',
        header: t('problems.column'),
        nowrap: false,
        width: '22%',
        render: (o) => (
          <div className="flex flex-wrap gap-1">
            {o.problems.map((p) => (
              <Badge key={p} tone={ORDER_PROBLEM_TONE[p] || 'warning'} size="sm">
                {t(`problems.type.${p}`)}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        key: 'status',
        header: t('common.status'),
        render: (o) => <StatusBadge group="orderStatus" value={o.status} size="sm" />,
      },
      {
        key: 'age',
        header: t('problems.age'),
        align: 'right',
        render: (o) =>
          o.age === null ? (
            <span className="text-faint">—</span>
          ) : (
            <span
              className={
                o.age > STUCK_DAYS
                  ? 'tabular text-[13px] font-medium text-red-600 dark:text-red-400'
                  : 'tabular text-[13px]'
              }
            >
              {t('problems.daysN', { n: o.age })}
            </span>
          ),
      },
      {
        key: 'dateCreated',
        header: t('common.created'),
        render: (o) => <span className="text-muted tabular text-[13px]">{dateTime(o.dateCreated, lang)}</span>,
      },
      {
        key: 'acceptUntil',
        header: t('orders.acceptUntil'),
        render: (o) => <DeadlineCell deadline={deadline(o.acceptUntil, lang)} text={dateTime(o.acceptUntil, lang)} />,
      },
      {
        key: 'deliverUntil',
        header: t('orders.deliverUntil'),
        render: (o) => <DeadlineCell deadline={deadline(o.deliverUntil, lang)} text={dateTime(o.deliverUntil, lang)} />,
      },
      {
        key: 'invoiceNumber',
        header: t('orders.invoiceNo'),
        render: (o) => <span className="text-muted tabular text-[13px]">{dash(o.invoiceNumber)}</span>,
      },
      {
        key: 'price',
        header: t('common.price'),
        align: 'right',
        render: (o) => (
          <span className="tabular text-[13.5px] font-medium">{money(o.price, lang, { currency: false })}</span>
        ),
      },
    ],
    [t, lang],
  )

  if (ids.length === 0) {
    return (
      <>
        <PageHeader title={t('problems.title')} subtitle={t('problems.subtitle')} />
        <Card>
          <EmptyState icon={ShieldAlert} title={t('errors.noShopSelected')} hint={t('errors.shopRequired')} />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader title={t('problems.title')} subtitle={t('problems.subtitle')}>
        <Button variant="ghost" icon={RefreshCw} onClick={reload} loading={loading}>
          {t('common.refresh')}
        </Button>
        <Button variant="secondary" icon={Download} onClick={handleExport} disabled={rows.length === 0}>
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
              status: PROBLEM_SCAN_STATUSES,
              scheme: scheme || undefined,
              dateFrom: range.dateFrom,
              dateTo: range.dateTo,
              size: 50,
            },
            count: allOrders.length,
            note: t('problems.sourceNote'),
          },
        ]}
      />

      <FilterBar
        onReset={() => {
          setRange(DEFAULT_RANGE)
          setScheme('')
          changeTab('all')
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
          label={t('problems.totalProblems')}
          value={num(flagged.length, lang)}
          hint={t('problems.ofScanned', { total: allOrders.length })}
          icon={AlertTriangle}
          tone={flagged.length > 0 ? 'danger' : 'success'}
          loading={loading}
        />
        <StatCard
          label={t('problems.atRisk')}
          value={money(atRisk, lang)}
          hint={t('problems.atRiskHint')}
          icon={Wallet}
          tone="warning"
          loading={loading}
        />
        <StatCard
          label={t('problems.type.notPickedUp')}
          value={num(counts.notPickedUp, lang)}
          hint={t('problems.pickupHint', { days: PICKUP_DAYS })}
          icon={PackageX}
          tone={counts.notPickedUp > 0 ? 'warning' : 'success'}
          loading={loading}
        />
        <StatCard
          label={t('problems.oldest')}
          value={oldest > 0 ? t('problems.daysN', { n: oldest }) : '—'}
          hint={t('problems.oldestHint')}
          icon={Clock}
          tone={oldest > STUCK_DAYS ? 'danger' : 'brand'}
          loading={loading}
        />
      </div>

      <Tabs
        value={tab}
        onChange={changeTab}
        className="mb-4"
        tabs={[
          { value: 'all', label: t('common.all'), count: flagged.length },
          ...ORDER_PROBLEMS.filter((code) => counts[code] > 0).map((code) => ({
            value: code,
            label: t(`problems.type.${code}`),
            count: counts[code],
          })),
        ]}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <PeriodLabel dateFrom={range.dateFrom} dateTo={range.dateTo} count={rows.length} />
      </div>

      <DataTable
        columns={columns}
        rows={pageRows}
        rowKey={(o) => o.id}
        loading={loading && pageRows.length === 0}
        onRowClick={(o) => navigate(`/orders/${o.id}`)}
        emptyIcon={ShieldAlert}
        emptyTitle={t('problems.empty')}
        emptyHint={t('problems.emptyHint')}
        numbered
        indexOffset={page * size}
      />

      <Pagination
        page={page}
        size={size}
        total={rows.length}
        onPage={setPage}
        onSize={setSize}
        sizes={PAGE_SIZES}
      />

      <Card className="mt-4">
        <CardHeader title={t('problems.rulesTitle')} subtitle={t('problems.rulesHint')} />
        <ul className="text-muted space-y-1.5 text-[13px]">
          <li>
            <strong className="text-app">{t('problems.type.overdue')}</strong> — {t('problems.rule.overdue')}
          </li>
          <li>
            <strong className="text-app">{t('problems.type.stuck')}</strong> —{' '}
            {t('problems.rule.stuck', { days: STUCK_DAYS })}
          </li>
          <li>
            <strong className="text-app">{t('problems.type.deliveryOverdue')}</strong> —{' '}
            {t('problems.rule.deliveryOverdue')}
          </li>
          <li>
            <strong className="text-app">{t('problems.type.inTransit')}</strong> —{' '}
            {t('problems.rule.inTransit', { days: TRANSIT_DAYS })}
          </li>
          <li>
            <strong className="text-app">{t('problems.type.notPickedUp')}</strong> —{' '}
            {t('problems.rule.notPickedUp', { days: PICKUP_DAYS })}
          </li>
          <li>
            <strong className="text-app">{t('problems.type.cancelling')}</strong> — {t('problems.rule.cancelling')}
          </li>
          <li>
            <strong className="text-app">{t('problems.type.returned')}</strong> — {t('problems.rule.returned')}
          </li>
        </ul>
      </Card>
    </>
  )
}
