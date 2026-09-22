import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FileSpreadsheet,
  Store,
  Wallet,
  Percent,
  Truck,
  Undo2,
  Banknote,
  Hourglass,
  Download,
  Printer,
} from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import { useBulkLoad } from '../hooks/useBulkLoad'
import { cacheKey as ck } from '../api/cache'
import { useApiMessage } from '../hooks/useApi'
import { realizedItems } from '../api/financeItems'
import { fetchAllFinanceOrders } from '../api/bulk'
import { useCostOverride } from '../hooks/useCostOverride'
import {
  money,
  num,
  date as fmtDate,
  itemRevenue,
  monthKey,
  monthLabel,
  daysAgo,
  toDate,
} from '../utils/format'
import { exportCsv, csvNum } from '../utils/csv'
import {
  PageHeader,
  Card,
  CardHeader,
  StatCard,
  DataTable,
  Tabs,
  Button,
  Field,
  FieldGrid,
  EmptyState,
  ErrorState,
  Spinner,
  Badge,
} from '../components/ui'
import { ProductCell, FilterBar, DateRangeFilter } from '../components/common'
import { DevSource } from '../components/DevSource'
import { PeriodLabel } from '../components/PeriodLabel'

/**
 * Komissioner hisoboti.
 *
 * Uzum Market komissiya shartnomasi asosida ishlaydi: tovar sizniki bo'lib
 * qoladi, Uzum uni o'z nomidan sotadi va mukofot (komissiya) ushlab qoladi.
 * Buxgalteriyada bu «qabul qilingan komissioner hisoboti» hujjati bilan
 * rasmiylashtiriladi.
 *
 * Uzum API tayyor hujjat bermaydi, lekin uni tuzish uchun kerak bo'lgan
 * hamma raqam `/v1/finance/orders` javobida bor: sotuv summasi, komissiya,
 * yetkazib berish haqi, qaytarishlar, sotuvchiga hisoblangan foyda va
 * allaqachon to'langan summa. Shu sahifa o'sha pozitsiyalarni davr bo'yicha
 * yig'ib, hisobot shaklida ko'rsatadi.
 */

// Hisobot odatda oy yoki hafta bo'yicha tuziladi — standart 30 kun
const DEFAULT_RANGE = { dateFrom: daysAgo(30), dateTo: undefined }

/** Bo'sh yig'indi */
const zero = () => ({
  docs: new Set(),
  qty: 0,
  sales: 0,
  cost: 0,
  commission: 0,
  logistics: 0,
  payable: 0,
  withdrawn: 0,
  returnsQty: 0,
  returnsSum: 0,
})

function addItem(acc, it) {
  const qty = Number(it.amount) || 0
  const sales = itemRevenue(it)
  const returnsQty = Number(it.amountReturns) || 0

  if (it.orderId !== undefined && it.orderId !== null) acc.docs.add(it.orderId)
  acc.qty += qty
  acc.sales += sales
  acc.commission += Number(it.commission) || 0
  acc.logistics += Number(it.logisticDeliveryFee) || 0
  acc.payable += Number(it.sellerProfit) || 0
  acc.withdrawn += Number(it.withdrawnProfit) || 0
  acc.returnsQty += returnsQty
  // Qaytarish summasi alohida maydonda kelmaydi — birlik narxdan hisoblaymiz
  acc.returnsSum += qty > 0 ? (sales / qty) * returnsQty : 0
}

/** Yig'indidan hosila ko'rsatkichlar */
function finalize(acc, extra = {}) {
  return {
    ...extra,
    docs: acc.docs.size,
    qty: acc.qty,
    sales: acc.sales,
    cost: acc.cost,
    commission: acc.commission,
    logistics: acc.logistics,
    payable: acc.payable,
    withdrawn: acc.withdrawn,
    outstanding: acc.payable - acc.withdrawn,
    returnsQty: acc.returnsQty,
    returnsSum: acc.returnsSum,
    netSales: acc.sales - acc.returnsSum,
    commissionRate: acc.sales > 0 ? (acc.commission / acc.sales) * 100 : null,
  }
}

/** Guruhlangan qatorlardan umumiy yig'indi (hujjatlar soni allaqachon sanoq) */
function sumRows(rows) {
  const acc = zero()
  let docs = 0
  for (const r of rows) {
    docs += r.docs
    acc.qty += r.qty
    acc.sales += r.sales
    acc.cost += r.cost
    acc.commission += r.commission
    acc.logistics += r.logistics
    acc.payable += r.payable
    acc.withdrawn += r.withdrawn
    acc.returnsQty += r.returnsQty
    acc.returnsSum += r.returnsSum
  }
  const out = finalize(acc)
  out.docs = docs
  return out
}

export default function CommissionReport() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const { shopIds, shops } = useAuth()
  const { costs } = useCostOverride()
  const message = useApiMessage()

  const [range, setRange] = useState(DEFAULT_RANGE)
  const [tab, setTab] = useState('sku')

  const idsKey = shopIds.join(',')
  // `shopIds` har renderda yangi massiv — effekt cheksiz qayta ishga
  // tushmasligi uchun barqaror satr kalitidan qayta quramiz
  const ids = useMemo(() => (idsKey ? idsKey.split(',').map(Number) : []), [idsKey])

  const load = useCallback(
    (signal, onProgress) =>
      fetchAllFinanceOrders(
        { shopIds: ids, dateFrom: range.dateFrom, dateTo: range.dateTo },
        signal,
        onProgress,
      ),
    [ids, range.dateFrom, range.dateTo],
  )

  const { data, loading, error, loaded, total, reload } = useBulkLoad(
    load,
    [idsKey, range.dateFrom, range.dateTo],
    { skip: ids.length === 0, cacheKey: ck('commission', { ids: idsKey, from: range.dateFrom, to: range.dateTo }) },
  )

  // Bekor qilingan pozitsiyalar hisobotga kirmaydi
  const items = useMemo(() => realizedItems(data?.items || []), [data])
  const capped = data?.capped

  const shopName = useMemo(() => {
    const map = new Map(shops.map((s) => [s.id, s.name]))
    return (id) => map.get(id) || (id ? `#${id}` : '—')
  }, [shops])

  /* ── Guruhlash ───────────────────────────────────────────────── */

  const rows = useMemo(() => {
    const map = new Map()

    for (const it of items) {
      let key
      let meta

      if (tab === 'sku') {
        // Tannarx lug'ati bilan bir xil kalit — «o'z tannarxim» mos tushishi uchun
        key = `${it.productId ?? '?'}|${it.skuTitle ?? ''}`
        meta = {
          title: it.productTitle || it.skuTitle,
          subtitle: [it.skuCharTitle, it.skuCharValue].filter(Boolean).join(': ') || it.skuTitle,
          article: it.sellerSkuCode || it.barcode,
          image: it.productImage?.photo?.[240]?.high || it.productImage?.url,
        }
      } else if (tab === 'order') {
        key = String(it.orderId ?? '?')
        meta = {
          title: `№ ${it.orderId ?? '—'}`,
          subtitle: shopName(it.shopId),
          article: it.status,
          at: it.date ?? it.dateIssued,
        }
      } else {
        key = monthKey(it.date ?? it.dateIssued) ?? '?'
        meta = { title: monthLabel(key, lang), subtitle: null, article: key }
      }

      if (!map.has(key)) map.set(key, { acc: zero(), meta })
      addItem(map.get(key).acc, it)
    }

    const list = [...map.entries()].map(([key, v]) => {
      const row = finalize(v.acc, { key, ...v.meta })
      // Uzum tannarxi bo'sh yoki noto'g'ri bo'lsa — kiritilgan qiymat ustun
      const unit = costs[key]
      if (tab === 'sku' && unit !== undefined) {
        row.cost = unit * row.qty
        row.costOverridden = true
      }
      return row
    })

    if (tab === 'month') return list.sort((a, b) => String(b.key).localeCompare(String(a.key)))
    if (tab === 'order') {
      return list.sort((a, b) => (toDate(b.at)?.getTime() || 0) - (toDate(a.at)?.getTime() || 0))
    }
    return list.sort((a, b) => b.sales - a.sales)
  }, [items, tab, costs, lang, shopName])

  const totals = useMemo(() => sumRows(rows), [rows])

  /* ── Hujjat sarlavhasi ───────────────────────────────────────── */

  const committent = useMemo(() => {
    if (ids.length === 0) return '—'
    if (ids.length === 1) return shopName(ids[0])
    return `${t('common.allShops')} (${ids.length})`
  }, [ids, shopName, t])

  /**
   * Hisobot raqami davr chegaralaridan tuziladi — bir xil davr uchun doim
   * bir xil chiqadi, shuning uchun eksport qilingan faylni qayta topish oson.
   */
  const reportNo = useMemo(() => {
    const stamp = (v, fallback) => {
      const d = toDate(v)
      return d ? d.toISOString().slice(0, 10).replace(/-/g, '') : fallback
    }
    return `KH-${stamp(range.dateFrom, 'ALL')}-${stamp(range.dateTo ?? Date.now(), '')}`
  }, [range.dateFrom, range.dateTo])

  /* ── Eksport ─────────────────────────────────────────────────── */

  const handleExport = () => {
    const columns = [
      { key: 'title', header: t('commission.subject') },
      { key: 'article', header: t('common.article') },
      { key: 'qty', header: t('commission.qtySold'), value: (r) => csvNum(r.qty) },
      { key: 'sales', header: t('commission.salesSum'), value: (r) => csvNum(Math.round(r.sales)) },
      { key: 'returnsQty', header: t('commission.returnsQty'), value: (r) => csvNum(r.returnsQty) },
      { key: 'returnsSum', header: t('commission.returnsSum'), value: (r) => csvNum(Math.round(r.returnsSum)) },
      { key: 'netSales', header: t('commission.netSales'), value: (r) => csvNum(Math.round(r.netSales)) },
      { key: 'commission', header: t('commission.fee'), value: (r) => csvNum(Math.round(r.commission)) },
      { key: 'logistics', header: t('commission.logistics'), value: (r) => csvNum(Math.round(r.logistics)) },
      { key: 'cost', header: t('commission.cost'), value: (r) => csvNum(Math.round(r.cost)) },
      { key: 'payable', header: t('commission.payable'), value: (r) => csvNum(Math.round(r.payable)) },
      { key: 'withdrawn', header: t('commission.withdrawn'), value: (r) => csvNum(Math.round(r.withdrawn)) },
      { key: 'outstanding', header: t('commission.outstanding'), value: (r) => csvNum(Math.round(r.outstanding)) },
    ]

    exportCsv([...rows, { ...totals, title: t('commission.totals'), article: '' }], columns, `${reportNo}.csv`)
  }

  /* ── Jadval ustunlari ────────────────────────────────────────── */

  const columns = useMemo(() => {
    const numeric = (key, header, opts = {}) => ({
      key,
      header,
      align: 'right',
      render: (r) => (
        <span className={opts.strong ? 'tabular text-[13.5px] font-semibold' : 'tabular text-[13px]'}>
          {opts.plain ? num(r[key], lang) : money(Math.round(r[key]), lang, { currency: false })}
        </span>
      ),
    })

    return [
      {
        key: 'subject',
        header: t('commission.subject'),
        nowrap: false,
        width: '24%',
        render: (r) =>
          tab === 'sku' ? (
            <ProductCell image={r.image} title={r.title} subtitle={r.subtitle} size={34} />
          ) : (
            <div className="min-w-0">
              <p className="text-app truncate text-[13.5px] font-medium">{r.title}</p>
              {r.subtitle && <p className="text-faint truncate text-[12px]">{r.subtitle}</p>}
            </div>
          ),
      },
      numeric('qty', t('commission.qtySold'), { plain: true }),
      numeric('sales', t('commission.salesSum')),
      {
        key: 'returns',
        header: t('commission.returns'),
        align: 'right',
        render: (r) =>
          r.returnsQty > 0 ? (
            <span className="tabular text-[13px] text-red-600 dark:text-red-400">
              {num(r.returnsQty, lang)} · {money(Math.round(r.returnsSum), lang, { currency: false })}
            </span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      numeric('netSales', t('commission.netSales')),
      {
        key: 'commission',
        header: t('commission.fee'),
        align: 'right',
        render: (r) => (
          <span className="tabular text-[13px]">
            {money(Math.round(r.commission), lang, { currency: false })}
            {r.commissionRate !== null && (
              <span className="text-faint ml-1 text-[11.5px]">{r.commissionRate.toFixed(1)}%</span>
            )}
          </span>
        ),
      },
      numeric('logistics', t('commission.logistics')),
      {
        key: 'cost',
        header: t('commission.cost'),
        align: 'right',
        render: (r) => (
          <span className="tabular text-[13px]">
            {money(Math.round(r.cost), lang, { currency: false })}
            {r.costOverridden && (
              <Badge tone="info" size="sm" dot={false} className="ml-1">
                {t('commission.ownCost')}
              </Badge>
            )}
          </span>
        ),
      },
      numeric('payable', t('commission.payable'), { strong: true }),
      numeric('withdrawn', t('commission.withdrawn')),
      {
        key: 'outstanding',
        header: t('commission.outstanding'),
        align: 'right',
        render: (r) => (
          <span
            className={
              r.outstanding > 0
                ? 'tabular text-[13px] font-medium text-amber-600 dark:text-amber-400'
                : 'tabular text-faint text-[13px]'
            }
          >
            {money(Math.round(r.outstanding), lang, { currency: false })}
          </span>
        ),
      },
    ]
  }, [t, lang, tab])

  if (ids.length === 0) {
    return (
      <>
        <PageHeader title={t('commission.title')} subtitle={t('commission.subtitle')} />
        <Card>
          <EmptyState icon={Store} title={t('errors.noShopSelected')} hint={t('errors.shopRequired')} />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader title={t('commission.title')} subtitle={t('commission.subtitle')}>
        <Button variant="ghost" icon={Printer} onClick={() => window.print()}>
          {t('common.print')}
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
            path: '/v1/finance/orders',
            params: { shopIds: ids, dateFrom: range.dateFrom, dateTo: range.dateTo, size: 100 },
            count: items.length,
            note: t('commission.sourceNote'),
          },
        ]}
      />

      <FilterBar onReset={() => setRange(DEFAULT_RANGE)}>
        <DateRangeFilter value={range} onChange={setRange} />
      </FilterBar>

      {/* Hujjat sarlavhasi — komitent, komissioner, davr */}
      <Card className="mb-4">
        <CardHeader
          title={`${t('commission.documentTitle')} ${reportNo}`}
          subtitle={t('commission.documentHint')}
          action={<PeriodLabel dateFrom={range.dateFrom} dateTo={range.dateTo} count={items.length} />}
        />
        <FieldGrid cols={4}>
          <Field label={t('commission.committent')}>{committent}</Field>
          <Field label={t('commission.commissioner')}>Uzum Market</Field>
          <Field label={t('commission.period')}>
            {range.dateFrom
              ? `${fmtDate(range.dateFrom, lang)} — ${fmtDate(range.dateTo ?? Date.now(), lang)}`
              : t('common.allTimePeriod')}
          </Field>
          <Field label={t('commission.compiledAt')}>{fmtDate(Date.now(), lang)}</Field>
        </FieldGrid>
      </Card>

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
          label={t('commission.salesSum')}
          value={money(Math.round(totals.sales), lang)}
          hint={t('commission.docsCount', { n: totals.docs })}
          icon={Wallet}
          tone="brand"
          loading={loading}
        />
        <StatCard
          label={t('commission.returns')}
          value={money(Math.round(totals.returnsSum), lang)}
          hint={t('commission.returnsUnits', { n: totals.returnsQty })}
          icon={Undo2}
          tone="danger"
          loading={loading}
        />
        <StatCard
          label={t('commission.fee')}
          value={money(Math.round(totals.commission), lang)}
          hint={totals.commissionRate !== null ? `${totals.commissionRate.toFixed(1)}%` : undefined}
          icon={Percent}
          tone="warning"
          loading={loading}
        />
        <StatCard
          label={t('commission.logistics')}
          value={money(Math.round(totals.logistics), lang)}
          icon={Truck}
          tone="warning"
          loading={loading}
        />
        <StatCard
          label={t('commission.netSales')}
          value={money(Math.round(totals.netSales), lang)}
          hint={t('commission.netSalesHint')}
          icon={FileSpreadsheet}
          tone="brand"
          loading={loading}
        />
        <StatCard
          label={t('commission.payable')}
          value={money(Math.round(totals.payable), lang)}
          hint={t('commission.payableHint')}
          icon={Banknote}
          tone="success"
          loading={loading}
        />
        <StatCard
          label={t('commission.withdrawn')}
          value={money(Math.round(totals.withdrawn), lang)}
          hint={t('commission.withdrawnHint')}
          icon={Banknote}
          tone="success"
          loading={loading}
        />
        <StatCard
          label={t('commission.outstanding')}
          value={money(Math.round(totals.outstanding), lang)}
          hint={t('commission.outstandingHint')}
          icon={Hourglass}
          tone={totals.outstanding > 0 ? 'warning' : 'success'}
          loading={loading}
        />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-4"
        tabs={[
          { value: 'sku', label: t('commission.bySku'), count: rows.length },
          { value: 'order', label: t('commission.byOrder') },
          { value: 'month', label: t('commission.byMonth') },
        ]}
      />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.key}
        loading={loading && rows.length === 0}
        emptyIcon={FileSpreadsheet}
        emptyTitle={t('commission.empty')}
        emptyHint={t('commission.emptyHint')}
        numbered
      />

      {rows.length > 0 && (
        <Card className="mt-3">
          <CardHeader title={t('commission.totals')} subtitle={t('commission.totalsHint')} />
          <FieldGrid cols={4}>
            <Field label={t('commission.qtySold')}>{num(totals.qty, lang)}</Field>
            <Field label={t('commission.salesSum')}>{money(Math.round(totals.sales), lang)}</Field>
            <Field label={t('commission.returnsSum')}>{money(Math.round(totals.returnsSum), lang)}</Field>
            <Field label={t('commission.netSales')}>{money(Math.round(totals.netSales), lang)}</Field>
            <Field label={t('commission.fee')}>{money(Math.round(totals.commission), lang)}</Field>
            <Field label={t('commission.logistics')}>{money(Math.round(totals.logistics), lang)}</Field>
            <Field label={t('commission.cost')}>{money(Math.round(totals.cost), lang)}</Field>
            <Field label={t('commission.payable')}>
              <strong>{money(Math.round(totals.payable), lang)}</strong>
            </Field>
          </FieldGrid>
          <p className="text-faint mt-3 text-[12px]">{t('commission.formulaHint')}</p>
        </Card>
      )}
    </>
  )
}
