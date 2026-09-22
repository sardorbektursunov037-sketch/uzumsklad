import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Repeat, Store, Download, PackagePlus, PackageMinus, Boxes, Undo2, TriangleAlert } from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import { useBulkLoad } from '../hooks/useBulkLoad'
import { cacheKey as ck } from '../api/cache'
import { useApiMessage } from '../hooks/useApi'
import { realizedItems } from '../api/financeItems'
import { fetchAllFinanceOrders, fetchAllInvoices, fetchAllStocks } from '../api/bulk'
import { groupBySku } from '../utils/skuMatch'
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
import { PAGE_SIZES } from '../api/constants'
import { useDebounced } from '../hooks/misc'

/**
 * Tovar aylanmasi.
 *
 * Davr ichida har bir SKU bo'yicha kirim va chiqimni bir jadvalda
 * ko'rsatadi — uch xil endpointni SKU bo'yicha birlashtirib:
 *
 *   Kirim       `/v1/invoice`          — yetkazib berish xatlarida QABUL QILINGAN soni
 *   Sotilgan    `/v1/finance/orders`   — davr ichida sotilgan soni
 *   Qaytarilgan `/v1/finance/orders`   — `amountReturns`
 *   Qoldiq      `/v3/fbs/sku/stocks`   — hozirgi FBS qoldig'i
 *
 * Uch manbada yagona SKU kaliti yo'q, shuning uchun moslashtirish
 * `utils/skuMatch.js` orqali shtrix-kod → sotuvchi kodi → nom ketma-ketligida
 * bajariladi. Qoldiq har doim JORIY holat (davrga bog'liq emas) — shuning
 * uchun «Farq» ustuni faqat butun tarix tanlanganda ma'noga ega.
 */

// Aylanma butun tarix bo'yicha ko'rilgani mantiqiy — standart «Barchasi»
const DEFAULT_RANGE = { dateFrom: undefined, dateTo: undefined }

/** Bo'sh yig'indi */
const init = () => ({
  received: 0,
  toStock: 0,
  sold: 0,
  returned: 0,
  revenue: 0,
  stock: 0,
  purchaseSum: 0,
  purchaseQty: 0,
  hasStock: false,
  hasReceipt: false,
})

/** Guruh sarlavhasi — qaysi manbadan kelganidan qat'i nazar bir xil shakl */
const meta = (o) => ({
  title: o.productTitle || o.skuTitle || '—',
  subtitle: o.skuTitle && o.productTitle ? o.skuTitle : null,
  barcode: o.barcode ?? o.skuBarcode ?? null,
  article: o.sellerSkuCode ?? o.sellerItemCode ?? null,
  image: o.productImage?.photo?.[240]?.high || o.productImage?.url || o.image?.url || null,
})

export default function Turnover() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const { shopIds } = useAuth()
  const message = useApiMessage()

  const [range, setRange] = useState(DEFAULT_RANGE)
  const [search, setSearch] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
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
    { skip: ids.length === 0, cacheKey: ck('turnover', { ids: idsKey, from: range.dateFrom, to: range.dateTo }) },
  )

  const items = useMemo(() => realizedItems(data?.sales?.items || []), [data])
  const stocks = useMemo(() => data?.stocks?.stocks || [], [data])

  /**
   * Yuk xatlari sana bo'yicha filtrlanadi mahalliy: `/v1/invoice` endpointi
   * sana parametrini qabul qilmaydi, sotuvlar esa davr bo'yicha keladi —
   * ikkalasi bir davrni qamrab olishi kerak.
   */
  const invoiceRows = useMemo(() => {
    const list = data?.invoices?.invoices || []
    const from = range.dateFrom
    const to = range.dateTo

    const rows = []
    for (const inv of list) {
      const at = toDate(inv.dateAccepted ?? inv.dateCreated)?.getTime()
      if (from && (!at || at < from)) continue
      if (to && (!at || at > to)) continue
      for (const p of inv.productForInvoiceDto || []) rows.push(p)
    }
    return rows
  }, [data, range.dateFrom, range.dateTo])

  /** Davr uzunligi — kunlik o'rtacha sotuvni hisoblash uchun */
  const periodDays = useMemo(() => {
    if (range.dateFrom) {
      const to = range.dateTo ?? Date.now()
      return Math.max(1, Math.round((to - range.dateFrom) / 864e5))
    }
    // «Barchasi» — eng eski sotuv sanasidan bugungacha
    let oldest = null
    for (const it of items) {
      const d = toDate(it.date ?? it.dateIssued)?.getTime()
      if (d && (oldest === null || d < oldest)) oldest = d
    }
    return oldest ? Math.max(1, Math.round((Date.now() - oldest) / 864e5)) : 1
  }, [range.dateFrom, range.dateTo, items])

  /* ── Uch manbani SKU bo'yicha birlashtirish ──────────────────── */

  const groups = useMemo(() => {
    const list = groupBySku(
      [
        {
          items: invoiceRows,
          apply: (g, p) => {
            g.received += Number(p.quantityAccepted) || 0
            g.toStock += Number(p.quantityToStock) || 0
            const price = Number(p.purchasePrice) || 0
            const qty = Number(p.quantityAccepted) || 0
            if (price > 0 && qty > 0) {
              g.purchaseSum += price
              g.purchaseQty += qty
            }
            g.hasReceipt = true
          },
        },
        {
          items,
          apply: (g, it) => {
            g.sold += Number(it.amount) || 0
            g.returned += Number(it.amountReturns) || 0
            g.revenue += itemRevenue(it)
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
        perDay,
        // Qancha kunga yetadi — sotuv tezligi nolga teng bo'lsa hisoblanmaydi
        daysLeft: perDay > 0 ? g.stock / perDay : null,
        // Nazariy farq: kirim − sotilgan − qaytarilgan − joriy qoldiq.
        // Qaytarilgan AYRILADI (qo'shilmaydi!) — qaytgan tovar yo'qolmagan,
        // u hisobga olingan. MoySklad'ning "потеряшки" hisobi bilan solishtirib
        // tekshirildi: Uzumga berilgan − Sotilgan − Qaytarilganlar = Yo'qolgan.
        diff: g.hasReceipt ? g.received - g.sold - g.returned - g.stock : null,
        unitPurchase: g.purchaseQty > 0 ? g.purchaseSum / g.purchaseQty : null,
      }
    })
  }, [invoiceRows, items, stocks, periodDays])

  /* ── Filtr va saralash ───────────────────────────────────────── */

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
    if (lowOnly) list = list.filter((g) => g.daysLeft !== null && g.daysLeft < 14)
    return [...list].sort((a, b) => b.netSold - a.netSold || b.stock - a.stock)
  }, [groups, debounced, lowOnly])

  const pageRows = useMemo(() => rows.slice(page * size, (page + 1) * size), [rows, page, size])

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, g) => ({
          received: acc.received + g.received,
          sold: acc.sold + g.sold,
          returned: acc.returned + g.returned,
          stock: acc.stock + g.stock,
          revenue: acc.revenue + g.revenue,
          low: acc.low + (g.daysLeft !== null && g.daysLeft < 14 ? 1 : 0),
        }),
        { received: 0, sold: 0, returned: 0, stock: 0, revenue: 0, low: 0 },
      ),
    [rows],
  )

  /* ── Eksport ─────────────────────────────────────────────────── */

  const handleExport = () => {
    exportCsv(
      rows,
      [
        { key: 'title', header: t('products.product') },
        { key: 'subtitle', header: t('common.sku') },
        { key: 'barcode', header: t('common.barcode') },
        { key: 'article', header: t('common.article') },
        { key: 'received', header: t('turnover.received'), value: (r) => csvNum(r.received) },
        { key: 'sold', header: t('turnover.sold'), value: (r) => csvNum(r.sold) },
        { key: 'returned', header: t('turnover.returned'), value: (r) => csvNum(r.returned) },
        { key: 'netSold', header: t('turnover.netSold'), value: (r) => csvNum(r.netSold) },
        { key: 'stock', header: t('turnover.stock'), value: (r) => csvNum(r.stock) },
        { key: 'perDay', header: t('turnover.perDay'), value: (r) => csvNum(r.perDay.toFixed(2)) },
        {
          key: 'daysLeft',
          header: t('turnover.daysLeft'),
          value: (r) => (r.daysLeft === null ? '' : csvNum(Math.round(r.daysLeft))),
        },
        { key: 'revenue', header: t('turnover.revenue'), value: (r) => csvNum(Math.round(r.revenue)) },
        { key: 'diff', header: t('turnover.diff'), value: (r) => (r.diff === null ? '' : csvNum(r.diff)) },
      ],
      `tovar-aylanmasi-${new Date().toISOString().slice(0, 10)}.csv`,
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
        key: 'received',
        header: t('turnover.received'),
        align: 'right',
        render: (g) =>
          g.hasReceipt ? (
            <span className="tabular text-[13px] text-emerald-600 dark:text-emerald-400">+{num(g.received, lang)}</span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      {
        key: 'sold',
        header: t('turnover.sold'),
        align: 'right',
        render: (g) => <span className="tabular text-[13px]">−{num(g.sold, lang)}</span>,
      },
      {
        key: 'returned',
        header: t('turnover.returned'),
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
        header: t('turnover.stock'),
        align: 'right',
        render: (g) =>
          g.hasStock ? (
            <span className={cx('tabular text-[13.5px] font-medium', g.stock === 0 && 'text-amber-600 dark:text-amber-400')}>
              {num(g.stock, lang)}
            </span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      {
        key: 'perDay',
        header: t('turnover.perDay'),
        align: 'right',
        render: (g) => (
          <span className="text-muted tabular text-[13px]">{g.perDay > 0 ? g.perDay.toFixed(2) : '—'}</span>
        ),
      },
      {
        key: 'daysLeft',
        header: t('turnover.daysLeft'),
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
        key: 'revenue',
        header: t('turnover.revenue'),
        align: 'right',
        render: (g) => (
          <span className="tabular text-[13.5px] font-medium">{money(Math.round(g.revenue), lang, { currency: false })}</span>
        ),
      },
      {
        key: 'diff',
        header: t('turnover.diff'),
        align: 'right',
        render: (g) =>
          g.diff === null ? (
            <span className="text-faint">—</span>
          ) : (
            <span
              className={cx(
                'tabular text-[13px]',
                Math.abs(g.diff) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-faint',
              )}
            >
              {g.diff > 0 ? '+' : ''}
              {num(g.diff, lang)}
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
    ],
    [t, lang],
  )

  if (ids.length === 0) {
    return (
      <>
        <PageHeader title={t('turnover.title')} subtitle={t('turnover.subtitle')} />
        <Card>
          <EmptyState icon={Store} title={t('errors.noShopSelected')} hint={t('errors.shopRequired')} />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader title={t('turnover.title')} subtitle={t('turnover.subtitle')}>
        <Button variant="secondary" icon={Download} onClick={handleExport} disabled={rows.length === 0}>
          {t('common.exportCsv')}
        </Button>
      </PageHeader>

      <DevSource
        className="mb-4"
        compact
        sources={[
          {
            path: '/v1/invoice',
            params: { size: 50 },
            count: invoiceRows.length,
            note: t('turnover.sourceReceipts'),
          },
          {
            path: '/v1/finance/orders',
            params: { shopIds: ids, dateFrom: range.dateFrom, dateTo: range.dateTo, size: 100 },
            count: items.length,
            note: t('turnover.sourceSales'),
          },
          {
            path: '/v3/fbs/sku/stocks',
            params: { size: 100 },
            count: stocks.length,
            note: t('turnover.sourceStocks'),
          },
        ]}
      />

      <FilterBar
        onReset={() => {
          setRange(DEFAULT_RANGE)
          setSearch('')
          setLowOnly(false)
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
        <Switch
          checked={lowOnly}
          onChange={(v) => {
            setLowOnly(v)
            setPage(0)
          }}
          label={t('turnover.lowOnly')}
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
          label={t('turnover.received')}
          value={num(totals.received, lang)}
          hint={t('turnover.receivedHint')}
          icon={PackagePlus}
          tone="success"
          loading={loading}
        />
        <StatCard
          label={t('turnover.sold')}
          value={num(totals.sold, lang)}
          hint={money(Math.round(totals.revenue), lang)}
          icon={PackageMinus}
          tone="brand"
          loading={loading}
        />
        <StatCard
          label={t('turnover.returned')}
          value={num(totals.returned, lang)}
          hint={t('turnover.returnedHint')}
          icon={Undo2}
          tone="danger"
          loading={loading}
        />
        <StatCard
          label={t('turnover.stock')}
          value={num(totals.stock, lang)}
          hint={t('turnover.lowCount', { n: totals.low })}
          icon={Boxes}
          tone={totals.low > 0 ? 'warning' : 'success'}
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
        emptyIcon={Repeat}
        emptyTitle={t('turnover.empty')}
        emptyHint={t('turnover.emptyHint')}
        numbered
        indexOffset={page * size}
      />

      <Pagination page={page} size={size} total={rows.length} onPage={setPage} onSize={setSize} sizes={PAGE_SIZES} />

      <Card className="mt-4">
        <CardHeader title={t('turnover.notesTitle')} />
        <ul className="text-muted space-y-1.5 text-[13px]">
          <li className="flex gap-2">
            <TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-500" aria-hidden />
            {t('turnover.noteStock')}
          </li>
          <li className="flex gap-2">
            <TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-500" aria-hidden />
            {t('turnover.noteMatch')}
          </li>
          <li className="flex gap-2">
            <TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-500" aria-hidden />
            {t('turnover.noteDiff')}
          </li>
        </ul>
        <p className="text-faint mt-3 text-[12px]">{t('turnover.formula')}</p>
      </Card>
    </>
  )
}
