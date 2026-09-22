import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Calculator, Store, Download, Percent, PiggyBank, Wallet } from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import { useBulkLoad } from '../hooks/useBulkLoad'
import { cacheKey as ck } from '../api/cache'
import { useApiMessage } from '../hooks/useApi'
import { realizedItems, itemCost } from '../api/financeItems'
import { useCostOverride } from '../hooks/useCostOverride'
import { fetchFinanceAndExpenses } from '../api/bulk'
import { groupExpenses } from '../api/expenseCategories'
import { PAGE_SIZES } from '../api/constants'
import { money, num, percent, cx, daysAgo, itemRevenue } from '../utils/format'
import { exportCsv, csvNum } from '../utils/csv'
import {
  PageHeader,
  Card,
  CardHeader,
  StatCard,
  DataTable,
  Pagination,
  Button,
  Switch,
  EmptyState,
  ErrorState,
  Spinner,
} from '../components/ui'
import { ProductCell, FilterBar, DateRangeFilter } from '../components/common'
import { DevSource } from '../components/DevSource'
import { PeriodLabel } from '../components/PeriodLabel'

/**
 * Yunit-iqtisod (Юнит-экономика).
 *
 * Har bir tovar bitta sotuvdan qancha foyda keltirishini ko'rsatadi:
 *
 *   Tushum − qaytarish − tannarx − komissiya − logistika = Yalpi foyda
 *   Dona uchun foyda = yalpi foyda / sotilgan soni
 *   Rentabellik      = yalpi foyda / tushum
 *
 * «Operatsion xarajatlarni taqsimlash» yoqilganda `/v1/finance/expenses`
 * dagi umumiy xarajatlar (reklama, saqlash, ...) tovarlar orasida tushumga
 * proporsional bo'linadi — MoySklad'dagi shu nomli tugma bilan bir xil.
 */

const DEFAULT_RANGE = { dateFrom: daysAgo(30), dateTo: undefined }

export default function UnitEconomics() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const { shopIds } = useAuth()
  const { costs } = useCostOverride()
  const message = useApiMessage()

  const [range, setRange] = useState(DEFAULT_RANGE)
  const [allocate, setAllocate] = useState(false)
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)

  const idsKey = shopIds.join(',')
  const ids = useMemo(() => (idsKey ? idsKey.split(',').map(Number) : []), [idsKey])

  const load = useCallback(
    (signal, onProgress) =>
      fetchFinanceAndExpenses({ shopIds: ids, dateFrom: range.dateFrom, dateTo: range.dateTo }, signal, onProgress),
    [ids, range.dateFrom, range.dateTo],
  )

  const { data, loading, error, loaded, total, reload } = useBulkLoad(
    load,
    [idsKey, range.dateFrom, range.dateTo],
    { skip: ids.length === 0, cacheKey: ck('unit-economics', { ids: idsKey, from: range.dateFrom, to: range.dateTo }) },
  )

  const items = useMemo(() => realizedItems(data?.sales?.items || []), [data])
  const payments = useMemo(() => data?.expenses?.payments || [], [data])
  const opex = useMemo(() => groupExpenses(payments).outcome, [payments])

  /* ── Tovarlar bo'yicha yig'ish ───────────────────────────────── */

  const rows = useMemo(() => {
    const map = new Map()
    let revenueTotal = 0

    for (const it of items) {
      const key = `${it.productId ?? '?'}|${it.skuTitle ?? ''}`
      if (!map.has(key)) {
        map.set(key, {
          key,
          title: it.productTitle || it.skuTitle,
          subtitle: [it.skuCharTitle, it.skuCharValue].filter(Boolean).join(': ') || it.skuTitle,
          article: it.sellerSkuCode || it.barcode,
          image: it.productImage?.photo?.[240]?.high || it.productImage?.url,
          qty: 0,
          revenue: 0,
          returnsQty: 0,
          returnsSum: 0,
          cost: 0,
          commission: 0,
          logistics: 0,
          sellerProfit: 0,
        })
      }

      const row = map.get(key)
      const qty = Number(it.amount) || 0
      const price = itemRevenue(it)
      const ret = Number(it.amountReturns) || 0

      row.qty += qty
      row.revenue += price
      row.returnsQty += ret
      row.returnsSum += qty > 0 ? (price / qty) * ret : 0
      row.commission += Number(it.commission) || 0
      row.logistics += Number(it.logisticDeliveryFee) || 0
      row.sellerProfit += Number(it.sellerProfit) || 0

      row.cost += itemCost(it, costs)

      revenueTotal += price
    }

    const list = [...map.values()]

    for (const row of list) {
      const netRevenue = row.revenue - row.returnsSum
      // Umumiy xarajat tushumga proporsional taqsimlanadi
      const share = allocate && revenueTotal > 0 ? (row.revenue / revenueTotal) * opex : 0
      const profit = netRevenue - row.cost - row.commission - row.logistics - share

      row.netRevenue = netRevenue
      row.allocated = share
      row.profit = profit
      row.netQty = row.qty - row.returnsQty
      row.unitProfit = row.netQty > 0 ? profit / row.netQty : null
      row.unitRevenue = row.netQty > 0 ? netRevenue / row.netQty : null
      row.margin = netRevenue > 0 ? (profit / netRevenue) * 100 : null
      row.markup = row.cost > 0 ? (profit / row.cost) * 100 : null
      row.commissionRate = row.revenue > 0 ? (row.commission / row.revenue) * 100 : null
    }

    return list.sort((a, b) => b.profit - a.profit)
  }, [items, costs, allocate, opex])

  const pageRows = useMemo(() => rows.slice(page * size, (page + 1) * size), [rows, page, size])

  const totals = useMemo(() => {
    const acc = rows.reduce(
      (a, r) => ({
        qty: a.qty + r.netQty,
        revenue: a.revenue + r.netRevenue,
        cost: a.cost + r.cost,
        commission: a.commission + r.commission,
        logistics: a.logistics + r.logistics,
        allocated: a.allocated + r.allocated,
        profit: a.profit + r.profit,
      }),
      { qty: 0, revenue: 0, cost: 0, commission: 0, logistics: 0, allocated: 0, profit: 0 },
    )
    return {
      ...acc,
      margin: acc.revenue > 0 ? (acc.profit / acc.revenue) * 100 : null,
      unitProfit: acc.qty > 0 ? acc.profit / acc.qty : 0,
      avgCheck: acc.qty > 0 ? acc.revenue / acc.qty : 0,
    }
  }, [rows])

  const handleExport = () => {
    exportCsv(
      rows,
      [
        { key: 'title', header: t('products.product') },
        { key: 'article', header: t('common.article') },
        { key: 'netQty', header: t('unit.qty'), value: (r) => csvNum(r.netQty) },
        { key: 'netRevenue', header: t('unit.revenue'), value: (r) => csvNum(Math.round(r.netRevenue)) },
        { key: 'cost', header: t('unit.cost'), value: (r) => csvNum(Math.round(r.cost)) },
        { key: 'commission', header: t('unit.commission'), value: (r) => csvNum(Math.round(r.commission)) },
        { key: 'logistics', header: t('unit.logistics'), value: (r) => csvNum(Math.round(r.logistics)) },
        { key: 'allocated', header: t('unit.allocated'), value: (r) => csvNum(Math.round(r.allocated)) },
        { key: 'profit', header: t('unit.profit'), value: (r) => csvNum(Math.round(r.profit)) },
        {
          key: 'unitProfit',
          header: t('unit.unitProfit'),
          value: (r) => (r.unitProfit === null ? '' : csvNum(Math.round(r.unitProfit))),
        },
        {
          key: 'margin',
          header: t('unit.margin'),
          value: (r) => (r.margin === null ? '' : csvNum(r.margin.toFixed(1))),
        },
      ],
      `yunit-iqtisod-${new Date().toISOString().slice(0, 10)}.csv`,
    )
  }

  const columns = useMemo(
    () => [
      {
        key: 'product',
        header: t('products.product'),
        nowrap: false,
        width: '26%',
        render: (r) => <ProductCell image={r.image} title={r.title} subtitle={r.subtitle} size={34} />,
      },
      {
        key: 'netQty',
        header: t('unit.qty'),
        align: 'right',
        render: (r) => <span className="tabular text-[13px]">{num(r.netQty, lang)}</span>,
      },
      {
        key: 'unitRevenue',
        header: t('unit.unitRevenue'),
        align: 'right',
        render: (r) => (
          <span className="tabular text-[13px]">
            {r.unitRevenue === null ? '—' : money(Math.round(r.unitRevenue), lang, { currency: false })}
          </span>
        ),
      },
      {
        key: 'cost',
        header: t('unit.cost'),
        align: 'right',
        render: (r) => (
          <span className="text-muted tabular text-[13px]">{money(Math.round(r.cost), lang, { currency: false })}</span>
        ),
      },
      {
        key: 'commission',
        header: t('unit.commission'),
        align: 'right',
        render: (r) => (
          <span className="text-muted tabular text-[13px]">
            {money(Math.round(r.commission), lang, { currency: false })}
            {r.commissionRate !== null && (
              <span className="text-faint ml-1 text-[11.5px]">{r.commissionRate.toFixed(1)}%</span>
            )}
          </span>
        ),
      },
      {
        key: 'logistics',
        header: t('unit.logistics'),
        align: 'right',
        render: (r) => (
          <span className="text-muted tabular text-[13px]">
            {money(Math.round(r.logistics), lang, { currency: false })}
          </span>
        ),
      },
      ...(allocate
        ? [
            {
              key: 'allocated',
              header: t('unit.allocated'),
              align: 'right',
              render: (r) => (
                <span className="text-muted tabular text-[13px]">
                  {money(Math.round(r.allocated), lang, { currency: false })}
                </span>
              ),
            },
          ]
        : []),
      {
        key: 'unitProfit',
        header: t('unit.unitProfit'),
        align: 'right',
        render: (r) => (
          <span
            className={cx(
              'tabular text-[13.5px] font-semibold',
              (r.unitProfit ?? 0) < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400',
            )}
          >
            {r.unitProfit === null ? '—' : money(Math.round(r.unitProfit), lang, { currency: false })}
          </span>
        ),
      },
      {
        key: 'profit',
        header: t('unit.profit'),
        align: 'right',
        render: (r) => (
          <span className={cx('tabular text-[13.5px] font-medium', r.profit < 0 && 'text-red-600 dark:text-red-400')}>
            {money(Math.round(r.profit), lang, { currency: false })}
          </span>
        ),
      },
      {
        key: 'margin',
        header: t('unit.margin'),
        align: 'right',
        render: (r) =>
          r.margin === null ? (
            <span className="text-faint">—</span>
          ) : (
            <span
              className={cx(
                'tabular text-[13px] font-medium',
                r.margin < 0
                  ? 'text-red-600 dark:text-red-400'
                  : r.margin < 10
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400',
              )}
            >
              {r.margin.toFixed(1)}%
            </span>
          ),
      },
    ],
    [t, lang, allocate],
  )

  if (ids.length === 0) {
    return (
      <>
        <PageHeader title={t('unit.title')} subtitle={t('unit.subtitle')} />
        <Card>
          <EmptyState icon={Store} title={t('errors.noShopSelected')} hint={t('errors.shopRequired')} />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader title={t('unit.title')} subtitle={t('unit.subtitle')}>
        <Button variant="secondary" icon={Download} onClick={handleExport} disabled={rows.length === 0}>
          {t('common.exportCsv')}
        </Button>
      </PageHeader>

      <DevSource
        className="mb-4"
        compact
        sources={[
          {
            path: '/v1/finance/orders',
            params: { shopIds: ids, dateFrom: range.dateFrom, dateTo: range.dateTo },
            count: items.length,
            note: 'sellPrice · purchasePrice · commission · logisticDeliveryFee',
          },
          {
            path: '/v1/finance/expenses',
            count: payments.length,
            note: 'OUTCOME — taqsimlanadigan operatsion xarajatlar',
          },
        ]}
      />

      <FilterBar
        onReset={() => {
          setRange(DEFAULT_RANGE)
          setAllocate(false)
          setPage(0)
        }}
      >
        <DateRangeFilter value={range} onChange={setRange} />
        <Switch checked={allocate} onChange={setAllocate} label={t('unit.allocateToggle')} />
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

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('unit.totalProfit')}
          value={money(Math.round(totals.profit), lang)}
          hint={totals.margin !== null ? percent(totals.margin, lang) : undefined}
          icon={PiggyBank}
          tone={totals.profit >= 0 ? 'success' : 'danger'}
          loading={loading}
        />
        <StatCard
          label={t('unit.unitProfit')}
          value={money(Math.round(totals.unitProfit), lang)}
          hint={t('unit.unitProfitHint')}
          icon={Calculator}
          tone={totals.unitProfit >= 0 ? 'success' : 'danger'}
          loading={loading}
        />
        <StatCard
          label={t('unit.avgCheck')}
          value={money(Math.round(totals.avgCheck), lang)}
          hint={t('unit.qtyN', { n: num(totals.qty, lang) })}
          icon={Wallet}
          tone="brand"
          loading={loading}
        />
        <StatCard
          label={t('unit.commission')}
          value={money(Math.round(totals.commission + totals.logistics), lang)}
          hint={t('unit.feesHint')}
          icon={Percent}
          tone="warning"
          loading={loading}
        />
      </div>

      <div className="mb-3">
        <PeriodLabel dateFrom={range.dateFrom} dateTo={range.dateTo} count={rows.length} />
      </div>

      <DataTable
        columns={columns}
        rows={pageRows}
        rowKey={(r) => r.key}
        loading={loading && pageRows.length === 0}
        emptyIcon={Calculator}
        emptyTitle={t('unit.empty')}
        emptyHint={t('unit.emptyHint')}
        numbered
        indexOffset={page * size}
      />

      <Pagination page={page} size={size} total={rows.length} onPage={setPage} onSize={setSize} sizes={PAGE_SIZES} />

      <Card className="mt-4">
        <CardHeader title={t('unit.formulaTitle')} />
        <p className="text-muted text-[13px]">{t('unit.formulaBody')}</p>
        {allocate && <p className="text-faint mt-2 text-[12px]">{t('unit.allocateNote')}</p>}
      </Card>
    </>
  )
}
