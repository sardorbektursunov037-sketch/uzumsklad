import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import {
  ShoppingCart,
  Truck,
  CheckCircle2,
  XCircle,
  Package,
  Boxes,
  ArrowRight,
  Clock,
  Store,
  Wallet,
  TrendingUp,
  Percent,
  Receipt,
  PiggyBank,
  AlertTriangle,
} from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useApi, useApiMessage } from '../hooks/useApi'
import {
  getOrdersAllStatuses,
  getOrdersCount,
  getProducts,
  getStocks,
  getFinanceOrders,
  getExpenses,
} from '../api/endpoints'
import {
  money,
  num,
  dateTime,
  daysAgo,
  deadline,
  toDate,
  cx,
  orderProblems,
  itemRevenue,
  shortDate,
} from '../utils/format'
import { PageHeader, StatCard, Card, CardHeader, EmptyState, ErrorState, Spinner, Segmented } from '../components/ui'
import { StatusBadge, SchemeBadge, ProductCell, DeadlineCell } from '../components/common'
import { DevSource } from '../components/DevSource'

/** Grafik uchun rang palitrasi — mavzuga mos keladi */
const PIE_COLORS = ['#7000ff', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#64748b']

export default function Dashboard() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const { isDark } = useTheme()
  const { activeShopId, shopIds, shops, shopsLoading } = useAuth()
  const message = useApiMessage()

  const [days, setDays] = useState(30)
  const dateFrom = useMemo(() => daysAgo(days), [days])
  const idsKey = shopIds.join(',')

  const ready = shopIds.length > 0

  /* Statuslar bo'yicha sanoq — joriy holat, sana filtri qo'yilmaydi */
  const counts = useApi(
    (signal) =>
      Promise.all(
        ['CREATED', 'DELIVERING', 'COMPLETED', 'CANCELED'].map((status) =>
          getOrdersCount({ shopIds, status }, { signal }).catch(() => null),
        ),
      ).then(([created, delivering, completed, canceled]) => ({ created, delivering, completed, canceled })),
    [idsKey],
    { skip: !ready },
  )

  /* So'nggi buyurtmalar — grafik, ro'yxat, shoshilinch va solishtiruv uchun
     bitta manba. Sana filtri yubormaymiz: davrlarni shu ro'yxatdan
     mahalliy hisoblaymiz, shunda API sana formatiga bog'liq bo'lib qolmaydi. */
  const orders = useApi(
    (signal) => getOrdersAllStatuses({ shopIds, perStatus: 50 }, { signal }),
    [idsKey],
    { skip: !ready },
  )

  /* Mahsulotlar soni — faqat umumiy raqam kerak, shuning uchun size=1 */
  const products = useApi(
    (signal) => getProducts(activeShopId, { size: 1, page: 0 }, { signal }),
    [activeShopId],
    { skip: !activeShopId },
  )

  /* Qoldig'i kam SKU lar */
  const stocks = useApi((signal) => getStocks({ page: 0, size: 100 }, { signal }), [idsKey], { skip: !ready })

  /* Moliya — sana filtrisiz so'raymiz, Uzum eng yangilarini qaytaradi.
     Shu tufayli sana formatiga bog'liq bo'lmaymiz va bo'sh ekran chiqmaydi. */
  const finance = useApi(
    (signal) => getFinanceOrders({ shopIds, page: 0, size: 100 }, { signal }),
    [idsKey],
    { skip: !ready },
  )

  const expenses = useApi(
    (signal) => getExpenses({ shopIds, page: 0, size: 100 }, { signal }),
    [idsKey],
    { skip: !ready },
  )

  const orderList = useMemo(() => orders.data?.orders || [], [orders.data])

  /* ── Grafik ma'lumotlari ─────────────────────────────────────── */

  /**
   * Grafik moliya yozuvlaridan quriladi — `/v2/fbs/orders` faqat FBS/DBS ni
   * qamraydi, FBO sotuvlari esa unda ko'rinmaydi. `/v1/finance/orders` esa
   * barcha sxemalarni beradi, shuning uchun dinamika to'liq chiqadi.
   */
  const chartData = useMemo(() => {
    const buckets = new Map()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(daysAgo(i))
      const key = d.toISOString().slice(0, 10)
      buckets.set(key, {
        key,
        label: shortDate(d, lang),
        count: 0,
        sum: 0,
        orders: new Set(),
      })
    }

    for (const it of finance.data?.orderItems || []) {
      const d = toDate(it.date ?? it.dateIssued)
      if (!d) continue
      const b = buckets.get(d.toISOString().slice(0, 10))
      if (!b) continue
      if (it.orderId !== undefined && it.orderId !== null) b.orders.add(it.orderId)
      b.sum += itemRevenue(it)
    }

    return [...buckets.values()].map((b) => ({ ...b, count: b.orders.size }))
  }, [finance.data, days, lang])

  const statusData = useMemo(() => {
    const map = new Map()
    for (const o of orderList) {
      if (!o.status) continue
      map.set(o.status, (map.get(o.status) || 0) + 1)
    }
    return [...map.entries()]
      .map(([status, value]) => ({ status, value, name: t(`enums.orderStatus.${status}`) }))
      .sort((a, b) => b.value - a.value)
  }, [orderList, t])

  const urgent = useMemo(
    () =>
      orderList
        .filter((o) => o.status === 'CREATED' && o.acceptUntil)
        .map((o) => ({ ...o, dl: deadline(o.acceptUntil, lang) }))
        .filter((o) => o.dl && (o.dl.overdue || o.dl.urgent))
        .sort((a, b) => a.dl.ms - b.dl.ms)
        .slice(0, 5),
    [orderList, lang],
  )

  const lowStock = useMemo(
    () =>
      (stocks.data?.skuAmountList || [])
        .filter((s) => s.fbsLinked && Number(s.amount) < 5)
        .sort((a, b) => Number(a.amount) - Number(b.amount))
        .slice(0, 5),
    [stocks.data],
  )

  /** Moliyaviy yig'indilar — sotuv daromadi, komissiya, xarajat va sof foyda */
  const financeTotals = useMemo(() => {
    const items = finance.data?.orderItems || []
    const sales = items.reduce(
      (acc, it) => ({
        revenue: acc.revenue + itemRevenue(it),
        profit: acc.profit + (Number(it.sellerProfit) || 0),
        commission: acc.commission + (Number(it.commission) || 0),
      }),
      { revenue: 0, profit: 0, commission: 0 },
    )
    const outcome = (expenses.data?.payments || [])
      .filter((p) => p.type !== 'INCOME')
      .reduce((sum, p) => sum + (Number(p.paymentPrice) || 0), 0)
    return { ...sales, outcome, net: sales.profit - outcome }
  }, [finance.data, expenses.data])

  const problemOrders = useMemo(
    () => orderList.filter((o) => orderProblems(o).length > 0),
    [orderList],
  )

  /** Buyurtmalarni joriy va oldingi davrga ajratamiz (mahalliy, sanaga ko'ra) */
  const periods = useMemo(() => {
    const prevFrom = daysAgo(days * 2)
    const cur = []
    const prev = []
    for (const o of orderList) {
      const d = toDate(o.dateCreated)
      if (!d) continue
      const ms = d.getTime()
      if (ms >= dateFrom) cur.push(o)
      else if (ms >= prevFrom) prev.push(o)
    }
    const sum = (list) =>
      list
        .filter((o) => !['CANCELED', 'RETURNED'].includes(o.status))
        .reduce((s, o) => s + (Number(o.price) || 0), 0)
    return { cur, prev, curRevenue: sum(cur), prevRevenue: sum(prev) }
  }, [orderList, dateFrom, days])

  const prevList = periods.prev
  const prevRevenue = periods.prevRevenue

  /** Foizdagi o'zgarish; oldingi davr bo'sh bo'lsa ko'rsatmaymiz */
  const growth = (cur, prev) => (prev ? ((cur - prev) / Math.abs(prev)) * 100 : undefined)

  const revenue = periods.curRevenue

  /* ── Do'kon tanlanmagan holat ────────────────────────────────── */

  if (!shopsLoading && shops.length === 0) {
    return (
      <>
        <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />
        <Card>
          <EmptyState icon={Store} title={t('dashboard.noShop')} hint={t('errors.noShopSelected')} />
        </Card>
      </>
    )
  }

  const axisColor = isDark ? '#6b7385' : '#9ca3af'
  const gridColor = isDark ? '#262c3a' : '#e5e7eb'

  return (
    <>
      <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')}>
        <Segmented
          size="sm"
          ariaLabel={t('common.period')}
          value={days}
          onChange={setDays}
          options={[
            { value: 7, label: t('common.last7days') },
            { value: 30, label: t('common.last30days') },
            { value: 90, label: t('common.last90days') },
          ]}
        />
      </PageHeader>

      <DevSource
        className="mb-4"
        compact
        sources={[
          {
            path: '/v2/fbs/orders/count',
            params: { shopIds, status: 'CREATED | DELIVERING | COMPLETED | CANCELED' },
            note: 'Yangi / Yetkazilmoqda / Yakunlangan / Bekor qilingan kartalari',
          },
          {
            path: '/v2/fbs/orders',
            params: { shopIds, status: '11 ta status alohida', size: 50 },
            count: orderList.length,
            note: "So'nggi buyurtmalar, statuslar donuti, muammoli buyurtmalar",
          },
          {
            path: '/v1/product/shop/{shopId}',
            params: { shopId: activeShopId, size: 1, page: 0 },
            count: products.data?.totalProductsAmount,
            note: 'Mahsulotlar kartasi (totalProductsAmount)',
          },
          {
            path: '/v3/fbs/sku/stocks',
            params: { page: 0, size: 100 },
            count: stocks.data?.skuAmountList?.length,
            note: "Faol qoldiq va qoldig'i kam SKU",
          },
          {
            path: '/v1/finance/orders',
            params: { shopIds, page: 0, size: 100 },
            count: finance.data?.orderItems?.length,
            note: 'Moliya bloki va buyurtmalar dinamikasi grafigi',
          },
          {
            path: '/v1/finance/expenses',
            params: { shopIds, page: 0, size: 100 },
            count: expenses.data?.payments?.length,
            note: 'Jami chiqim va sof foyda',
          },
        ]}
      />

      {/* ── Statistika kartalari ─────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('dashboard.newOrders')}
          value={num(counts.data?.created, lang)}
          hint={t('dashboard.newOrdersHint')}
          icon={ShoppingCart}
          tone="warning"
          loading={counts.loading}
        />
        <StatCard
          label={t('dashboard.inDelivery')}
          value={num(counts.data?.delivering, lang)}
          icon={Truck}
          tone="brand"
          loading={counts.loading}
        />
        <StatCard
          label={t('dashboard.completed')}
          value={num(counts.data?.completed, lang)}
          icon={CheckCircle2}
          tone="success"
          loading={counts.loading}
        />
        <StatCard
          label={t('dashboard.canceled')}
          value={num(counts.data?.canceled, lang)}
          icon={XCircle}
          tone="danger"
          loading={counts.loading}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('dashboard.revenue')}
          value={money(revenue, lang)}
          hint={t('dashboard.vsPrevious')}
          icon={Package}
          tone="success"
          loading={orders.loading}
          delta={growth(revenue, prevRevenue)}
        />
        <StatCard
          label={t('dashboard.products')}
          value={num(products.data?.totalProductsAmount, lang)}
          icon={Package}
          tone="brand"
          loading={products.loading}
        />
        <StatCard
          label={t('dashboard.activeStock')}
          value={num((stocks.data?.skuAmountList || []).reduce((s, x) => s + (Number(x.amount) || 0), 0), lang)}
          icon={Boxes}
          tone="neutral"
          loading={stocks.loading}
        />
        <StatCard
          label={t('dashboard.problemOrders')}
          value={num(problemOrders.length, lang)}
          hint={t('orders.problemHint')}
          icon={AlertTriangle}
          tone={problemOrders.length ? 'danger' : 'neutral'}
          loading={orders.loading}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('dashboard.lowStock')}
          value={num(lowStock.length, lang)}
          hint={t('dashboard.lowStockHint')}
          icon={Boxes}
          tone={lowStock.length ? 'warning' : 'neutral'}
          loading={stocks.loading}
        />
        <StatCard
          label={t('dashboard.ordersCount')}
          value={num(periods.cur.length, lang)}
          hint={t('dashboard.vsPrevious')}
          icon={ShoppingCart}
          tone="brand"
          loading={orders.loading}
          delta={growth(periods.cur.length, prevList.length)}
        />
      </div>

      {/* ── Moliya ───────────────────────────────────────────────── */}
      <section className="mt-5">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-app text-[15px] font-semibold">{t('dashboard.finance')}</h2>
            <p className="text-muted mt-0.5 text-[13px]">{t('finance.summaryHint')}</p>
          </div>
          <Link
            to="/finance"
            className="text-brand-600 dark:text-brand-400 inline-flex items-center gap-1 text-[13px] font-medium"
          >
            {t('dashboard.viewAll')}
            <ArrowRight size={13} />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard
            label={t('finance.totalRevenue')}
            value={money(financeTotals.revenue, lang)}
            icon={Wallet}
            tone="brand"
            loading={finance.loading}
          />
          <StatCard
            label={t('finance.totalProfit')}
            value={money(financeTotals.profit, lang)}
            icon={TrendingUp}
            tone="success"
            loading={finance.loading}
          />
          <StatCard
            label={t('finance.totalCommission')}
            value={money(financeTotals.commission, lang)}
            icon={Percent}
            tone="warning"
            loading={finance.loading}
          />
          <StatCard
            label={t('expenses.totalOutcome')}
            value={money(financeTotals.outcome, lang)}
            icon={Receipt}
            tone="danger"
            loading={expenses.loading}
          />
          <StatCard
            label={t('finance.netProfit')}
            value={money(financeTotals.net, lang)}
            hint={t('finance.netProfitHint')}
            icon={PiggyBank}
            tone={financeTotals.net >= 0 ? 'success' : 'danger'}
            loading={finance.loading || expenses.loading}
          />
        </div>
      </section>

      {/* ── Grafiklar ────────────────────────────────────────────── */}
      <div className="mt-5 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title={t('dashboard.ordersChart')} subtitle={`${days} ${t('common.days')}`} />
          <div className="mt-4 h-[260px]">
            {finance.loading ? (
              <div className="flex h-full items-center justify-center">
                <Spinner size={22} />
              </div>
            ) : finance.error ? (
              <ErrorState message={message(finance.error)} onRetry={finance.refetch} compact />
            ) : chartData.every((d) => d.count === 0) ? (
              <EmptyState compact title={t('dashboard.noChartData')} hint={null} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                  <defs>
                    <linearGradient id="ordersFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7000ff" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#7000ff" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: axisColor, fontSize: 11 }}
                    axisLine={{ stroke: gridColor }}
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={16}
                  />
                  <YAxis tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
                  <RTooltip
                    contentStyle={{
                      background: isDark ? '#14171f' : '#fff',
                      border: `1px solid ${gridColor}`,
                      borderRadius: 10,
                      fontSize: 12,
                      color: isDark ? '#e8eaef' : '#111827',
                    }}
                    formatter={(value) => [num(value, lang), t('dashboard.ordersCount')]}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#7000ff"
                    strokeWidth={2}
                    fill="url(#ordersFill)"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title={t('dashboard.statusChart')} />
          <div className="mt-4 h-[260px]">
            {orders.loading ? (
              <div className="flex h-full items-center justify-center">
                <Spinner size={22} />
              </div>
            ) : statusData.length === 0 ? (
              <EmptyState compact hint={null} title={t('common.noData')} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={52}
                    outerRadius={80}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {statusData.map((entry, i) => (
                      <Cell key={entry.status} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <RTooltip
                    contentStyle={{
                      background: isDark ? '#14171f' : '#fff',
                      border: `1px solid ${gridColor}`,
                      borderRadius: 10,
                      fontSize: 12,
                      color: isDark ? '#e8eaef' : '#111827',
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={56}
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => <span style={{ color: axisColor, fontSize: 11 }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* ── Ro'yxatlar ───────────────────────────────────────────── */}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card padded={false}>
          <div className="p-5 pb-3">
            <CardHeader
              title={t('dashboard.urgentOrders')}
              subtitle={t('dashboard.urgentHint')}
              action={
                <Link to="/orders" className="text-brand-600 dark:text-brand-400 inline-flex items-center gap-1 text-[13px] font-medium">
                  {t('dashboard.viewAll')}
                  <ArrowRight size={13} />
                </Link>
              }
            />
          </div>
          {orders.loading ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner />
            </div>
          ) : urgent.length === 0 ? (
            <EmptyState icon={Clock} compact title={t('common.noData')} hint={null} />
          ) : (
            <ul className="border-app border-t">
              {urgent.map((o) => (
                <li key={o.id} className="border-app hover:bg-surface-hover flex items-center gap-3 border-b px-5 py-3 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-app tabular text-[13.5px] font-medium">#{o.id}</span>
                      <SchemeBadge scheme={o.scheme} />
                    </div>
                    <p className="text-faint mt-0.5 text-[12px]">{t('orders.itemsCount', { count: o.orderItems?.length || 0 })}</p>
                  </div>
                  <div className="text-right">
                    <DeadlineCell deadline={o.dl} text={dateTime(o.acceptUntil, lang)} />
                    <p className="text-faint tabular mt-0.5 text-[12px]">{money(o.price, lang)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padded={false}>
          <div className="p-5 pb-3">
            <CardHeader
              title={t('dashboard.recentOrders')}
              action={
                <Link to="/orders" className="text-brand-600 dark:text-brand-400 inline-flex items-center gap-1 text-[13px] font-medium">
                  {t('dashboard.viewAll')}
                  <ArrowRight size={13} />
                </Link>
              }
            />
          </div>
          {orders.loading ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner />
            </div>
          ) : orderList.length === 0 ? (
            <EmptyState compact title={t('orders.noOrders')} hint={null} />
          ) : (
            <ul className="border-app border-t">
              {orderList.slice(0, 5).map((o) => (
                <li key={o.id} className="border-app hover:bg-surface-hover flex items-center gap-3 border-b px-5 py-3 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-app tabular text-[13.5px] font-medium">#{o.id}</span>
                      <StatusBadge group="orderStatus" value={o.status} size="sm" />
                    </div>
                    <p className="text-faint mt-0.5 text-[12px]">{dateTime(o.dateCreated, lang)}</p>
                  </div>
                  <span className="text-app tabular text-[13px] font-medium">{money(o.price, lang)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {lowStock.length > 0 && (
        <Card padded={false} className="mt-4">
          <div className="p-5 pb-3">
            <CardHeader
              title={t('dashboard.lowStock')}
              subtitle={t('dashboard.lowStockHint')}
              action={
                <Link to="/stocks" className="text-brand-600 dark:text-brand-400 inline-flex items-center gap-1 text-[13px] font-medium">
                  {t('dashboard.viewAll')}
                  <ArrowRight size={13} />
                </Link>
              }
            />
          </div>
          <ul className="border-app border-t">
            {lowStock.map((s) => (
              <li key={s.skuId} className="border-app flex items-center gap-3 border-b px-5 py-3 last:border-0">
                <ProductCell title={s.productTitle} subtitle={s.skuTitle} size={32} />
                <span
                  className={cx(
                    'tabular ml-auto rounded-md px-2 py-0.5 text-[13px] font-semibold',
                    Number(s.amount) === 0
                      ? 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400'
                      : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
                  )}
                >
                  {num(s.amount, lang)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}
