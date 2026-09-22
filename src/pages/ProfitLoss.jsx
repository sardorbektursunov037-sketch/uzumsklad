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
import { Scale, Store, Download, Wallet, PiggyBank, Percent, Landmark } from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useBulkLoad } from '../hooks/useBulkLoad'
import { cacheKey as ck } from '../api/cache'
import { useApiMessage } from '../hooks/useApi'
import { realizedItems, itemCost } from '../api/financeItems'
import { useCostOverride } from '../hooks/useCostOverride'
import { fetchAllFinanceOrders, fetchAllExpenses } from '../api/bulk'
import { EXPENSE_CATEGORIES, groupExpenses } from '../api/expenseCategories'
import { money, num, percent, cx, daysAgo, itemRevenue, monthKey, monthLabel } from '../utils/format'
import { exportCsv, csvNum } from '../utils/csv'
import {
  PageHeader,
  Card,
  CardHeader,
  StatCard,
  DataTable,
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
 * Foyda va zarar (P&L).
 *
 * Hisobot standart buxgalteriya ketma-ketligini takrorlaydi:
 *
 *   Tushum − Qaytarishlar            = Daromad
 *   Daromad − Tannarx                = Yalpi foyda
 *   Yalpi foyda − Operatsion xarajat = Operatsion foyda
 *   Operatsion foyda − Soliqlar      = Sof foyda
 *
 * Manbalar faqat Uzum API:
 *   · `/v1/finance/orders`   — sotuv, qaytarish, tannarx, komissiya, logistika
 *   · `/v1/finance/expenses` — sotuvchi hisobidan yechilgan to'lovlar
 *
 * `INCOME` turidagi to'lovlar daromadga QO'SHILMAYDI: ular hisobga
 * yechib olingan foyda, ya'ni allaqachon sanalgan pulning ko'chirilishi.
 */

const DEFAULT_RANGE = { dateFrom: daysAgo(30), dateTo: undefined }

export default function ProfitLoss() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const { shopIds } = useAuth()
  const { isDark } = useTheme()
  const ct = chartTheme(isDark)
  const { costs } = useCostOverride()
  const message = useApiMessage()

  const [range, setRange] = useState(DEFAULT_RANGE)

  const idsKey = shopIds.join(',')
  const ids = useMemo(() => (idsKey ? idsKey.split(',').map(Number) : []), [idsKey])

  const load = useCallback(
    async (signal, onProgress) => {
      const [sales, expenses] = await Promise.all([
        fetchAllFinanceOrders({ shopIds: ids, dateFrom: range.dateFrom, dateTo: range.dateTo }, signal, onProgress),
        fetchAllExpenses({ shopIds: ids, dateFrom: range.dateFrom, dateTo: range.dateTo }, signal),
      ])
      return { sales, expenses }
    },
    [ids, range.dateFrom, range.dateTo],
  )

  const { data, loading, error, loaded, total, reload } = useBulkLoad(
    load,
    [idsKey, range.dateFrom, range.dateTo],
    { skip: ids.length === 0, cacheKey: ck('profit-loss', { ids: idsKey, from: range.dateFrom, to: range.dateTo }) },
  )

  // Bekor qilingan pozitsiyalar tushumga kirmaydi
  const items = useMemo(() => realizedItems(data?.sales?.items || []), [data])
  const payments = useMemo(() => data?.expenses?.payments || [], [data])
  const capped = data?.sales?.capped

  /* ── Sotuv tomoni ────────────────────────────────────────────── */

  const sales = useMemo(() => {
    const acc = {
      revenue: 0,
      returnsSum: 0,
      returnsQty: 0,
      cost: 0,
      commission: 0,
      logistics: 0,
      sellerProfit: 0,
      qty: 0,
      orders: new Set(),
    }

    for (const it of items) {
      const qty = Number(it.amount) || 0
      const price = itemRevenue(it)
      const returnsQty = Number(it.amountReturns) || 0

      acc.qty += qty
      acc.revenue += price
      acc.returnsQty += returnsQty
      acc.returnsSum += qty > 0 ? (price / qty) * returnsQty : 0
      acc.commission += Number(it.commission) || 0
      acc.logistics += Number(it.logisticDeliveryFee) || 0
      acc.sellerProfit += Number(it.sellerProfit) || 0
      if (it.orderId !== undefined && it.orderId !== null) acc.orders.add(it.orderId)

      // Tannarx faqat kiritilgan qiymatdan — Uzum'ning purchasePrice'i tannarx emas
      acc.cost += itemCost(it, costs)
    }

    return { ...acc, orders: acc.orders.size }
  }, [items, costs])

  /* ── Xarajat tomoni ──────────────────────────────────────────── */

  /**
   * Hisobdan yechilgan to'lovlar moddalar bo'yicha ajratiladi
   * (logistika · saqlash · marketing · obuna · fotostudiya · boshqa · soliq).
   * `INCOME` turidagilar bu yerga tushmaydi — ular xarajat emas.
   */
  const expenses = useMemo(() => groupExpenses(payments), [payments])

  /* ── Hisobot qatorlari ───────────────────────────────────────── */

  const pl = useMemo(() => {
    const cat = expenses.byCategory
    const netRevenue = sales.revenue - sales.returnsSum
    const grossProfit = netRevenue - sales.cost

    // Uzum ushlab qolgan haq buyurtma yozuvida, qolgan xizmatlar esa
    // hisobdan yechim sifatida keladi — ikkalasi ham operatsion xarajat.
    const paidServices =
      cat.logistics + cat.storage + cat.marketing + cat.subscription + cat.photoStudio + cat.other
    const operatingExpenses = sales.commission + sales.logistics + paidServices
    const operatingProfit = grossProfit - operatingExpenses
    const netProfit = operatingProfit - cat.taxes

    return {
      revenue: sales.revenue,
      returns: sales.returnsSum,
      netRevenue,
      cost: sales.cost,
      grossProfit,
      commission: sales.commission,
      logistics: sales.logistics,
      categories: cat,
      paidServices,
      operatingExpenses,
      operatingProfit,
      taxes: cat.taxes,
      netProfit,
      grossMargin: netRevenue > 0 ? (grossProfit / netRevenue) * 100 : null,
      netMargin: netRevenue > 0 ? (netProfit / netRevenue) * 100 : null,
      sellerProfit: sales.sellerProfit,
    }
  }, [sales, expenses])

  /** Hisobot satrlari — ko'rsatish va eksport uchun bir manba */
  const lines = useMemo(() => {
    const rows = [
      { key: 'revenue', label: t('pl.revenue'), value: pl.revenue, level: 0 },
      { key: 'returns', label: t('pl.returns'), value: -pl.returns, level: 1 },
      { key: 'netRevenue', label: t('pl.netRevenue'), value: pl.netRevenue, level: 0, subtotal: true },
      { key: 'cost', label: t('pl.cost'), value: -pl.cost, level: 1 },
      { key: 'grossProfit', label: t('pl.grossProfit'), value: pl.grossProfit, level: 0, subtotal: true },
      {
        key: 'operatingExpenses',
        label: t('pl.operatingExpenses'),
        value: -pl.operatingExpenses,
        level: 0,
        muted: true,
      },
      { key: 'commission', label: t('pl.commission'), value: -pl.commission, level: 1 },
    ]

    // Buyurtmadagi yetkazib berish haqi — nol bo'lsa qator chizilmaydi
    if (pl.logistics > 0) {
      rows.push({ key: 'orderLogistics', label: t('pl.orderLogistics'), value: -pl.logistics, level: 1 })
    }

    // Hisobdan yechilgan xizmatlar — modda bo'yicha (soliqdan tashqari)
    for (const key of EXPENSE_CATEGORIES) {
      if (key === 'taxes') continue
      const amount = pl.categories[key] || 0
      if (amount === 0) continue
      rows.push({ key: `cat-${key}`, label: t(`pl.category.${key}`), value: -amount, level: 1 })
    }

    rows.push(
      { key: 'operatingProfit', label: t('pl.operatingProfit'), value: pl.operatingProfit, level: 0, subtotal: true },
      { key: 'taxes', label: t('pl.taxes'), value: -pl.taxes, level: 1 },
      { key: 'netProfit', label: t('pl.netProfit'), value: pl.netProfit, level: 0, final: true },
    )

    return rows
  }, [pl, t])

  /* ── Oylar kesimi ────────────────────────────────────────────── */

  const chartData = useMemo(() => {
    const map = new Map()

    const row = (key) => {
      if (!map.has(key)) {
        map.set(key, { key, label: monthLabel(key, lang), revenue: 0, cost: 0, fees: 0, expenses: 0 })
      }
      return map.get(key)
    }

    for (const it of items) {
      const key = monthKey(it.date ?? it.dateIssued)
      if (!key) continue
      const qty = Number(it.amount) || 0
      const price = itemRevenue(it)
      const returnsQty = Number(it.amountReturns) || 0
      const r = row(key)
      r.revenue += price - (qty > 0 ? (price / qty) * returnsQty : 0)
      r.cost += itemCost(it, costs)
      r.fees += (Number(it.commission) || 0) + (Number(it.logisticDeliveryFee) || 0)
    }

    for (const p of payments) {
      if (p.type === 'INCOME') continue
      const key = monthKey(p.dateService ?? p.dateCreated ?? p.date)
      if (!key) continue
      row(key).expenses += Number(p.paymentPrice) || 0
    }

    return [...map.values()]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((r) => ({ ...r, netProfit: r.revenue - r.cost - r.fees - r.expenses }))
  }, [items, payments, costs, lang])

  /* ── Eksport ─────────────────────────────────────────────────── */

  const handleExport = () => {
    exportCsv(
      lines,
      [
        { key: 'label', header: t('pl.line') },
        { key: 'value', header: t('common.amount'), value: (r) => csvNum(Math.round(r.value)) },
      ],
      `foyda-zarar-${new Date().toISOString().slice(0, 10)}.csv`,
    )
  }

  const expenseColumns = useMemo(
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
        <PageHeader title={t('pl.title')} subtitle={t('pl.subtitle')} />
        <Card>
          <EmptyState icon={Store} title={t('errors.noShopSelected')} hint={t('errors.shopRequired')} />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader title={t('pl.title')} subtitle={t('pl.subtitle')}>
        <Button variant="secondary" icon={Download} onClick={handleExport} disabled={items.length === 0}>
          {t('common.exportCsv')}
        </Button>
      </PageHeader>

      <DevSource
        className="mb-4"
        compact
        sources={[
          {
            path: '/v1/finance/orders',
            params: { shopIds: ids, dateFrom: range.dateFrom, dateTo: range.dateTo, size: 100 },
            count: items.length,
            note: t('pl.sourceSales'),
          },
          {
            path: '/v1/finance/expenses',
            params: { shopIds: ids, dateFrom: range.dateFrom, dateTo: range.dateTo, size: 100 },
            count: payments.length,
            note: t('pl.sourceExpenses'),
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
            <span className="text-muted text-[13px]">
              {total
                ? t('commission.loadedOf', { loaded, total })
                : loaded
                  ? t('commission.loadingCount', { loaded })
                  : t('commission.loadingAll')}
            </span>
          </div>
        </Card>
      )}

      {error && <ErrorState message={message(error)} onRetry={reload} className="mb-4" />}

      {capped && (
        <Card className="mb-4">
          <p className="text-[13px] text-amber-600 dark:text-amber-400">{t('commission.capped')}</p>
        </Card>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('pl.netRevenue')}
          value={money(Math.round(pl.netRevenue), lang)}
          hint={t('pl.ordersCount', { n: sales.orders })}
          icon={Wallet}
          tone="brand"
          loading={loading}
        />
        <StatCard
          label={t('pl.grossProfit')}
          value={money(Math.round(pl.grossProfit), lang)}
          hint={pl.grossMargin !== null ? percent(pl.grossMargin, lang) : undefined}
          icon={Percent}
          tone={pl.grossProfit >= 0 ? 'success' : 'danger'}
          loading={loading}
        />
        <StatCard
          label={t('pl.operatingExpenses')}
          value={money(Math.round(pl.operatingExpenses), lang)}
          hint={t('pl.operatingExpensesHint')}
          icon={Landmark}
          tone="warning"
          loading={loading}
        />
        <StatCard
          label={t('pl.netProfit')}
          value={money(Math.round(pl.netProfit), lang)}
          hint={pl.netMargin !== null ? percent(pl.netMargin, lang) : undefined}
          icon={PiggyBank}
          tone={pl.netProfit >= 0 ? 'success' : 'danger'}
          loading={loading}
        />
      </div>

      {/* ── Hisobot ketma-ketligi ─────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader
          title={t('pl.statement')}
          subtitle={t('pl.statementHint')}
          action={<PeriodLabel dateFrom={range.dateFrom} dateTo={range.dateTo} count={items.length} />}
        />

        <div className="divide-app divide-y">
          {lines.map((line) => (
            <div
              key={line.key}
              className={cx(
                'flex items-center justify-between gap-4 py-2.5',
                line.final && 'border-app mt-1 border-t-2 pt-3',
              )}
            >
              <span
                className={cx(
                  'text-[13.5px]',
                  line.level === 1 && 'text-muted pl-5',
                  line.subtotal && 'text-app font-semibold',
                  line.final && 'text-app text-[15px] font-semibold',
                  line.muted && 'text-faint',
                )}
              >
                {line.label}
              </span>
              <span
                className={cx(
                  'tabular shrink-0 text-[13.5px]',
                  line.value < 0 ? 'text-red-600 dark:text-red-400' : 'text-app',
                  (line.subtotal || line.final) && 'font-semibold',
                  line.final && 'text-[15px]',
                  line.final && (pl.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : ''),
                )}
              >
                {money(Math.round(line.value), lang)}
              </span>
            </div>
          ))}
        </div>

        <p className="text-faint mt-3 text-[12px]">{t('pl.sellerProfitCheck', { value: money(Math.round(pl.sellerProfit), lang) })}</p>
      </Card>

      {/* ── Oylar bo'yicha ────────────────────────────────────── */}
      {chartData.length > 1 && (
        <Card className="mb-4">
          <CardHeader title={t('pl.byMonth')} subtitle={t('pl.byMonthHint')} />
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
                <RTooltip
                  contentStyle={tooltipStyle(ct)}
                  formatter={(v, name) => [money(Math.round(v), lang), name]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="revenue" name={t('pl.netRevenue')} fill={ct.primaryFill} stroke={ct.primary} radius={[6, 6, 0, 0]} />
                <Line
                  type="monotone"
                  dataKey="netProfit"
                  name={t('pl.netProfit')}
                  stroke={ct.success}
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* ── Xarajatlar taqsimoti ──────────────────────────────── */}
      <Card>
        <CardHeader title={t('pl.expenseBreakdown')} subtitle={t('pl.expenseBreakdownHint')} />
        <DataTable
          columns={expenseColumns}
          rows={expenses.bySource}
          rowKey={(r) => r.key}
          loading={loading && expenses.bySource.length === 0}
          emptyIcon={Scale}
          emptyTitle={t('pl.noExpenses')}
          emptyHint={t('pl.noExpensesHint')}
        />
        <p className="text-faint mt-3 text-[12px]">{t('pl.taxNote')}</p>
      </Card>
    </>
  )
}
