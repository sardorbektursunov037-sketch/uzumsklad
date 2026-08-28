import { useEffect, useMemo, useState } from 'react'
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
import {
  TrendingUp,
  Store,
  Wallet,
  Percent,
  Truck,
  Receipt,
  PiggyBank,
  Boxes,
  Banknote,
  Hourglass,
} from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useApi, useApiMessage } from '../hooks/useApi'
import { getFinanceOrders, getExpenses } from '../api/endpoints'
import { FINANCE_STATUSES, PAGE_SIZES } from '../api/constants'
import { money, num, percent, dateTime, dash, toDate, itemRevenue, shortDate } from '../utils/format'
import {
  PageHeader,
  Card,
  CardHeader,
  StatCard,
  DataTable,
  Pagination,
  Select,
  Switch,
  EmptyState,
  Spinner,
} from '../components/ui'
import { StatusBadge, ProductCell, FilterBar, DateRangeFilter } from '../components/common'
import { DevSource } from '../components/DevSource'
import { chartTheme, tooltipStyle } from '../utils/chartTheme'
import { PeriodLabel } from '../components/PeriodLabel'
import { DataViewer } from '../components/DataViewer'

// Standart holatda sana filtri qo'yilmaydi — Uzum eng yangilarini qaytaradi.
// Davrni foydalanuvchi o'zi toraytiradi.
const DEFAULT_RANGE = { dateFrom: undefined, dateTo: undefined }

export default function Finance() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const { shopIds } = useAuth()
  const { isDark } = useTheme()
  const ct = chartTheme(isDark)
  const message = useApiMessage()

  const [range, setRange] = useState(DEFAULT_RANGE)
  const [status, setStatus] = useState('')
  const [group, setGroup] = useState(false)
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)

  const idsKey = shopIds.join(',')

  useEffect(() => {
    setPage(0)
  }, [range.dateFrom, range.dateTo, status, group, idsKey])

  const { data, loading, error, refetch } = useApi(
    (signal) =>
      getFinanceOrders(
        {
          shopIds,
          page,
          size,
          group,
          dateFrom: range.dateFrom,
          dateTo: range.dateTo,
          statuses: status ? [status] : undefined,
        },
        { signal },
      ),
    [idsKey, page, size, group, range.dateFrom, range.dateTo, status],
    { skip: shopIds.length === 0, keepPreviousData: true },
  )

  const expenses = useApi(
    (signal) =>
      getExpenses({ shopIds, page: 0, size: 100, dateFrom: range.dateFrom, dateTo: range.dateTo }, { signal }),
    [idsKey, range.dateFrom, range.dateTo],
    { skip: shopIds.length === 0 },
  )

  const items = useMemo(() => data?.orderItems || [], [data])
  const total = data?.totalElements

  /** Xarajatlar (chiqim) — sof foydani hisoblash uchun */
  const expenseTotal = useMemo(
    () =>
      (expenses.data?.payments || [])
        .filter((p) => p.type !== 'INCOME')
        .reduce((s, p) => s + (Number(p.paymentPrice) || 0), 0),
    [expenses.data],
  )

  /** Joriy sahifa bo'yicha yig'indilar */
  const totals = useMemo(
    () =>
      items.reduce(
        (acc, it) => ({
          revenue: acc.revenue + itemRevenue(it),
          commission: acc.commission + (Number(it.commission) || 0),
          profit: acc.profit + (Number(it.sellerProfit) || 0),
          logistics: acc.logistics + (Number(it.logisticDeliveryFee) || 0),
          units: acc.units + (Number(it.amount) || 0),
          withdrawn: acc.withdrawn + (Number(it.withdrawnProfit) || 0),
          withdrawCount: acc.withdrawCount + (Number(it.withdrawnProfit) > 0 ? 1 : 0),
        }),
        { revenue: 0, commission: 0, profit: 0, logistics: 0, units: 0, withdrawn: 0, withdrawCount: 0 },
      ),
    [items],
  )

  const netProfit = totals.profit - expenseTotal
  const margin = totals.revenue > 0 ? (netProfit / totals.revenue) * 100 : null
  const avgCheck = totals.units > 0 ? totals.revenue / totals.units : 0

  /** Kunlar kesimida tushum va foyda */
  const chartData = useMemo(() => {
    const map = new Map()
    for (const it of items) {
      const d = toDate(it.date ?? it.dateIssued)
      if (!d) continue
      const key = d.toISOString().slice(0, 10)
      const row = map.get(key) || {
        key,
        label: shortDate(d, lang),
        revenue: 0,
        profit: 0,
      }
      row.revenue += itemRevenue(it)
      row.profit += Number(it.sellerProfit) || 0
      map.set(key, row)
    }
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key))
  }, [items, lang])

  /**
   * Yechib olishlar. Uzum API alohida «vivod» endpointi bermaydi, shuning
   * uchun ikki manbadan yig'amiz:
   *   1. `withdrawnProfit > 0` bo'lgan sotuv pozitsiyalari (sanasi bilan)
   *   2. `/v1/finance/expenses` dagi INCOME turidagi to'lovlar
   */
  const withdrawals = useMemo(() => {
    const fromSales = items
      .filter((it) => Number(it.withdrawnProfit) > 0)
      .map((it) => ({
        key: `s-${it.id}`,
        date: it.dateIssued ?? it.date,
        amount: Number(it.withdrawnProfit),
        title: it.productTitle || it.skuTitle,
        source: `#${it.orderId ?? ''}`,
        status: it.status,
      }))

    const fromPayments = (expenses.data?.payments || [])
      .filter((p) => p.type === 'INCOME')
      .map((p) => ({
        key: `p-${p.id}`,
        date: p.dateService ?? p.dateCreated,
        amount: Number(p.paymentPrice) || 0,
        title: p.name,
        source: p.source,
        status: p.status,
      }))

    return [...fromSales, ...fromPayments].sort(
      (a, b) => (toDate(b.date)?.getTime() || 0) - (toDate(a.date)?.getTime() || 0),
    )
  }, [items, expenses.data])

  const columns = useMemo(
    () => [
      {
        key: 'orderId',
        header: t('finance.orderId'),
        render: (it) => <span className="text-app tabular text-[13.5px] font-medium">#{dash(it.orderId ?? it.id)}</span>,
      },
      {
        key: 'product',
        header: t('products.product'),
        nowrap: false,
        width: '26%',
        render: (it) => (
          <ProductCell
            image={it.productImage?.photo?.[240]?.high || it.productImage?.url}
            title={it.productTitle || it.skuTitle}
            subtitle={[it.skuCharTitle, it.skuCharValue].filter(Boolean).join(': ') || it.sellerSkuCode}
            size={34}
          />
        ),
      },
      {
        key: 'status',
        header: t('common.status'),
        render: (it) => <StatusBadge group="financeStatus" value={it.status} size="sm" />,
      },
      {
        key: 'date',
        header: t('common.date'),
        render: (it) => <span className="text-muted tabular text-[13px]">{dateTime(it.date, lang)}</span>,
      },
      {
        key: 'dateIssued',
        header: t('finance.dateIssued'),
        render: (it) => <span className="text-muted tabular text-[13px]">{dateTime(it.dateIssued, lang)}</span>,
      },
      {
        key: 'amount',
        header: t('common.amount'),
        align: 'right',
        render: (it) => <span className="tabular">{num(it.amount, lang)}</span>,
      },
      {
        key: 'sellPrice',
        header: t('finance.sellerPrice'),
        align: 'right',
        render: (it) => (
          <span className="tabular text-[13.5px] font-medium">{money(itemRevenue(it), lang, { currency: false })}</span>
        ),
      },
      {
        key: 'commission',
        header: t('finance.commission'),
        align: 'right',
        render: (it) => <span className="tabular text-red-600 dark:text-red-400">{money(it.commission, lang, { currency: false })}</span>,
      },
      {
        key: 'logisticDeliveryFee',
        header: t('finance.logisticFee'),
        align: 'right',
        render: (it) => <span className="tabular text-red-600 dark:text-red-400">{money(it.logisticDeliveryFee, lang, { currency: false })}</span>,
      },
      {
        key: 'sellerProfit',
        header: t('finance.sellerProfit'),
        align: 'right',
        render: (it) => (
          <span className="tabular text-[13.5px] font-semibold text-emerald-600 dark:text-emerald-400">
            {money(it.sellerProfit, lang, { currency: false })}
          </span>
        ),
      },
      {
        key: 'withdrawnProfit',
        header: t('finance.withdrawnProfit'),
        align: 'right',
        render: (it) =>
          Number(it.withdrawnProfit) ? (
            <span className="tabular font-medium text-emerald-600 dark:text-emerald-400">
              {money(it.withdrawnProfit, lang, { currency: false })}
            </span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      {
        key: 'amountReturns',
        header: t('finance.amountReturns'),
        align: 'right',
        render: (it) =>
          Number(it.amountReturns) ? (
            <span className="tabular text-amber-600 dark:text-amber-400">{num(it.amountReturns, lang)}</span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
    ],
    [t, lang],
  )

  if (shopIds.length === 0) {
    return (
      <>
        <PageHeader title={t('finance.title')} subtitle={t('finance.subtitle')} />
        <Card>
          <EmptyState icon={Store} title={t('errors.noShopSelected')} hint={t('finance.shopRequired')} />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader title={t('finance.title')} subtitle={t('finance.subtitle')} />

      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('finance.totalRevenue')} value={money(totals.revenue, lang)} icon={Wallet} tone="brand" loading={loading} />
        <StatCard label={t('finance.totalProfit')} value={money(totals.profit, lang)} icon={TrendingUp} tone="success" loading={loading} />
        <StatCard label={t('finance.totalCommission')} value={money(totals.commission, lang)} icon={Percent} tone="warning" loading={loading} />
        <StatCard label={t('finance.totalLogistics')} value={money(totals.logistics, lang)} icon={Truck} tone="neutral" loading={loading} />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('expenses.totalOutcome')}
          value={money(expenseTotal, lang)}
          icon={Receipt}
          tone="danger"
          loading={expenses.loading}
        />
        <StatCard
          label={t('finance.netProfit')}
          value={money(netProfit, lang)}
          hint={t('finance.netProfitHint')}
          icon={PiggyBank}
          tone={netProfit >= 0 ? 'success' : 'danger'}
          loading={loading || expenses.loading}
        />
        <StatCard
          label={t('finance.marginPercent')}
          value={margin === null ? '\u2014' : percent(margin, lang)}
          icon={Percent}
          tone={margin === null ? 'neutral' : margin >= 0 ? 'success' : 'danger'}
          loading={loading}
        />
        <StatCard
          label={t('finance.avgCheck')}
          value={money(avgCheck, lang)}
          hint={`${t('finance.itemsSold')}: ${num(totals.units, lang)}`}
          icon={Boxes}
          tone="neutral"
          loading={loading}
        />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard
          label={t('finance.withdrawnProfit')}
          value={money(totals.withdrawn, lang)}
          hint={`${t('finance.withdrawCount')}: ${num(totals.withdrawCount, lang)}`}
          icon={Banknote}
          tone="success"
          loading={loading}
        />
        <StatCard
          label={t('finance.pendingPayout')}
          value={money(Math.max(0, totals.profit - totals.withdrawn), lang)}
          hint={t('finance.pendingPayoutHint')}
          icon={Hourglass}
          tone="warning"
          loading={loading}
        />
      </div>

      <Card className="mb-4">
        <CardHeader title={t('finance.chartTitle')} />
        <div className="mt-4 h-[260px]">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner size={22} />
            </div>
          ) : chartData.length === 0 ? (
            <EmptyState compact title={t('common.noData')} hint={null} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
                <CartesianGrid stroke={ct.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: ct.axis, fontSize: 11 }}
                  axisLine={{ stroke: ct.grid }}
                  tickLine={false}
                  minTickGap={16}
                />
                <YAxis
                  tick={{ fill: ct.axis, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={112}
                  tickFormatter={(v) => money(v, lang, { currency: false })}
                />
                <RTooltip
                  contentStyle={tooltipStyle(ct)}
                  formatter={(value, key) => [money(value, lang), t(`finance.${key}`)]}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => <span style={{ color: ct.axis, fontSize: 11 }}>{t(`finance.${value}`)}</span>}
                />
                <Bar dataKey="revenue" fill={ct.primary} radius={[6, 6, 0, 0]} maxBarSize={26} />
                <Line type="monotone" dataKey="profit" stroke={ct.success} strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <PeriodLabel
        className="mb-3"
        dateFrom={range.dateFrom}
        dateTo={range.dateTo}
        count={items.length}
      />

      <DevSource
        className="mb-4"
        sources={[
          {
            path: '/v1/finance/orders',
            params: {
              shopIds,
              page,
              size,
              group,
              statuses: status ? [status] : undefined,
              dateFrom: range.dateFrom ? Math.floor(range.dateFrom / 1000) : undefined,
              dateTo: range.dateTo ? Math.floor(range.dateTo / 1000) : undefined,
            },
            count: items.length,
            note: 'FinanceItemEntity: sellPrice, purchasePrice, commission, logisticDeliveryFee, sellerProfit, withdrawnProfit, amountReturns',
          },
          {
            path: '/v1/finance/expenses',
            params: { shopIds, page: 0, size: 100 },
            count: expenses.data?.payments?.length,
            note: 'SellerPaymentDto: paymentPrice, type, status, source, dateService',
          },
        ]}
      />

      <FilterBar
        onReset={() => {
          setRange(DEFAULT_RANGE)
          setStatus('')
          setGroup(false)
        }}
      >
        <Select
          label={t('common.status')}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          placeholder={t('common.all')}
          options={FINANCE_STATUSES.map((v) => ({ value: v, label: t(`enums.financeStatus.${v}`) }))}
          wrapperClassName="w-48"
        />
        <DateRangeFilter value={range} onChange={setRange} />
        <div className="pb-1.5">
          <Switch checked={group} onChange={setGroup} label={t('finance.group')} />
        </div>
      </FilterBar>

      <Card className="mb-4">
        <CardHeader title={t('finance.withdrawals')} subtitle={t('finance.withdrawalsHint')} />
        {withdrawals.length === 0 ? (
          <p className="text-faint mt-3 text-[13px]">{t('finance.noWithdrawals')}</p>
        ) : (
          <ul className="mt-3">
            {withdrawals.map((w, i) => (
              <li
                key={w.key}
                className="border-app flex flex-wrap items-center gap-3 border-b py-2.5 last:border-0"
              >
                <span className="text-faint tabular w-6 shrink-0 text-[12px]">{i + 1}</span>
                <span className="text-muted tabular w-40 shrink-0 text-[13px]">{dateTime(w.date, lang)}</span>
                <span className="text-app min-w-0 flex-1 truncate text-[13px]">{dash(w.title)}</span>
                {w.source && (
                  <span className="text-faint shrink-0 font-mono text-[12px]">{w.source}</span>
                )}
                <span className="tabular shrink-0 text-[13.5px] font-semibold text-emerald-600 dark:text-emerald-400">
                  +{money(w.amount, lang)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(it, i) => it.id ?? `${it.orderId}-${i}`}
        loading={loading}
        error={error ? message(error) : null}
        onRetry={refetch}
        emptyIcon={TrendingUp}
        numbered
        indexOffset={page * size}
        expandable={(row) => (
          <div className="p-4">
            <DataViewer data={row} defaultOpen />
          </div>
        )}
      />

      <Pagination page={page} size={size} total={total} onPage={setPage} onSize={setSize} sizes={PAGE_SIZES} />
    </>
  )
}
