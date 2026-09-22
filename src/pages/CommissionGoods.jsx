import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PackageCheck, Store, Download, PackagePlus, PackageMinus, Boxes, Clock } from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import { useBulkLoad } from '../hooks/useBulkLoad'
import { cacheKey as ck } from '../api/cache'
import { useApiMessage } from '../hooks/useApi'
import { realizedItems } from '../api/financeItems'
import { fetchAllFinanceOrders, fetchAllInvoices, fetchAllStocks } from '../api/bulk'
import { groupBySku } from '../utils/skuMatch'
import { PAGE_SIZES } from '../api/constants'
import { money, num, cx, toDate, itemRevenue } from '../utils/format'
import { exportCsv, csvNum } from '../utils/csv'
import {
  PageHeader,
  Card,
  CardHeader,
  StatCard,
  DataTable,
  Pagination,
  Button,
  SearchInput,
  Field,
  FieldGrid,
  EmptyState,
  ErrorState,
  Spinner,
} from '../components/ui'
import { ProductCell, FilterBar, DateRangeFilter } from '../components/common'
import { DevSource } from '../components/DevSource'
import { PeriodLabel } from '../components/PeriodLabel'
import { useDebounced } from '../hooks/misc'

/**
 * Realizatsiyadagi tovarlar (Товары на реализации).
 *
 * Komissiya savdosining tovar tomoni: Uzum omboriga nechta topshirilgan,
 * nechtasi sotilgan, nechtasi qaytgan va hozir komissionerda nechta qolgan.
 *
 *   Topshirilgan  `/v1/invoice`         — quantityAccepted
 *   Sotilgan      `/v1/finance/orders`  — amount, sellPrice
 *   Qaytarilgan   `/v1/finance/orders`  — amountReturns
 *   Komissionerda `/v3/fbs/sku/stocks`  — amount
 *
 * «O'rtacha sotuv muddati» — qoldiqning kunlik sotuv tezligiga nisbati,
 * ya'ni shu qoldiq necha kunda sotiladi.
 */

// Komissiya qoldig'i butun tarix bo'yicha ma'noli — standart «Barchasi»
const DEFAULT_RANGE = { dateFrom: undefined, dateTo: undefined }

const init = () => ({
  handedOver: 0,
  sold: 0,
  soldSum: 0,
  returned: 0,
  returnedSum: 0,
  stock: 0,
  purchaseSum: 0,
  purchaseQty: 0,
  hasStock: false,
  hasHandover: false,
})

const meta = (o) => ({
  title: o.productTitle || o.skuTitle || '—',
  subtitle: o.skuTitle && o.productTitle ? o.skuTitle : null,
  barcode: o.barcode ?? o.skuBarcode ?? null,
  article: o.sellerSkuCode ?? o.sellerItemCode ?? null,
  image: o.productImage?.photo?.[240]?.high || o.productImage?.url || null,
})

export default function CommissionGoods() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const { shopIds, shops } = useAuth()
  const message = useApiMessage()

  const [range, setRange] = useState(DEFAULT_RANGE)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)

  const debounced = useDebounced(search)

  const idsKey = shopIds.join(',')
  const ids = useMemo(() => (idsKey ? idsKey.split(',').map(Number) : []), [idsKey])

  const load = useCallback(
    async (signal, onProgress) => {
      // Uch manba bir-biriga bog'liq emas — birdan so'raymiz
      const [sales, invoices, stocks] = await Promise.all([
        fetchAllFinanceOrders({ shopIds: ids, dateFrom: range.dateFrom, dateTo: range.dateTo }, signal, onProgress),
        fetchAllInvoices(signal),
        fetchAllStocks(signal),
      ])
      return { sales, invoices, stocks }
    },
    [ids, range.dateFrom, range.dateTo],
  )

  const { data, loading, error, loaded, total, reload } = useBulkLoad(
    load,
    [idsKey, range.dateFrom, range.dateTo],
    { skip: ids.length === 0, cacheKey: ck('commission-goods', { ids: idsKey, from: range.dateFrom, to: range.dateTo }) },
  )

  const items = useMemo(() => realizedItems(data?.sales?.items || []), [data])
  const stocks = useMemo(() => data?.stocks?.stocks || [], [data])

  /** Yuk xatlari sana bo'yicha mahalliy filtrlanadi — endpoint sana olmaydi */
  const invoiceRows = useMemo(() => {
    const list = data?.invoices?.invoices || []
    const rows = []
    for (const inv of list) {
      const at = toDate(inv.dateAccepted ?? inv.dateCreated)?.getTime()
      if (range.dateFrom && (!at || at < range.dateFrom)) continue
      if (range.dateTo && (!at || at > range.dateTo)) continue
      for (const p of inv.productForInvoiceDto || []) rows.push(p)
    }
    return rows
  }, [data, range.dateFrom, range.dateTo])

  /** Davr uzunligi — o'rtacha sotuv muddatini hisoblash uchun */
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
          items: invoiceRows,
          apply: (g, p) => {
            g.handedOver += Number(p.quantityAccepted) || 0
            const price = Number(p.purchasePrice) || 0
            const qty = Number(p.quantityAccepted) || 0
            if (price > 0 && qty > 0) {
              g.purchaseSum += price
              g.purchaseQty += qty
            }
            g.hasHandover = true
          },
        },
        {
          items,
          apply: (g, it) => {
            const qty = Number(it.amount) || 0
            const sum = itemRevenue(it)
            const ret = Number(it.amountReturns) || 0
            g.sold += qty
            g.soldSum += sum
            g.returned += ret
            g.returnedSum += qty > 0 ? (sum / qty) * ret : 0
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

    return list.map((g) => {
      const netSold = g.sold - g.returned
      const perDay = periodDays > 0 ? netSold / periodDays : 0
      return {
        ...g,
        netSold,
        // Qoldiq shu tezlikda necha kunda sotiladi
        avgSaleDays: perDay > 0 ? g.stock / perDay : null,
        unitPurchase: g.purchaseQty > 0 ? g.purchaseSum / g.purchaseQty : null,
        costSum: g.purchaseQty > 0 ? (g.purchaseSum / g.purchaseQty) * g.stock : null,
      }
    })
  }, [invoiceRows, items, stocks, periodDays])

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
    return [...list].sort((a, b) => b.stock - a.stock || b.soldSum - a.soldSum)
  }, [groups, debounced])

  const pageRows = useMemo(() => rows.slice(page * size, (page + 1) * size), [rows, page, size])

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, g) => ({
          handedOver: acc.handedOver + g.handedOver,
          sold: acc.sold + g.sold,
          soldSum: acc.soldSum + g.soldSum,
          returned: acc.returned + g.returned,
          returnedSum: acc.returnedSum + g.returnedSum,
          stock: acc.stock + g.stock,
          costSum: acc.costSum + (g.costSum || 0),
          daysSum: acc.daysSum + (g.avgSaleDays !== null ? g.avgSaleDays : 0),
          daysCount: acc.daysCount + (g.avgSaleDays !== null ? 1 : 0),
        }),
        { handedOver: 0, sold: 0, soldSum: 0, returned: 0, returnedSum: 0, stock: 0, costSum: 0, daysSum: 0, daysCount: 0 },
      ),
    [rows],
  )

  const avgSaleDays = totals.daysCount > 0 ? totals.daysSum / totals.daysCount : null

  const committent = useMemo(() => {
    if (ids.length === 1) return shops.find((s) => s.id === ids[0])?.name || `#${ids[0]}`
    return `${t('common.allShops')} (${ids.length})`
  }, [ids, shops, t])

  const handleExport = () => {
    exportCsv(
      rows,
      [
        { key: 'title', header: t('products.product') },
        { key: 'article', header: t('common.article') },
        { key: 'barcode', header: t('common.barcode') },
        { key: 'handedOver', header: t('commissionGoods.handedOver'), value: (r) => csvNum(r.handedOver) },
        { key: 'sold', header: t('commissionGoods.sold'), value: (r) => csvNum(r.sold) },
        { key: 'soldSum', header: t('commissionGoods.soldSum'), value: (r) => csvNum(Math.round(r.soldSum)) },
        { key: 'returned', header: t('commissionGoods.returned'), value: (r) => csvNum(r.returned) },
        { key: 'stock', header: t('commissionGoods.stock'), value: (r) => csvNum(r.stock) },
        {
          key: 'avgSaleDays',
          header: t('commissionGoods.avgSaleDays'),
          value: (r) => (r.avgSaleDays === null ? '' : csvNum(Math.round(r.avgSaleDays))),
        },
        {
          key: 'costSum',
          header: t('commissionGoods.costSum'),
          value: (r) => (r.costSum === null ? '' : csvNum(Math.round(r.costSum))),
        },
      ],
      `realizatsiyadagi-tovarlar-${new Date().toISOString().slice(0, 10)}.csv`,
    )
  }

  const columns = useMemo(
    () => [
      {
        key: 'product',
        header: t('products.product'),
        nowrap: false,
        width: '28%',
        render: (g) => (
          <ProductCell image={g.image} title={g.title} subtitle={g.subtitle || g.article || g.barcode} size={34} />
        ),
      },
      {
        key: 'handedOver',
        header: t('commissionGoods.handedOver'),
        align: 'right',
        render: (g) =>
          g.hasHandover ? (
            <span className="tabular text-[13.5px] font-medium">{num(g.handedOver, lang)}</span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      {
        key: 'sold',
        header: t('commissionGoods.sold'),
        align: 'right',
        render: (g) => (
          <span className="tabular text-[13px]">
            {num(g.sold, lang)}
            {g.soldSum > 0 && (
              <span className="text-faint ml-1.5 text-[11.5px]">
                {money(Math.round(g.soldSum), lang, { compact: true, currency: false })}
              </span>
            )}
          </span>
        ),
      },
      {
        key: 'returned',
        header: t('commissionGoods.returned'),
        align: 'right',
        render: (g) =>
          g.returned > 0 ? (
            <span className="tabular text-[13px] text-red-600 dark:text-red-400">{num(g.returned, lang)}</span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      {
        key: 'stock',
        header: t('commissionGoods.stock'),
        align: 'right',
        render: (g) =>
          g.hasStock ? (
            <span className={cx('tabular text-[13.5px] font-semibold', g.stock === 0 && 'text-amber-600 dark:text-amber-400')}>
              {num(g.stock, lang)}
            </span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      {
        key: 'avgSaleDays',
        header: t('commissionGoods.avgSaleDays'),
        align: 'right',
        render: (g) =>
          g.avgSaleDays === null ? (
            <span className="text-faint">—</span>
          ) : (
            <span className="text-muted tabular text-[13px]">
              {t('problems.daysN', { n: Math.round(g.avgSaleDays) })}
            </span>
          ),
      },
      {
        key: 'unitPurchase',
        header: t('turnover.unitPurchase'),
        align: 'right',
        render: (g) => (
          <span className="text-muted tabular text-[13px]">
            {g.unitPurchase === null ? '—' : money(Math.round(g.unitPurchase), lang, { currency: false })}
          </span>
        ),
      },
      {
        key: 'costSum',
        header: t('commissionGoods.costSum'),
        align: 'right',
        render: (g) => (
          <span className="tabular text-[13px]">
            {g.costSum === null ? '—' : money(Math.round(g.costSum), lang, { currency: false })}
          </span>
        ),
      },
    ],
    [t, lang],
  )

  if (ids.length === 0) {
    return (
      <>
        <PageHeader title={t('commissionGoods.title')} subtitle={t('commissionGoods.subtitle')} />
        <Card>
          <EmptyState icon={Store} title={t('errors.noShopSelected')} hint={t('errors.shopRequired')} />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader title={t('commissionGoods.title')} subtitle={t('commissionGoods.subtitle')}>
        <Button variant="secondary" icon={Download} onClick={handleExport} disabled={rows.length === 0}>
          {t('common.exportCsv')}
        </Button>
      </PageHeader>

      <DevSource
        className="mb-4"
        compact
        sources={[
          { path: '/v1/invoice', count: invoiceRows.length, note: t('turnover.sourceReceipts') },
          {
            path: '/v1/finance/orders',
            params: { shopIds: ids, dateFrom: range.dateFrom, dateTo: range.dateTo },
            count: items.length,
            note: t('turnover.sourceSales'),
          },
          { path: '/v3/fbs/sku/stocks', count: stocks.length, note: t('turnover.sourceStocks') },
        ]}
      />

      <FilterBar
        onReset={() => {
          setRange(DEFAULT_RANGE)
          setSearch('')
          setPage(0)
        }}
      >
        <DateRangeFilter value={range} onChange={setRange} />
        <SearchInput
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(0)
          }}
          onClear={() => setSearch('')}
          placeholder={t('common.searchPlaceholder')}
          className="w-56"
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

      <Card className="mb-4">
        <CardHeader
          title={t('commissionGoods.contract')}
          subtitle={t('commissionGoods.contractHint')}
          action={<PeriodLabel dateFrom={range.dateFrom} dateTo={range.dateTo} count={rows.length} />}
        />
        <FieldGrid cols={4}>
          <Field label={t('commission.committent')}>{committent}</Field>
          <Field label={t('commission.commissioner')}>Uzum Market</Field>
          <Field label={t('commissionGoods.positions')}>{num(rows.length, lang)}</Field>
          <Field label={t('commissionGoods.avgSaleDays')}>
            {avgSaleDays === null ? '—' : t('problems.daysN', { n: Math.round(avgSaleDays) })}
          </Field>
        </FieldGrid>
      </Card>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('commissionGoods.handedOver')}
          value={num(totals.handedOver, lang)}
          hint={t('commissionGoods.handedOverHint')}
          icon={PackagePlus}
          tone="brand"
          loading={loading}
        />
        <StatCard
          label={t('commissionGoods.sold')}
          value={num(totals.sold, lang)}
          hint={money(Math.round(totals.soldSum), lang)}
          icon={PackageMinus}
          tone="success"
          loading={loading}
        />
        <StatCard
          label={t('commissionGoods.returned')}
          value={num(totals.returned, lang)}
          hint={money(Math.round(totals.returnedSum), lang)}
          icon={PackageCheck}
          tone={totals.returned > 0 ? 'danger' : 'success'}
          loading={loading}
        />
        <StatCard
          label={t('commissionGoods.stock')}
          value={num(totals.stock, lang)}
          hint={avgSaleDays !== null ? t('commissionGoods.willLast', { n: Math.round(avgSaleDays) }) : undefined}
          icon={Boxes}
          tone="warning"
          loading={loading}
        />
      </div>

      <DataTable
        columns={columns}
        rows={pageRows}
        rowKey={(g) => g.key}
        loading={loading && pageRows.length === 0}
        emptyIcon={Clock}
        emptyTitle={t('commissionGoods.empty')}
        emptyHint={t('commissionGoods.emptyHint')}
        numbered
        indexOffset={page * size}
      />

      <Pagination page={page} size={size} total={rows.length} onPage={setPage} onSize={setSize} sizes={PAGE_SIZES} />

      <Card className="mt-4">
        <p className="text-faint text-[12px]">{t('commissionGoods.note')}</p>
      </Card>
    </>
  )
}
