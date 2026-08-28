import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Store, Wallet, PiggyBank, Percent, Download, Boxes, TrendingUp } from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import { useApiMessage } from '../hooks/useApi'
import { getFinanceOrders } from '../api/endpoints'
import { money, num, percent, cx, daysAgo, itemRevenue, monthKey, monthLabel } from '../utils/format'
import { exportCsv, csvNum } from '../utils/csv'
import {
  PageHeader,
  Card,
  StatCard,
  DataTable,
  Tabs,
  Button,
  Switch,
  Badge,
  EmptyState,
  ErrorState,
  Spinner,
} from '../components/ui'
import { ProductCell, FilterBar, DateRangeFilter, StatusBadge } from '../components/common'
import { DevSource } from '../components/DevSource'
import { PeriodLabel } from '../components/PeriodLabel'
import { useCostOverride } from '../hooks/useCostOverride'

/** Bir so'rovda 100 tadan, ko'pi bilan 30 sahifa — 3000 pozitsiya */
const PAGE_SIZE = 100
const MAX_PAGES = 30

// Tahlil sahifasi uchun standart davr — oxirgi 30 kun.
// «Barchasi» tanlansa butun tarix yuklanadi (o'n minglab yozuv bo'lishi mumkin).
const DEFAULT_RANGE = { dateFrom: daysAgo(30), dateTo: undefined }

/**
 * Davr uchun barcha moliyaviy pozitsiyalarni yig'ib oladi.
 * `/v1/finance/orders` sahifalab qaytaradi, tahlil uchun esa hammasi kerak.
 */
async function fetchAllFinance({ shopIds, dateFrom, dateTo }, signal, onProgress) {
  const items = []
  let total = null

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await getFinanceOrders({ shopIds, page, size: PAGE_SIZE, dateFrom, dateTo }, { signal })
    const batch = res?.orderItems || []
    items.push(...batch)
    if (total === null) total = res?.totalElements ?? null
    onProgress?.(items.length, total)

    if (batch.length < PAGE_SIZE) break
    if (total !== null && items.length >= total) break
  }

  return { items, total, capped: items.length >= PAGE_SIZE * MAX_PAGES }
}

/** Bo'sh yig'indi obyekti */
const zero = () => ({
  docs: new Set(),
  qty: 0,
  revenue: 0,
  cost: 0,
  commission: 0,
  logistics: 0,
  sellerProfit: 0,
  returnsQty: 0,
  returnsSum: 0,
  withdrawn: 0,
  withdrawCount: 0,
})

function addItem(acc, it) {
  const amount = Number(it.amount) || 0
  const price = itemRevenue(it)
  const returns = Number(it.amountReturns) || 0

  if (it.orderId !== undefined && it.orderId !== null) acc.docs.add(it.orderId)
  acc.qty += amount
  acc.revenue += price
  acc.cost += Number(it.purchasePrice) || 0
  acc.commission += Number(it.commission) || 0
  acc.logistics += Number(it.logisticDeliveryFee) || 0
  acc.sellerProfit += Number(it.sellerProfit) || 0
  acc.returnsQty += returns
  const withdrawn = Number(it.withdrawnProfit) || 0
  acc.withdrawn += withdrawn
  if (withdrawn > 0) acc.withdrawCount++
  // Qaytarish summasi alohida maydonda kelmaydi — birlik narxdan hisoblaymiz
  acc.returnsSum += amount > 0 ? (price / amount) * returns : 0
}

/** Yig'indidan hosila ko'rsatkichlar */
function finalize(acc, extra = {}) {
  const grossProfit = acc.revenue - acc.cost - acc.commission - acc.logistics
  return {
    ...extra,
    docs: acc.docs.size,
    qty: acc.qty,
    revenue: acc.revenue,
    cost: acc.cost,
    commission: acc.commission,
    logistics: acc.logistics,
    sellerProfit: acc.sellerProfit,
    returnsQty: acc.returnsQty,
    returnsSum: acc.returnsSum,
    withdrawn: acc.withdrawn,
    withdrawCount: acc.withdrawCount,
    grossProfit,
    avgPrice: acc.qty > 0 ? acc.revenue / acc.qty : 0,
    marginSales: acc.revenue > 0 ? (grossProfit / acc.revenue) * 100 : null,
    marginCost: acc.cost > 0 ? (grossProfit / acc.cost) * 100 : null,
  }
}

export default function Profitability() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const { shopIds, shops } = useAuth()
  const { costs, setCost, clearAll, count: costCount } = useCostOverride()
  const message = useApiMessage()

  const [range, setRange] = useState(DEFAULT_RANGE)
  const [compare, setCompare] = useState(false)
  const [tab, setTab] = useState('product')

  const [state, setState] = useState({ items: [], prev: [], loading: false, error: null, loaded: 0, total: null, capped: false })
  const reqRef = useRef(0)

  const idsKey = shopIds.join(',')

  // `shopIds` har renderda yangi massiv bo'ladi — effekt cheksiz qayta
  // ishga tushmasligi uchun barqaror satr kalitidan qayta quramiz.
  const ids = useMemo(() => (idsKey ? idsKey.split(',').map(Number) : []), [idsKey])

  useEffect(() => {
    if (ids.length === 0) return undefined

    const ctrl = new AbortController()
    const id = ++reqRef.current
    setState((s) => ({ ...s, loading: true, error: null, loaded: 0 }))

    const run = async () => {
      try {
        const main = await fetchAllFinance(
          { shopIds: ids, dateFrom: range.dateFrom, dateTo: range.dateTo },
          ctrl.signal,
          (loaded, total) => {
            if (reqRef.current === id) setState((s) => ({ ...s, loaded, total }))
          },
        )

        let prev = []
        if (compare && range.dateFrom) {
          // Oldingi davr — joriy davr bilan bir xil uzunlikda
          const to = range.dateTo ?? Date.now()
          const span = to - range.dateFrom
          const prevRes = await fetchAllFinance(
            { shopIds: ids, dateFrom: range.dateFrom - span, dateTo: range.dateFrom - 1 },
            ctrl.signal,
          )
          prev = prevRes.items
        }

        if (reqRef.current === id) {
          setState({
            items: main.items,
            prev,
            loading: false,
            error: null,
            loaded: main.items.length,
            total: main.total,
            capped: main.capped,
          })
        }
      } catch (err) {
        if (err?.name === 'AbortError' || reqRef.current !== id) return
        setState((s) => ({ ...s, loading: false, error: err }))
      }
    }

    run()
    return () => ctrl.abort()
  }, [ids, range.dateFrom, range.dateTo, compare])

  const shopName = useMemo(() => {
    const map = new Map(shops.map((s) => [s.id, s.name]))
    return (id) => map.get(id) || (id ? `#${id}` : '—')
  }, [shops])

  /* ── Guruhlash ───────────────────────────────────────────────── */

  const group = useCallback(
    (items) => {
    const map = new Map()

    for (const it of items) {
      let key
      let meta

      if (tab === 'product') {
        key = `${it.productId ?? '?'}|${it.skuTitle ?? ''}`
        meta = {
          title: it.productTitle || it.skuTitle,
          subtitle: [it.skuCharTitle, it.skuCharValue].filter(Boolean).join(': ') || it.skuTitle,
          article: it.sellerSkuCode,
          image: it.productImage?.photo?.[240]?.high || it.productImage?.url,
          productId: it.productId,
        }
      } else if (tab === 'shop') {
        key = String(it.shopId ?? '?')
        meta = { title: shopName(it.shopId), subtitle: null, article: it.shopId }
      } else if (tab === 'month') {
        key = monthKey(it.date ?? it.dateIssued) ?? '?'
        meta = { title: monthLabel(key, lang), subtitle: null, article: key, month: key }
      } else {
        key = String(it.status ?? '?')
        meta = { title: it.status, subtitle: null, article: null, status: it.status }
      }

      if (!map.has(key)) map.set(key, { acc: zero(), meta })
      addItem(map.get(key).acc, it)
    }

      return [...map.entries()].map(([key, v]) => finalize(v.acc, { key, ...v.meta }))
    },
    [tab, shopName, lang],
  )

  /**
   * Uzum tannarxi noto'g'ri bo'lsa, foydalanuvchi kiritgan «o'z tannarxi»
   * ustunlik qiladi: qator tannarxi = dona uchun qiymat x soni.
   */
  const applyOwnCost = useCallback(
    (r) => {
      const unit = costs[r.key]
      if (unit === undefined) return r
      const cost = unit * r.qty
      const grossProfit = r.revenue - cost - r.commission - r.logistics
      return {
        ...r,
        cost,
        unitCost: unit,
        costOverridden: true,
        grossProfit,
        marginSales: r.revenue > 0 ? (grossProfit / r.revenue) * 100 : null,
        marginCost: cost > 0 ? (grossProfit / cost) * 100 : null,
      }
    },
    [costs],
  )

  const rows = useMemo(() => {
    const list = group(state.items).map(applyOwnCost)
    return tab === 'month'
      ? list.sort((a, b) => String(b.key).localeCompare(String(a.key)))
      : list.sort((a, b) => b.revenue - a.revenue)
  }, [state.items, group, tab, applyOwnCost])
  const prevRows = useMemo(
    () => (compare ? group(state.prev).map(applyOwnCost) : []),
    [state.prev, compare, group, applyOwnCost],
  )

  const prevMap = useMemo(() => new Map(prevRows.map((r) => [r.key, r])), [prevRows])

  /** Yig'indi qatorlardan olinadi — «o'z tannarxi» ham hisobga tushadi */
  const totals = useMemo(() => {
    const sum = rows.reduce(
      (a, r) => ({
        docs: a.docs + r.docs,
        qty: a.qty + r.qty,
        revenue: a.revenue + r.revenue,
        cost: a.cost + r.cost,
        commission: a.commission + r.commission,
        logistics: a.logistics + r.logistics,
        sellerProfit: a.sellerProfit + r.sellerProfit,
        returnsQty: a.returnsQty + r.returnsQty,
        returnsSum: a.returnsSum + r.returnsSum,
        withdrawn: a.withdrawn + r.withdrawn,
        withdrawCount: a.withdrawCount + r.withdrawCount,
      }),
      {
        docs: 0, qty: 0, revenue: 0, cost: 0, commission: 0, logistics: 0,
        sellerProfit: 0, returnsQty: 0, returnsSum: 0, withdrawn: 0, withdrawCount: 0,
      },
    )
    const grossProfit = sum.revenue - sum.cost - sum.commission - sum.logistics
    return {
      ...sum,
      grossProfit,
      avgPrice: sum.qty > 0 ? sum.revenue / sum.qty : 0,
      marginSales: sum.revenue > 0 ? (grossProfit / sum.revenue) * 100 : null,
      marginCost: sum.cost > 0 ? (grossProfit / sum.cost) * 100 : null,
    }
  }, [rows])

  const prevTotals = useMemo(() => {
    if (!compare) return null
    return prevRows.reduce(
      (a, r) => ({
        revenue: a.revenue + r.revenue,
        grossProfit: a.grossProfit + r.grossProfit,
      }),
      { revenue: 0, grossProfit: 0 },
    )
  }, [prevRows, compare])

  const delta = useCallback(
    (cur, prev) => {
      if (!compare || prev === null || prev === undefined || !prev) return undefined
      return ((cur - prev) / Math.abs(prev)) * 100
    },
    [compare],
  )

  /**
   * Tannarx ishonchsiz: umuman ko'rsatilmagan yoki tushumdan katta.
   * Uzum'da «Цена закупки» to'ldirilmagan bo'lsa, yalpi foyda manfiy chiqadi.
   */
  const costSuspect = useMemo(
    () => rows.some((r) => !r.cost || r.cost > r.revenue),
    [rows],
  )

  /* ── Ustunlar ────────────────────────────────────────────────── */

  const columns = useMemo(() => {
    const nameCol =
      tab === 'product'
        ? {
            key: 'title',
            header: t('products.product'),
            nowrap: false,
            width: '24%',
            render: (r) => <ProductCell image={r.image} title={r.title} subtitle={r.subtitle} size={34} />,
          }
        : tab === 'shop'
          ? {
              key: 'title',
              header: t('common.shop'),
              nowrap: false,
              render: (r) => <span className="text-app text-[13.5px] font-medium">{r.title}</span>,
            }
          : tab === 'month'
            ? {
                key: 'title',
                header: t('pnl.month'),
                render: (r) => <span className="text-app text-[13.5px] font-medium">{r.title}</span>,
              }
            : {
                key: 'title',
                header: t('common.status'),
                render: (r) => <StatusBadge group="financeStatus" value={r.status} size="sm" />,
              }

    return [
      nameCol,
      {
        key: 'docs',
        header: t('pnl.docs'),
        align: 'right',
        render: (r) => <span className="tabular">{num(r.docs, lang)}</span>,
      },
      {
        key: 'qty',
        header: t('pnl.qty'),
        align: 'right',
        render: (r) => <span className="tabular font-medium">{num(r.qty, lang)}</span>,
      },
      {
        key: 'avgPrice',
        header: t('pnl.avgPrice'),
        align: 'right',
        render: (r) => <span className="tabular">{money(r.avgPrice, lang, { currency: false })}</span>,
      },
      {
        key: 'revenue',
        header: t('pnl.sum'),
        align: 'right',
        render: (r) => (
          <div>
            <span className="tabular text-[13.5px] font-medium">{money(r.revenue, lang, { currency: false })}</span>
            {compare && prevMap.has(r.key) && <Delta value={delta(r.revenue, prevMap.get(r.key).revenue)} />}
          </div>
        ),
      },
      {
        key: 'cost',
        header: t('pnl.costSum'),
        align: 'right',
        render: (r) => (
          <span
            className={cx(
              'tabular',
              r.costOverridden && 'font-medium text-brand-600 dark:text-brand-400',
            )}
            title={r.costOverridden ? t('pnl.ownCost') : undefined}
          >
            {money(r.cost, lang, { currency: false })}
          </span>
        ),
      },
      ...(tab === 'product'
        ? [
            {
              key: 'unitCost',
              header: t('pnl.unitCost'),
              align: 'right',
              width: 130,
              render: (r) => (
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={costs[r.key] ?? ''}
                  placeholder={r.qty > 0 ? String(Math.round(r.cost / r.qty)) : '0'}
                  onChange={(e) => setCost(r.key, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className={cx(
                    'tabular bg-surface h-8 w-28 rounded-lg border px-2 text-right text-[13px] transition-colors',
                    'focus:border-brand-500 focus:outline-none',
                    r.costOverridden && 'border-brand-500 bg-brand-50/60 dark:bg-brand-950/30 font-medium',
                  )}
                />
              ),
            },
          ]
        : []),
      {
        key: 'commission',
        header: t('finance.commission'),
        align: 'right',
        render: (r) => (
          <span className="tabular text-red-600 dark:text-red-400">{money(r.commission, lang, { currency: false })}</span>
        ),
      },
      {
        key: 'logistics',
        header: t('finance.logisticFee'),
        align: 'right',
        render: (r) => (
          <span className="tabular text-red-600 dark:text-red-400">{money(r.logistics, lang, { currency: false })}</span>
        ),
      },
      {
        key: 'returnsQty',
        header: t('pnl.returns'),
        align: 'right',
        render: (r) =>
          r.returnsQty ? (
            <span className="tabular text-amber-600 dark:text-amber-400">
              {num(r.returnsQty, lang)} · {money(r.returnsSum, lang, { currency: false })}
            </span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      {
        key: 'grossProfit',
        header: t('pnl.grossProfit'),
        align: 'right',
        render: (r) => (
          <div>
            <span
              className={cx(
                'tabular text-[13.5px] font-semibold',
                r.grossProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
              )}
            >
              {money(r.grossProfit, lang, { currency: false })}
            </span>
            {compare && prevMap.has(r.key) && <Delta value={delta(r.grossProfit, prevMap.get(r.key).grossProfit)} />}
          </div>
        ),
      },
      {
        key: 'sellerProfit',
        header: t('pnl.sellerProfit'),
        align: 'right',
        render: (r) => <span className="tabular">{money(r.sellerProfit, lang, { currency: false })}</span>,
      },
      {
        key: 'withdrawn',
        header: t('finance.withdrawnProfit'),
        align: 'right',
        render: (r) =>
          r.withdrawn ? (
            <div>
              <span className="tabular font-medium text-emerald-600 dark:text-emerald-400">
                {money(r.withdrawn, lang, { currency: false })}
              </span>
              <span className="text-faint tabular block text-[11px]">
                {num(r.withdrawCount, lang)} {'\u00d7'}
              </span>
            </div>
          ) : (
            <span className="text-faint">{'\u2014'}</span>
          ),
      },
      {
        key: 'marginSales',
        header: t('pnl.marginSales'),
        align: 'right',
        render: (r) =>
          r.marginSales === null ? (
            <span className="text-faint">—</span>
          ) : (
            <Badge tone={r.marginSales >= 20 ? 'success' : r.marginSales >= 0 ? 'warning' : 'danger'} size="sm" dot={false}>
              {percent(r.marginSales, lang)}
            </Badge>
          ),
      },
      {
        key: 'marginCost',
        header: t('pnl.marginGoods'),
        align: 'right',
        render: (r) =>
          r.marginCost === null ? <span className="text-faint">—</span> : <span className="tabular">{percent(r.marginCost, lang)}</span>,
      },
    ]
  }, [t, lang, tab, compare, prevMap, delta, costs, setCost])

  /* ── CSV ─────────────────────────────────────────────────────── */

  const doExport = () => {
    exportCsv(
      rows,
      [
        { header: '№', value: (_r) => rows.indexOf(_r) + 1 },
        { header: t('products.product'), value: (r) => r.title },
        { header: t('common.sku'), value: (r) => r.subtitle || '' },
        { header: t('common.article'), value: (r) => r.article || '' },
        { header: t('pnl.docs'), value: (r) => r.docs },
        { header: t('pnl.qty'), value: (r) => r.qty },
        { header: t('pnl.avgPrice'), value: (r) => csvNum(Math.round(r.avgPrice)) },
        { header: t('pnl.sum'), value: (r) => csvNum(Math.round(r.revenue)) },
        { header: t('pnl.costSum'), value: (r) => csvNum(Math.round(r.cost)) },
        { header: t('pnl.unitCost'), value: (r) => (r.unitCost === undefined ? '' : csvNum(r.unitCost)) },
        { header: t('finance.commission'), value: (r) => csvNum(Math.round(r.commission)) },
        { header: t('finance.logisticFee'), value: (r) => csvNum(Math.round(r.logistics)) },
        { header: t('pnl.returns'), value: (r) => r.returnsQty },
        { header: t('pnl.grossProfit'), value: (r) => csvNum(Math.round(r.grossProfit)) },
        { header: t('pnl.sellerProfit'), value: (r) => csvNum(Math.round(r.sellerProfit)) },
        { header: t('finance.withdrawnProfit'), value: (r) => csvNum(Math.round(r.withdrawn)) },
        { header: t('finance.withdrawCount'), value: (r) => r.withdrawCount },
        { header: t('pnl.marginSales'), value: (r) => (r.marginSales === null ? '' : csvNum(r.marginSales.toFixed(2))) },
        { header: t('pnl.marginGoods'), value: (r) => (r.marginCost === null ? '' : csvNum(r.marginCost.toFixed(2))) },
      ],
      `uzum-profitability-${new Date().toISOString().slice(0, 10)}.csv`,
    )
  }

  /* ── Render ──────────────────────────────────────────────────── */

  if (shopIds.length === 0) {
    return (
      <>
        <PageHeader title={t('pnl.title')} subtitle={t('pnl.subtitle')} />
        <Card>
          <EmptyState icon={Store} title={t('errors.noShopSelected')} hint={t('finance.shopRequired')} />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader title={t('pnl.title')} subtitle={t('pnl.subtitle')}>
        {costCount > 0 && (
          <>
            <Badge tone="info">{t('pnl.ownCostSet', { count: costCount })}</Badge>
            <Button variant="ghost" onClick={clearAll}>
              {t('pnl.clearCosts')}
            </Button>
          </>
        )}
        <Button variant="secondary" icon={Download} onClick={doExport} disabled={!rows.length}>
          {t('pnl.exportCsv')}
        </Button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('finance.totalRevenue')}
          value={money(totals.revenue, lang)}
          icon={Wallet}
          tone="brand"
          loading={state.loading}
          delta={prevTotals ? delta(totals.revenue, prevTotals.revenue) : undefined}
          hint={prevTotals ? t('pnl.previousPeriod') : undefined}
        />
        <StatCard
          label={t('pnl.grossProfit')}
          value={money(totals.grossProfit, lang)}
          hint={t('pnl.grossProfitHint')}
          icon={PiggyBank}
          tone={totals.grossProfit >= 0 ? 'success' : 'danger'}
          loading={state.loading}
          delta={prevTotals ? delta(totals.grossProfit, prevTotals.grossProfit) : undefined}
        />
        <StatCard
          label={t('pnl.marginSales')}
          value={totals.marginSales === null ? '—' : percent(totals.marginSales, lang)}
          icon={Percent}
          tone={totals.marginSales >= 0 ? 'success' : 'danger'}
          loading={state.loading}
        />
        <StatCard
          label={t('finance.itemsSold')}
          value={num(totals.qty, lang)}
          hint={`${t('pnl.docs')}: ${num(totals.docs, lang)}`}
          icon={Boxes}
          tone="neutral"
          loading={state.loading}
        />
      </div>

      <PeriodLabel
        className="mb-3"
        dateFrom={range.dateFrom}
        dateTo={range.dateTo}
        count={state.loaded}
      />

      <DevSource
        className="mb-4"
        sources={[
          {
            path: '/v1/finance/orders',
            params: {
              shopIds,
              page: `0..${Math.max(0, Math.ceil(state.loaded / PAGE_SIZE) - 1)}`,
              size: PAGE_SIZE,
              dateFrom: range.dateFrom ? Math.floor(range.dateFrom / 1000) : undefined,
              dateTo: range.dateTo ? Math.floor(range.dateTo / 1000) : undefined,
            },
            count: state.loaded,
            note: 'sellPrice · purchasePrice · commission · logisticDeliveryFee · sellerProfit · withdrawnProfit',
          },
        ]}
      />

      <FilterBar
        onReset={() => {
          setRange(DEFAULT_RANGE)
          setCompare(false)
        }}
      >
        <DateRangeFilter value={range} onChange={setRange} />
        <div className="pb-1.5">
          <Switch checked={compare} onChange={setCompare} label={t('pnl.compare')} />
        </div>
        {state.loading && state.total ? (
          <span className="text-faint flex items-center gap-2 pb-1.5 text-[12px]">
            <Spinner size={13} />
            {t('pnl.loadedOf', { loaded: state.loaded, total: state.total })}
          </span>
        ) : null}
      </FilterBar>

      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-4"
        tabs={[
          { value: 'product', label: t('pnl.byProduct'), count: tab === 'product' ? rows.length : undefined },
          { value: 'month', label: t('pnl.byMonth') },
          { value: 'shop', label: t('pnl.byShop') },
          { value: 'status', label: t('pnl.byStatus') },
        ]}
      />

      {state.capped && (
        <p className="mb-3 rounded-lg bg-amber-50 p-3 text-[13px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          {t('pnl.capped', { n: PAGE_SIZE * MAX_PAGES })}
        </p>
      )}
      {costSuspect && !state.loading && rows.length > 0 && (
        <p className="mb-3 rounded-lg bg-amber-50 p-3 text-[13px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          {t('pnl.noCost')}
          <span className="mt-1.5 block opacity-90">{t('pnl.apiCannotWriteCost')}</span>
        </p>
      )}

      {state.error ? (
        <Card>
          <ErrorState message={message(state.error)} />
        </Card>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.key}
            loading={state.loading}
            emptyIcon={TrendingUp}
            numbered
          />

          {rows.length > 0 && !state.loading && (
            <Card className="mt-3">
              <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
                <span className="text-app text-[13px] font-semibold">{t('pnl.totals')}</span>
                <Total label={t('pnl.qty')} value={num(totals.qty, lang)} />
                <Total label={t('pnl.sum')} value={money(totals.revenue, lang)} />
                <Total label={t('pnl.costSum')} value={money(totals.cost, lang)} />
                <Total label={t('finance.commission')} value={money(totals.commission, lang)} tone="danger" />
                <Total label={t('finance.logisticFee')} value={money(totals.logistics, lang)} tone="danger" />
                <Total label={t('pnl.returns')} value={num(totals.returnsQty, lang)} />
                <Total
                  label={t('pnl.grossProfit')}
                  value={money(totals.grossProfit, lang)}
                  tone={totals.grossProfit >= 0 ? 'success' : 'danger'}
                />
                <Total label={t('pnl.sellerProfit')} value={money(totals.sellerProfit, lang)} />
                <Total
                  label={`${t('finance.withdrawnProfit')} (${num(totals.withdrawCount, lang)}\u00d7)`}
                  value={money(totals.withdrawn, lang)}
                  tone="success"
                />
              </div>
            </Card>
          )}
        </>
      )}
    </>
  )
}

/* ── Yordamchi komponentlar ────────────────────────────────────── */

function Total({ label, value, tone }) {
  return (
    <div>
      <p className="text-faint text-[11.5px]">{label}</p>
      <p
        className={cx(
          'tabular text-[14px] font-semibold',
          tone === 'success' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'danger' && 'text-red-600 dark:text-red-400',
        )}
      >
        {value}
      </p>
    </div>
  )
}

function Delta({ value }) {
  if (value === undefined || !Number.isFinite(value)) return null
  return (
    <span
      className={cx(
        'tabular block text-[11px] font-medium',
        value >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
      )}
    >
      {value >= 0 ? '+' : ''}
      {value.toFixed(1)}%
    </span>
  )
}
