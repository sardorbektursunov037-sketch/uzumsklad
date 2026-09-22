import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend,
} from 'recharts'
import { Banknote, Store, Download, ArrowDownToLine, ArrowUpFromLine, Wallet } from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useBulkLoad } from '../hooks/useBulkLoad'
import { cacheKey as ck } from '../api/cache'
import { useApiMessage } from '../hooks/useApi'
import { fetchAllExpenses } from '../api/bulk'
import { EXPENSE_CATEGORIES, groupExpenses } from '../api/expenseCategories'
import { money, num, cx, toDate, dayKey, shortDate, date as fmtDate } from '../utils/format'
import { exportCsv, csvNum } from '../utils/csv'
import {
  PageHeader,
  Card,
  CardHeader,
  StatCard,
  DataTable,
  Tabs,
  Button,
  EmptyState,
  ErrorState,
  Spinner,
} from '../components/ui'
import { FilterBar, DateRangeFilter } from '../components/common'
import { DevSource } from '../components/DevSource'
import { PeriodLabel } from '../components/PeriodLabel'
import { chartTheme, tooltipStyle } from '../utils/chartTheme'

/**
 * Pul oqimi (Движение денежных средств).
 *
 * Uzum sotuvchisining kassasi yo'q — barcha harakat sotuvchi hisobi orqali
 * o'tadi va `/v1/finance/expenses` da qayd etiladi:
 *
 *   Приход (kirim)  = `type: INCOME`  — hisobga o'tkazilgan foyda
 *   Расход (chiqim) = `type: OUTCOME` — Uzum ushlab qolgan xizmatlar
 *   Баланс          = kirim − chiqim, kundan kunga to'planadi
 *
 * Ikkita kesim beriladi: kunlar bo'yicha va xarajat moddalari bo'yicha —
 * MoySklad'dagi «По дням» va «По статьям расходов» bilan bir xil.
 */

const DEFAULT_RANGE = { dateFrom: undefined, dateTo: undefined }

export default function CashFlow() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const { shopIds } = useAuth()
  const { isDark } = useTheme()
  const ct = chartTheme(isDark)
  const message = useApiMessage()

  const [range, setRange] = useState(DEFAULT_RANGE)
  const [tab, setTab] = useState('days')

  const idsKey = shopIds.join(',')
  const ids = useMemo(() => (idsKey ? idsKey.split(',').map(Number) : []), [idsKey])

  const load = useCallback(
    (signal, onProgress) =>
      fetchAllExpenses({ shopIds: ids, dateFrom: range.dateFrom, dateTo: range.dateTo }, signal, onProgress),
    [ids, range.dateFrom, range.dateTo],
  )

  const { data, loading, error, loaded, reload } = useBulkLoad(load, [idsKey, range.dateFrom, range.dateTo], {
    skip: ids.length === 0,
    cacheKey: ck('cashflow', { ids: idsKey, from: range.dateFrom, to: range.dateTo }),
  })

  const payments = useMemo(() => data?.payments || [], [data])
  const grouped = useMemo(() => groupExpenses(payments), [payments])

  /* ── Kunlar kesimi ───────────────────────────────────────────── */

  const days = useMemo(() => {
    const map = new Map()

    for (const p of payments) {
      const d = toDate(p.dateService ?? p.dateCreated ?? p.date)
      const key = dayKey(d)
      if (!key) continue
      const row = map.get(key) || { key, at: d.getTime(), label: shortDate(d, lang), income: 0, outcome: 0 }
      const amount = Number(p.paymentPrice) || 0
      if (p.type === 'INCOME') row.income += amount
      else row.outcome += amount
      map.set(key, row)
    }

    // Balans eng eski kundan boshlab to'planadi
    const list = [...map.values()].sort((a, b) => a.key.localeCompare(b.key))
    let running = 0
    for (const r of list) {
      r.opening = running
      running += r.income - r.outcome
      r.balance = running
    }
    return list
  }, [payments, lang])

  const closing = days.length > 0 ? days[days.length - 1].balance : 0

  /** Grafik uchun — eng so'nggi 60 kun yetarli */
  const chartData = useMemo(() => days.slice(-60), [days])

  /* ── Moddalar kesimi ─────────────────────────────────────────── */

  const categoryRows = useMemo(
    () =>
      EXPENSE_CATEGORIES.map((key) => ({
        key,
        label: t(`pl.category.${key}`),
        amount: grouped.byCategory[key] || 0,
      })).filter((r) => r.amount > 0),
    [grouped, t],
  )

  const handleExport = () => {
    if (tab === 'days') {
      exportCsv(
        [...days].reverse(),
        [
          { key: 'label', header: t('common.date') },
          { key: 'income', header: t('cashflow.income'), value: (r) => csvNum(Math.round(r.income)) },
          { key: 'outcome', header: t('cashflow.outcome'), value: (r) => csvNum(Math.round(r.outcome)) },
          { key: 'balance', header: t('cashflow.balance'), value: (r) => csvNum(Math.round(r.balance)) },
        ],
        `pul-oqimi-${new Date().toISOString().slice(0, 10)}.csv`,
      )
    } else {
      exportCsv(
        grouped.bySource,
        [
          { key: 'source', header: t('expenses.source') },
          { key: 'category', header: t('cashflow.category'), value: (r) => t(`pl.category.${r.category}`) },
          { key: 'count', header: t('common.quantity'), value: (r) => csvNum(r.count) },
          { key: 'amount', header: t('common.amount'), value: (r) => csvNum(Math.round(r.amount)) },
        ],
        `xarajat-moddalari-${new Date().toISOString().slice(0, 10)}.csv`,
      )
    }
  }

  const dayColumns = useMemo(
    () => [
      {
        key: 'label',
        header: t('common.date'),
        render: (r) => <span className="text-app tabular text-[13.5px]">{fmtDate(r.at, lang)}</span>,
      },
      {
        key: 'income',
        header: t('cashflow.income'),
        align: 'right',
        render: (r) =>
          r.income > 0 ? (
            <span className="tabular text-[13px] text-emerald-600 dark:text-emerald-400">
              +{money(Math.round(r.income), lang, { currency: false })}
            </span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      {
        key: 'outcome',
        header: t('cashflow.outcome'),
        align: 'right',
        render: (r) =>
          r.outcome > 0 ? (
            <span className="tabular text-[13px] text-red-600 dark:text-red-400">
              −{money(Math.round(r.outcome), lang, { currency: false })}
            </span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      {
        key: 'balance',
        header: t('cashflow.balance'),
        align: 'right',
        render: (r) => (
          <span
            className={cx(
              'tabular text-[13.5px] font-semibold',
              r.balance < 0 ? 'text-red-600 dark:text-red-400' : 'text-app',
            )}
          >
            {money(Math.round(r.balance), lang, { currency: false })}
          </span>
        ),
      },
    ],
    [t, lang],
  )

  const sourceColumns = useMemo(
    () => [
      {
        key: 'source',
        header: t('expenses.source'),
        nowrap: false,
        render: (r) => <span className="text-app text-[13px]">{r.source}</span>,
      },
      {
        key: 'category',
        header: t('cashflow.category'),
        render: (r) => <span className="text-muted text-[13px]">{t(`pl.category.${r.category}`)}</span>,
      },
      {
        key: 'count',
        header: t('common.quantity'),
        align: 'right',
        render: (r) => <span className="tabular text-[13px]">{num(r.count, lang)}</span>,
      },
      {
        key: 'amount',
        header: t('expenses.paymentPrice'),
        align: 'right',
        render: (r) => (
          <span className="tabular text-[13.5px] font-medium">{money(Math.round(r.amount), lang, { currency: false })}</span>
        ),
      },
    ],
    [t, lang],
  )

  if (ids.length === 0) {
    return (
      <>
        <PageHeader title={t('cashflow.title')} subtitle={t('cashflow.subtitle')} />
        <Card>
          <EmptyState icon={Store} title={t('errors.noShopSelected')} hint={t('errors.shopRequired')} />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader title={t('cashflow.title')} subtitle={t('cashflow.subtitle')}>
        <Button variant="secondary" icon={Download} onClick={handleExport} disabled={payments.length === 0}>
          {t('common.exportCsv')}
        </Button>
      </PageHeader>

      <DevSource
        className="mb-4"
        compact
        sources={[
          {
            path: '/v1/finance/expenses',
            params: { shopIds: ids, dateFrom: range.dateFrom, dateTo: range.dateTo, size: 100 },
            count: payments.length,
            note: 'SellerPaymentDto: type (INCOME/OUTCOME), paymentPrice, source, dateService',
          },
        ]}
      />

      <FilterBar onReset={() => setRange(DEFAULT_RANGE)}>
        <DateRangeFilter value={range} onChange={setRange} />
      </FilterBar>

      {loading && (
        <Card className="mb-4">
          <div className="flex items-center justify-center gap-3 py-6">
            <Spinner />
            <span className="text-muted text-[13px]">{t('cashflow.loading', { loaded })}</span>
          </div>
        </Card>
      )}

      {error && <ErrorState message={message(error)} onRetry={reload} className="mb-4" />}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('cashflow.opening')}
          value={money(0, lang)}
          hint={t('cashflow.openingHint')}
          icon={Wallet}
          tone="neutral"
          loading={loading}
        />
        <StatCard
          label={t('cashflow.income')}
          value={money(Math.round(grouped.income), lang)}
          hint={t('cashflow.incomeHint')}
          icon={ArrowDownToLine}
          tone="success"
          loading={loading}
        />
        <StatCard
          label={t('cashflow.outcome')}
          value={money(Math.round(grouped.outcome), lang)}
          hint={t('cashflow.outcomeHint')}
          icon={ArrowUpFromLine}
          tone="danger"
          loading={loading}
        />
        <StatCard
          label={t('cashflow.closing')}
          value={money(Math.round(closing), lang)}
          hint={t('cashflow.closingHint')}
          icon={Banknote}
          tone={closing >= 0 ? 'success' : 'danger'}
          loading={loading}
        />
      </div>

      {chartData.length > 1 && (
        <Card className="mb-4">
          <CardHeader title={t('cashflow.chart')} subtitle={t('cashflow.chartHint')} />
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={ct.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" stroke={ct.axis} tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis
                  stroke={ct.axis}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => money(v, lang, { compact: true, currency: false })}
                />
                <RTooltip contentStyle={tooltipStyle(ct)} formatter={(v, name) => [money(Math.round(v), lang), name]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" name={t('cashflow.income')} fill={ct.success} radius={[4, 4, 0, 0]} />
                <Bar dataKey="outcome" name={t('cashflow.outcome')} fill="#f87171" radius={[4, 4, 0, 0]} />
                <Line
                  type="monotone"
                  dataKey="balance"
                  name={t('cashflow.balance')}
                  stroke={ct.primary}
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-4"
        tabs={[
          { value: 'days', label: t('cashflow.byDays'), count: days.length },
          { value: 'sources', label: t('cashflow.bySources'), count: grouped.bySource.length },
        ]}
      />

      <div className="mb-3">
        <PeriodLabel dateFrom={range.dateFrom} dateTo={range.dateTo} count={payments.length} />
      </div>

      {tab === 'days' ? (
        <DataTable
          columns={dayColumns}
          rows={[...days].reverse()}
          rowKey={(r) => r.key}
          loading={loading && days.length === 0}
          emptyIcon={Banknote}
          emptyTitle={t('cashflow.empty')}
          emptyHint={t('cashflow.emptyHint')}
        />
      ) : (
        <>
          <Card className="mb-3">
            <CardHeader title={t('cashflow.byCategory')} subtitle={t('cashflow.byCategoryHint')} />
            <div className="divide-app divide-y">
              {categoryRows.map((r) => (
                <div key={r.key} className="flex items-center justify-between gap-4 py-2.5">
                  <span className="text-app text-[13.5px]">{r.label}</span>
                  <span className="tabular text-app text-[13.5px] font-medium">
                    {money(Math.round(r.amount), lang)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 border-t-2 pt-3">
                <span className="text-app text-[14px] font-semibold">{t('cashflow.outcome')}</span>
                <span className="tabular text-app text-[14px] font-semibold">
                  {money(Math.round(grouped.outcome), lang)}
                </span>
              </div>
            </div>
          </Card>

          <DataTable
            columns={sourceColumns}
            rows={grouped.bySource}
            rowKey={(r) => r.key}
            loading={loading && grouped.bySource.length === 0}
            emptyIcon={Banknote}
            emptyTitle={t('cashflow.empty')}
            emptyHint={t('cashflow.emptyHint')}
          />
          <p className="text-faint mt-3 text-[12px]">{t('pl.taxNote')}</p>
        </>
      )}
    </>
  )
}
