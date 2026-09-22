import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardList, Store, Download, TrendingDown, PackageSearch, CalendarClock } from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import { useBulkLoad } from '../hooks/useBulkLoad'
import { cacheKey as ck } from '../api/cache'
import { useApiMessage } from '../hooks/useApi'
import { realizedItems, itemCost } from '../api/financeItems'
import { useCostOverride } from '../hooks/useCostOverride'
import { fetchAllFinanceOrders, fetchAllStocks } from '../api/bulk'
import { groupBySku } from '../utils/skuMatch'
import { PAGE_SIZES } from '../api/constants'
import { money, num, cx, daysAgo, toDate, itemRevenue } from '../utils/format'
import { exportCsv, csvNum } from '../utils/csv'
import {
  PageHeader,
  Card,
  CardHeader,
  StatCard,
  DataTable,
  Pagination,
  Button,
  Input,
  Switch,
  Badge,
  SearchInput,
  EmptyState,
  ErrorState,
  Spinner,
} from '../components/ui'
import { ProductCell, FilterBar, DateRangeFilter } from '../components/common'
import { DevSource } from '../components/DevSource'
import { PeriodLabel } from '../components/PeriodLabel'
import { useDebounced } from '../hooks/misc'

/**
 * Xaridlarni boshqarish (Управление закупками).
 *
 * Savdo tezligidan kelib chiqib, har bir SKU qancha kunga yetishini va
 * berilgan muddatga qancha tovar kerakligini hisoblaydi:
 *
 *   Kunlik sotuv  = (sotilgan − qaytgan) / davr kunlari
 *   Yetadi        = joriy qoldiq / kunlik sotuv
 *   Kerak bo'ladi = kunlik sotuv × prognoz kunlari − joriy qoldiq
 *
 * Manba: `/v1/finance/orders` (savdo tarixi) va `/v3/fbs/sku/stocks`
 * (joriy qoldiq). Uzum xarid buyurtmasi endpointini bermaydi, shuning
 * uchun natija reja sifatida ko'rsatiladi va CSV ga chiqariladi.
 */

const DEFAULT_RANGE = { dateFrom: daysAgo(30), dateTo: undefined }

/** Prognoz muddati — MoySklad'dagi «Прогноз на N дней» bilan bir xil standart */
const DEFAULT_FORECAST_DAYS = 14

const init = () => ({ sold: 0, returned: 0, revenue: 0, cost: 0, stock: 0, hasStock: false })

const meta = (o) => ({
  title: o.productTitle || o.skuTitle || '—',
  subtitle: o.skuTitle && o.productTitle ? o.skuTitle : null,
  barcode: o.barcode ?? o.skuBarcode ?? null,
  article: o.sellerSkuCode ?? o.sellerItemCode ?? null,
  image: o.productImage?.photo?.[240]?.high || o.productImage?.url || null,
})

export default function PurchasePlanning() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const { shopIds } = useAuth()
  const { costs } = useCostOverride()
  const message = useApiMessage()

  const [range, setRange] = useState(DEFAULT_RANGE)
  const [forecastDays, setForecastDays] = useState(DEFAULT_FORECAST_DAYS)
  const [needOnly, setNeedOnly] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)

  const debounced = useDebounced(search)

  const idsKey = shopIds.join(',')
  const ids = useMemo(() => (idsKey ? idsKey.split(',').map(Number) : []), [idsKey])

  const load = useCallback(
    async (signal, onProgress) => {
      const [sales, stocks] = await Promise.all([
        fetchAllFinanceOrders({ shopIds: ids, dateFrom: range.dateFrom, dateTo: range.dateTo }, signal, onProgress),
        fetchAllStocks(signal),
      ])
      return { sales, stocks }
    },
    [ids, range.dateFrom, range.dateTo],
  )

  const { data, loading, error, loaded, total, reload } = useBulkLoad(
    load,
    [idsKey, range.dateFrom, range.dateTo],
    { skip: ids.length === 0, cacheKey: ck('purchase-planning', { ids: idsKey, from: range.dateFrom, to: range.dateTo }) },
  )

  const items = useMemo(() => realizedItems(data?.sales?.items || []), [data])
  const stocks = useMemo(() => data?.stocks?.stocks || [], [data])

  const periodDays = useMemo(() => {
    if (range.dateFrom) return Math.max(1, Math.round(((range.dateTo ?? Date.now()) - range.dateFrom) / 864e5))
    let oldest = null
    for (const it of items) {
      const d = toDate(it.date ?? it.dateIssued)?.getTime()
      if (d && (oldest === null || d < oldest)) oldest = d
    }
    return oldest ? Math.max(1, Math.round((Date.now() - oldest) / 864e5)) : 1
  }, [range.dateFrom, range.dateTo, items])

  const groups = useMemo(() => {
    const list = groupBySku(
      [
        {
          items,
          apply: (g, it) => {
            const qty = Number(it.amount) || 0
            g.sold += qty
            g.returned += Number(it.amountReturns) || 0
            g.revenue += itemRevenue(it)
            g.cost += itemCost(it, costs)
          },
        },
        {
          items: stocks,
          apply: (g, s) => {
            g.stock += Number(s.amount) || 0
            g.hasStock = true
          },
        },
      ],
      { init, meta },
    )

    const days = Number(forecastDays) || 0

    return list.map((g) => {
      const netSold = g.sold - g.returned
      const perDay = periodDays > 0 ? netSold / periodDays : 0
      const daysLeft = perDay > 0 ? g.stock / perDay : null
      const required = Math.max(0, Math.ceil(perDay * days - g.stock))
      const profit = g.revenue - g.cost
      return {
        ...g,
        netSold,
        perDay,
        daysLeft,
        required,
        profit,
        margin: g.revenue > 0 ? (profit / g.revenue) * 100 : null,
        // Prognoz muddatidan kam qolgan bo'lsa — to'ldirish kerak
        needsRestock: perDay > 0 && (daysLeft === null || daysLeft < days),
      }
    })
  }, [items, stocks, costs, periodDays, forecastDays])

  const rows = useMemo(() => {
    let list = groups
    if (debounced) {
      const q = debounced.toLowerCase()
      list = list.filter(
        (g) =>
          String(g.title).toLowerCase().includes(q) ||
          String(g.subtitle || '').toLowerCase().includes(q) ||
          String(g.barcode || '').includes(q) ||
          String(g.article || '').toLowerCase().includes(q),
      )
    }
    if (needOnly) list = list.filter((g) => g.required > 0)
    return [...list].sort((a, b) => b.required - a.required || b.perDay - a.perDay)
  }, [groups, debounced, needOnly])

  const pageRows = useMemo(() => rows.slice(page * size, (page + 1) * size), [rows, page, size])

  const totals = useMemo(
    () => ({
      positions: rows.length,
      required: rows.reduce((s, g) => s + g.required, 0),
      stock: rows.reduce((s, g) => s + g.stock, 0),
      urgent: rows.filter((g) => g.daysLeft !== null && g.daysLeft < 7).length,
      outOfStock: groups.filter((g) => g.hasStock && g.stock === 0 && g.perDay > 0).length,
    }),
    [rows, groups],
  )

  const handleExport = () => {
    exportCsv(
      rows,
      [
        { key: 'title', header: t('products.product') },
        { key: 'article', header: t('common.article') },
        { key: 'barcode', header: t('common.barcode') },
        { key: 'netSold', header: t('planning.sold'), value: (r) => csvNum(r.netSold) },
        { key: 'revenue', header: t('planning.revenue'), value: (r) => csvNum(Math.round(r.revenue)) },
        { key: 'cost', header: t('planning.cost'), value: (r) => csvNum(Math.round(r.cost)) },
        { key: 'profit', header: t('planning.profit'), value: (r) => csvNum(Math.round(r.profit)) },
        { key: 'perDay', header: t('planning.perDay'), value: (r) => csvNum(r.perDay.toFixed(2)) },
        { key: 'stock', header: t('planning.stock'), value: (r) => csvNum(r.stock) },
        {
          key: 'daysLeft',
          header: t('planning.daysLeft'),
          value: (r) => (r.daysLeft === null ? '' : csvNum(Math.round(r.daysLeft))),
        },
        { key: 'required', header: t('planning.required'), value: (r) => csvNum(r.required) },
      ],
      `xarid-rejasi-${forecastDays}kun-${new Date().toISOString().slice(0, 10)}.csv`,
    )
  }

  const columns = useMemo(
    () => [
      {
        key: 'product',
        header: t('products.product'),
        nowrap: false,
        width: '26%',
        render: (g) => (
          <ProductCell image={g.image} title={g.title} subtitle={g.subtitle || g.article || g.barcode} size={34} />
        ),
      },
      {
        key: 'netSold',
        header: t('planning.sold'),
        align: 'right',
        render: (g) => <span className="tabular text-[13px]">{num(g.netSold, lang)}</span>,
      },
      {
        key: 'revenue',
        header: t('planning.revenue'),
        align: 'right',
        render: (g) => (
          <span className="text-muted tabular text-[13px]">{money(Math.round(g.revenue), lang, { currency: false })}</span>
        ),
      },
      {
        key: 'profit',
        header: t('planning.profit'),
        align: 'right',
        render: (g) => (
          <span className="tabular text-[13px]">
            {money(Math.round(g.profit), lang, { currency: false })}
            {g.margin !== null && <span className="text-faint ml-1 text-[11.5px]">{g.margin.toFixed(0)}%</span>}
          </span>
        ),
      },
      {
        key: 'perDay',
        header: t('planning.perDay'),
        align: 'right',
        render: (g) => (
          <span className="text-app tabular text-[13px] font-medium">{g.perDay > 0 ? g.perDay.toFixed(2) : '—'}</span>
        ),
      },
      {
        key: 'stock',
        header: t('planning.stock'),
        align: 'right',
        render: (g) =>
          g.hasStock ? (
            <span className={cx('tabular text-[13px]', g.stock === 0 && 'font-medium text-red-600 dark:text-red-400')}>
              {num(g.stock, lang)}
            </span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      {
        key: 'daysLeft',
        header: t('planning.daysLeft'),
        align: 'right',
        render: (g) => {
          if (g.daysLeft === null) return <span className="text-faint">—</span>
          const days = Math.round(g.daysLeft)
          return (
            <Badge tone={days < 7 ? 'danger' : days < 14 ? 'warning' : 'success'} size="sm">
              {t('problems.daysN', { n: days })}
            </Badge>
          )
        },
      },
      {
        key: 'required',
        header: t('planning.required'),
        align: 'right',
        render: (g) =>
          g.required > 0 ? (
            <span className="tabular text-[14px] font-semibold text-amber-600 dark:text-amber-400">
              {num(g.required, lang)}
            </span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
    ],
    [t, lang],
  )

  if (ids.length === 0) {
    return (
      <>
        <PageHeader title={t('planning.title')} subtitle={t('planning.subtitle')} />
        <Card>
          <EmptyState icon={Store} title={t('errors.noShopSelected')} hint={t('errors.shopRequired')} />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader title={t('planning.title')} subtitle={t('planning.subtitle')}>
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
            note: t('planning.sourceSales'),
          },
          { path: '/v3/fbs/sku/stocks', count: stocks.length, note: t('planning.sourceStocks') },
        ]}
      />

      <FilterBar
        onReset={() => {
          setRange(DEFAULT_RANGE)
          setForecastDays(DEFAULT_FORECAST_DAYS)
          setNeedOnly(true)
          setSearch('')
          setPage(0)
        }}
      >
        <DateRangeFilter value={range} onChange={setRange} />
        <Input
          label={t('planning.forecastDays')}
          type="number"
          min={1}
          max={365}
          value={forecastDays}
          onChange={(e) => {
            setForecastDays(e.target.value)
            setPage(0)
          }}
          className="w-24"
        />
        <SearchInput
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(0)
          }}
          onClear={() => setSearch('')}
          placeholder={t('common.searchPlaceholder')}
          className="w-52"
        />
        <Switch
          checked={needOnly}
          onChange={(v) => {
            setNeedOnly(v)
            setPage(0)
          }}
          label={t('planning.needOnly')}
        />
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
          label={t('planning.positions')}
          value={num(totals.positions, lang)}
          hint={t('planning.positionsHint', { n: forecastDays })}
          icon={ClipboardList}
          tone="brand"
          loading={loading}
        />
        <StatCard
          label={t('planning.required')}
          value={num(totals.required, lang)}
          hint={t('planning.requiredHint', { n: forecastDays })}
          icon={PackageSearch}
          tone={totals.required > 0 ? 'warning' : 'success'}
          loading={loading}
        />
        <StatCard
          label={t('planning.urgent')}
          value={num(totals.urgent, lang)}
          hint={t('planning.urgentHint')}
          icon={CalendarClock}
          tone={totals.urgent > 0 ? 'danger' : 'success'}
          loading={loading}
        />
        <StatCard
          label={t('planning.outOfStock')}
          value={num(totals.outOfStock, lang)}
          hint={t('planning.outOfStockHint')}
          icon={TrendingDown}
          tone={totals.outOfStock > 0 ? 'danger' : 'success'}
          loading={loading}
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <PeriodLabel dateFrom={range.dateFrom} dateTo={range.dateTo} count={rows.length} />
        <span className="text-faint text-[12px]">{t('turnover.periodDays', { days: periodDays })}</span>
      </div>

      <DataTable
        columns={columns}
        rows={pageRows}
        rowKey={(g) => g.key}
        loading={loading && pageRows.length === 0}
        emptyIcon={ClipboardList}
        emptyTitle={t('planning.empty')}
        emptyHint={t('planning.emptyHint')}
        numbered
        indexOffset={page * size}
      />

      <Pagination page={page} size={size} total={rows.length} onPage={setPage} onSize={setSize} sizes={PAGE_SIZES} />

      <Card className="mt-4">
        <CardHeader title={t('planning.formulaTitle')} />
        <p className="text-muted text-[13px]">{t('planning.formulaBody', { n: forecastDays })}</p>
      </Card>
    </>
  )
}
