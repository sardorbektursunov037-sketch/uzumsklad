import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Package, Tags, Printer, Store, Pencil, Radar, Boxes, ShieldAlert, Layers } from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useApi, useApiMessage, useAction } from '../hooks/useApi'
import { useBulkLoad } from '../hooks/useBulkLoad'
import { useDebounced } from '../hooks/misc'
import { getProducts, updatePrices, getBarcodeTypes, printBarcodes } from '../api/endpoints'
import { fetchProductsForShops } from '../api/bulk'
import { cacheKey as ck } from '../api/cache'
import { PRODUCT_SORT, PRODUCT_FILTERS, PRODUCT_RANKS, PAGE_SIZES } from '../api/constants'
import { money, num, percent, cx, downloadBlob, dash } from '../utils/format'
import {
  PageHeader,
  Card,
  StatCard,
  DataTable,
  Pagination,
  Button,
  Select,
  SearchInput,
  Input,
  Badge,
  Modal,
  EmptyState,
} from '../components/ui'
import { StatusBadge, ProductCell, FilterBar } from '../components/common'
import { DevSource } from '../components/DevSource'
import { DataViewer } from '../components/DataViewer'
import { ProductTracking } from '../components/ProductTracking'

const DEFAULT_FILTERS = { searchQuery: '', sortBy: '', order: '', filter: '', productRank: '' }

export default function Products() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const { activeShopId, activeShop, shops } = useAuth()
  const toast = useToast()
  const message = useApiMessage()

  /** "Barcha do'konlar" tanlanganda ham mahsulotlar ko'rinishi kerak */
  const allShopsMode = !activeShopId && shops.length > 0
  const shopIds = useMemo(() => shops.map((s) => s.id), [shops])
  const idsKey = shopIds.join(',')

  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)
  const search = useDebounced(filters.searchQuery, 450)

  const [priceModal, setPriceModal] = useState(null) // { product, shopId }
  const [labelModal, setLabelModal] = useState(null) // { skus: [...], shopId }
  const [tracking, setTracking] = useState(null) // { sku, product, shopId }

  // Filtr o'zgarganda birinchi sahifaga qaytamiz
  useEffect(() => {
    setPage(0)
  }, [search, filters.sortBy, filters.order, filters.filter, filters.productRank, activeShopId])

  /* ── Bitta do'kon: server o'zi sahifalaydi, saralaydi, filtrlaydi ── */
  const single = useApi(
    (signal) =>
      getProducts(
        activeShopId,
        {
          page,
          size,
          searchQuery: search || undefined,
          sortBy: filters.sortBy || undefined,
          order: filters.order || undefined,
          filter: filters.filter || undefined,
          productRank: filters.productRank || undefined,
        },
        { signal },
      ),
    [activeShopId, page, size, search, filters.sortBy, filters.order, filters.filter, filters.productRank],
    { skip: !activeShopId, keepPreviousData: true },
  )

  /**
   * "Barcha do'konlar": Uzum'ning `/v1/product/shop/{shopId}` endpointi bir
   * vaqtda faqat bitta do'kon uchun ishlaydi, shuning uchun har bir do'kon
   * alohida to'liq yuklanadi (`fetchProductsForShops`), so'ng qidiruv va
   * sahifalash shu yerda (brauzerda) qilinadi. Server saralash/filtrlash
   * bu rejimda ishlamaydi — ular faqat bitta do'kon tanlanganda ishlaydi.
   */
  const bulk = useBulkLoad(
    (signal, onProgress) => fetchProductsForShops(shopIds, signal, onProgress),
    [idsKey],
    { skip: !allShopsMode, cacheKey: ck('products-all', { ids: idsKey }) },
  )

  const allProducts = useMemo(() => bulk.data?.products || [], [bulk.data])

  const filteredAll = useMemo(() => {
    if (!search) return allProducts
    const q = search.toLowerCase()
    return allProducts.filter(
      (p) =>
        String(p.title || '').toLowerCase().includes(q) ||
        String(p.category || '').toLowerCase().includes(q) ||
        (p.skuList || []).some(
          (s) =>
            String(s.skuTitle || s.skuFullTitle || '').toLowerCase().includes(q) ||
            String(s.barcode || '').includes(q) ||
            String(s.sellerItemCode || '').toLowerCase().includes(q),
        ),
    )
  }, [allProducts, search])

  const allPageRows = useMemo(
    () => filteredAll.slice(page * size, (page + 1) * size),
    [filteredAll, page, size],
  )

  const data = single.data
  const loading = allShopsMode ? bulk.loading : single.loading
  const error = allShopsMode ? bulk.error : single.error
  const refetch = allShopsMode ? bulk.reload : single.refetch

  const products = allShopsMode ? allPageRows : data?.productList || []
  const total = allShopsMode ? filteredAll.length : data?.totalProductsAmount

  const set = (patch) => setFilters((f) => ({ ...f, ...patch }))

  /* Joriy sahifa bo'yicha umumiy ko'rsatkichlar */
  const summary = useMemo(() => {
    const skus = products.flatMap((p) => p.skuList || [])
    return {
      skus: skus.length,
      active: products.reduce((s, p) => s + (Number(p.quantityActive) || 0), 0),
      fbs: products.reduce((s, p) => s + (Number(p.quantityFbs) || 0), 0),
      blocked: skus.filter((s) => s.blocked).length,
    }
  }, [products])

  const shopName = useMemo(() => {
    const map = new Map(shops.map((s) => [s.id, s.name]))
    return (id) => map.get(id) || (id ? `#${id}` : '—')
  }, [shops])

  /* ── Ustunlar ────────────────────────────────────────────────── */

  const columns = useMemo(
    () => [
      {
        key: 'title',
        header: t('products.product'),
        nowrap: false,
        width: '30%',
        render: (p) => (
          <ProductCell
            image={p.previewImg || p.image}
            title={p.title || p.skuTitle}
            subtitle={p.category}
            size={40}
          />
        ),
      },
      ...(allShopsMode
        ? [
            {
              key: 'shop',
              header: t('common.shop'),
              render: (p) => <span className="text-muted text-[13px]">{shopName(p.shopId)}</span>,
            },
          ]
        : []),
      {
        key: 'status',
        header: t('common.status'),
        render: (p) => <StatusBadge group="productStatus" value={p.status?.value} fallback={p.status?.title} size="sm" />,
      },
      {
        key: 'moderation',
        header: t('products.moderation'),
        render: (p) => (
          <StatusBadge
            group="moderation"
            value={p.moderationStatus?.value}
            fallback={p.moderationStatus?.title}
            size="sm"
            dot={false}
          />
        ),
      },
      {
        key: 'rank',
        header: t('products.rank'),
        align: 'center',
        render: (p) =>
          p.skuList?.[0]?.rankInfo?.rank ? (
            <StatusBadge group="rank" value={p.skuList[0].rankInfo.rank} size="sm" dot={false} />
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      {
        key: 'commission',
        header: t('products.commission'),
        align: 'right',
        render: (p) => {
          const c = p.commissionDto
          if (c && (c.minCommission != null || c.maxCommission != null)) {
            return (
              <span className="tabular text-[13px]">
                {c.minCommission === c.maxCommission
                  ? percent(c.minCommission, lang)
                  : `${c.minCommission ?? '—'}–${percent(c.maxCommission, lang)}`}
              </span>
            )
          }
          return <span className="tabular">{p.commission != null ? percent(p.commission, lang) : '—'}</span>
        },
      },
      {
        key: 'price',
        header: t('common.price'),
        align: 'right',
        render: (p) => {
          const prices = (p.skuList || []).map((s) => Number(s.price)).filter((n) => Number.isFinite(n) && n > 0)
          if (!prices.length) return <span className="text-faint">—</span>
          const min = Math.min(...prices)
          const max = Math.max(...prices)
          return (
            <span className="tabular text-[13px] font-medium">
              {min === max ? money(min, lang, { currency: false }) : `${num(min, lang)}–${num(max, lang)}`}
            </span>
          )
        },
      },
      {
        key: 'quantityActive',
        header: t('products.activeQty'),
        align: 'right',
        render: (p) => <span className="tabular">{num(p.quantityActive, lang)}</span>,
      },
      {
        key: 'quantityFbs',
        header: t('products.fbsQty'),
        align: 'right',
        render: (p) => <span className="tabular">{num(p.quantityFbs, lang)}</span>,
      },
      {
        key: 'actions',
        header: '',
        align: 'right',
        render: (p) => (
          <div className="flex justify-end gap-1">
            <Button
              size="iconSm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation()
                setPriceModal({ product: p, shopId: p.shopId ?? activeShopId })
              }}
              title={t('products.editPrice')}
              aria-label={t('products.editPrice')}
            >
              <Pencil size={14} />
            </Button>
            <Button
              size="iconSm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation()
                setLabelModal({ skus: p.skuList || [], title: p.title, shopId: p.shopId ?? activeShopId })
              }}
              title={t('products.printLabels')}
              aria-label={t('products.printLabels')}
            >
              <Printer size={14} />
            </Button>
          </div>
        ),
      },
    ],
    [t, lang, allShopsMode, shopName, activeShopId],
  )

  /* ── SKU jadvali (yoyilgan qator) ────────────────────────────── */

  const renderSkus = (p) => {
    const skus = p.skuList || []
    if (!skus.length) {
      return <div className="text-faint px-5 py-4 text-[13px]">{t('common.noData')}</div>
    }
    return (
      <div className="overflow-x-auto px-5 py-3">
        <table className="w-full text-left text-[12.5px]">
          <thead>
            <tr className="text-faint">
              <th className="w-8 py-1.5 pr-2 text-right font-medium">№</th>
              <th className="py-1.5 pr-4 font-medium">{t('common.sku')}</th>
              <th className="py-1.5 pr-4 font-medium">{t('common.barcode')}</th>
              <th className="py-1.5 pr-4 font-medium">{t('products.characteristics')}</th>
              <th className="py-1.5 pr-4 text-right font-medium">{t('products.sellPrice')}</th>
              <th className="py-1.5 pr-4 text-right font-medium">{t('products.purchasePrice')}</th>
              <th className="py-1.5 pr-4 text-right font-medium">{t('products.activeQty')}</th>
              <th className="py-1.5 pr-4 text-right font-medium">{t('products.fbsQty')}</th>
              <th className="py-1.5 pr-4 text-right font-medium">{t('products.soldQty')}</th>
              <th className="py-1.5 pr-4 text-right font-medium">{t('products.returnedQty')}</th>
              <th className="py-1.5 pr-4 font-medium">{t('common.status')}</th>
              <th className="py-1.5 text-right font-medium">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {skus.map((s, si) => (
              <tr key={s.skuId} className="border-app border-t">
                <td className="text-faint tabular w-8 py-2 pr-2 text-right text-[11.5px]">{si + 1}</td>
                <td className="py-2 pr-4">
                  <p className="text-app font-medium">{s.skuTitle || s.skuFullTitle || `#${s.skuId}`}</p>
                  <p className="text-faint font-mono text-[11px]">{s.skuId}</p>
                </td>
                <td className="py-2 pr-4 font-mono text-[11.5px]">{dash(s.barcode)}</td>
                <td className="py-2 pr-4">{dash(s.characteristics)}</td>
                <td className="tabular py-2 pr-4 text-right font-medium">{money(s.price, lang, { currency: false })}</td>
                <td className="tabular py-2 pr-4 text-right">{money(s.purchasePrice, lang, { currency: false })}</td>
                <td className="tabular py-2 pr-4 text-right">{num(s.quantityActive, lang)}</td>
                <td className="tabular py-2 pr-4 text-right">{num(s.quantityFbs, lang)}</td>
                <td className="tabular py-2 pr-4 text-right">{num(s.quantitySold, lang)}</td>
                <td className="tabular py-2 pr-4 text-right">{num(s.quantityReturned, lang)}</td>
                <td className="py-2 pr-4">
                  {s.blocked ? (
                    <Badge tone="danger" size="sm">
                      {t('products.blocked')}
                    </Badge>
                  ) : s.archived ? (
                    <Badge tone="neutral" size="sm">
                      {t('products.archived')}
                    </Badge>
                  ) : (
                    <Badge tone="success" size="sm" dot={false}>
                      OK
                    </Badge>
                  )}
                </td>
                <td className="py-2 text-right">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={Radar}
                    onClick={() => setTracking({ sku: s, product: p, shopId: p.shopId ?? activeShopId })}
                  >
                    {t('products.tracking')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <DataViewer
          data={p}
          exclude={['skuList']}
          title={`${t('common.allFields')} — ${p.title || p.skuTitle || ''}`}
          className="mt-3"
        />
      </div>
    )
  }

  /* ── Hech qanday do'kon yo'q ─────────────────────────────────── */

  if (shops.length === 0) {
    return (
      <>
        <PageHeader title={t('products.title')} subtitle={t('products.subtitle')} />
        <Card>
          <EmptyState icon={Store} title={t('errors.noShopSelected')} hint={t('dashboard.noShop')} />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader title={t('products.title')} subtitle={activeShop?.name || (allShopsMode ? t('common.allShops') : t('products.subtitle'))}>
        {!allShopsMode && (
          <Button variant="secondary" icon={Tags} onClick={() => setLabelModal({ skus: [], title: null, shopId: activeShopId })}>
            {t('products.printLabels')}
          </Button>
        )}
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('products.totalProducts')} value={num(total, lang)} icon={Package} tone="brand" loading={loading} />
        <StatCard label={t('common.sku')} value={num(summary.skus, lang)} icon={Layers} tone="neutral" loading={loading} />
        <StatCard label={t('products.totalActive')} value={num(summary.active, lang)} icon={Boxes} tone="success" loading={loading} />
        <StatCard
          label={t('products.totalBlocked')}
          value={num(summary.blocked, lang)}
          icon={ShieldAlert}
          tone={summary.blocked ? 'danger' : 'neutral'}
          loading={loading}
        />
      </div>

      <DevSource
        className="mb-4"
        compact
        sources={
          allShopsMode
            ? [
                {
                  path: '/v1/product/shop/{shopId}',
                  params: { shopIds, filter: 'ALL' },
                  count: allProducts.length,
                  note: t('products.allShopsSourceNote'),
                },
              ]
            : [
                {
                  path: '/v1/product/shop/{shopId}',
                  params: {
                    shopId: activeShopId,
                    page,
                    size,
                    searchQuery: search || undefined,
                    sortBy: filters.sortBy || undefined,
                    order: filters.order || undefined,
                    filter: filters.filter || undefined,
                    productRank: filters.productRank || undefined,
                  },
                  count: products.length,
                  note: 'AllProducts.productList + totalProductsAmount',
                },
                { path: '/v1/product/barcodes/types', note: 'Etiketka chop etish oynasi' },
                { method: 'POST', path: '/v1/product/{shopId}/sendPriceData', note: 'Narx tahriri' },
                { method: 'POST', path: '/v1/product/shop/{shopId}/barcodes/print', note: 'Etiketka PDF' },
              ]
        }
      />

      <FilterBar onReset={() => setFilters(DEFAULT_FILTERS)}>
        <SearchInput
          value={filters.searchQuery}
          onChange={(v) => set({ searchQuery: v })}
          placeholder={t('common.searchPlaceholder')}
          className="w-full sm:w-72"
        />
        <Select
          label={t('common.filter')}
          value={filters.filter}
          onChange={(e) => set({ filter: e.target.value })}
          placeholder={t('common.all')}
          options={PRODUCT_FILTERS.map((v) => ({ value: v, label: t(`enums.productFilter.${v}`) }))}
          wrapperClassName="w-40"
          disabled={allShopsMode}
          title={allShopsMode ? t('products.filterNeedsOneShop') : undefined}
        />
        <Select
          label={t('products.rank')}
          value={filters.productRank}
          onChange={(e) => set({ productRank: e.target.value })}
          placeholder={t('common.all')}
          options={PRODUCT_RANKS.map((v) => ({ value: v, label: t(`enums.rank.${v}`) }))}
          wrapperClassName="w-36"
          disabled={allShopsMode}
          title={allShopsMode ? t('products.filterNeedsOneShop') : undefined}
        />
        <Select
          label={t('common.sortBy')}
          value={filters.sortBy}
          onChange={(e) => set({ sortBy: e.target.value })}
          placeholder={t('enums.productSort.DEFAULT')}
          options={PRODUCT_SORT.map((v) => ({ value: v, label: t(`enums.productSort.${v}`) }))}
          wrapperClassName="w-40"
          disabled={allShopsMode}
          title={allShopsMode ? t('products.filterNeedsOneShop') : undefined}
        />
        <Select
          label={t('common.order')}
          value={filters.order}
          onChange={(e) => set({ order: e.target.value })}
          placeholder="—"
          options={[
            { value: 'ASC', label: t('common.asc') },
            { value: 'DESC', label: t('common.desc') },
          ]}
          wrapperClassName="w-36"
          disabled={allShopsMode}
          title={allShopsMode ? t('products.filterNeedsOneShop') : undefined}
        />
      </FilterBar>

      {allShopsMode && <p className="text-faint mb-3 text-[12.5px]">{t('products.allShopsHint')}</p>}

      <DataTable
        columns={columns}
        rows={products}
        rowKey={(p) => `${p.shopId ?? activeShopId}-${p.productId}`}
        loading={loading}
        error={error ? message(error) : null}
        onRetry={refetch}
        emptyIcon={Package}
        expandable={renderSkus}
        numbered
        indexOffset={page * size}
      />

      <Pagination page={page} size={size} total={total} onPage={setPage} onSize={setSize} sizes={PAGE_SIZES} />

      {priceModal && (
        <PriceModal
          product={priceModal.product}
          shopId={priceModal.shopId}
          onClose={() => setPriceModal(null)}
          onSaved={() => {
            setPriceModal(null)
            toast.success(t('products.priceUpdated'))
            refetch()
          }}
        />
      )}

      <ProductTracking
        open={Boolean(tracking)}
        onClose={() => setTracking(null)}
        sku={tracking?.sku}
        product={tracking?.product}
        shopId={tracking?.shopId ?? activeShopId}
      />

      {labelModal && (
        <LabelModal
          skus={labelModal.skus.length ? labelModal.skus : products.flatMap((p) => p.skuList || [])}
          shopId={labelModal.shopId ?? activeShopId}
          onClose={() => setLabelModal(null)}
        />
      )}
    </>
  )
}

/* ══ Narx tahrirlash modali ═════════════════════════════════════ */

function PriceModal({ product, shopId, onClose, onSaved }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const toast = useToast()
  const message = useApiMessage()

  const [rows, setRows] = useState(() =>
    (product.skuList || []).map((s) => ({
      skuId: s.skuId,
      skuTitle: s.skuTitle || s.skuFullTitle || `#${s.skuId}`,
      sellPrice: s.price ?? '',
      fullPrice: s.price ?? '',
      originalPrice: s.price,
    })),
  )

  const { run, pending } = useAction(async () => {
    const skuList = rows
      .filter((r) => r.sellPrice !== '' && Number(r.sellPrice) > 0)
      .map((r) => ({
        skuId: r.skuId,
        skuTitle: r.skuTitle,
        sellPrice: Number(r.sellPrice),
        fullPrice: Number(r.fullPrice || r.sellPrice),
      }))
    if (!skuList.length) return
    await updatePrices(shopId, { productId: product.productId, skuList })
    onSaved()
  })

  const submit = async () => {
    try {
      await run()
    } catch (err) {
      toast.error(message(err))
    }
  }

  const update = (skuId, field, value) =>
    setRows((list) => list.map((r) => (r.skuId === skuId ? { ...r, [field]: value } : r)))

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('products.editPriceTitle', { title: product.title || product.skuTitle })}
      subtitle={t('products.editPriceHint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={submit} loading={pending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyState compact title={t('common.noData')} hint={null} />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.skuId} className="border-app grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_auto_auto]">
              <div className="min-w-0">
                <p className="text-app truncate text-[13.5px] font-medium">{r.skuTitle}</p>
                <p className="text-faint font-mono text-[11px]">
                  {r.skuId} · {money(r.originalPrice, lang)}
                </p>
              </div>
              <Input
                type="number"
                min="0"
                step="1000"
                label={t('products.sellPrice')}
                value={r.sellPrice}
                onChange={(e) => update(r.skuId, 'sellPrice', e.target.value)}
                wrapperClassName="w-full sm:w-40"
                className="tabular"
              />
              <Input
                type="number"
                min="0"
                step="1000"
                label={t('products.fullPrice')}
                value={r.fullPrice}
                onChange={(e) => update(r.skuId, 'fullPrice', e.target.value)}
                wrapperClassName="w-full sm:w-40"
                className="tabular"
              />
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

/* ══ Etiketka chop etish modali ═════════════════════════════════ */

function LabelModal({ skus, shopId, onClose }) {
  const { t } = useTranslation()
  const toast = useToast()
  const message = useApiMessage()

  const types = useApi((signal) => getBarcodeTypes({ signal }), [])
  const typeList = useMemo(
    () => types.data?.barcodeTypes || types.data?.types || (Array.isArray(types.data) ? types.data : []),
    [types.data],
  )

  const [typeId, setTypeId] = useState('')
  const [amount, setAmount] = useState(1)
  const [picked, setPicked] = useState(() => new Set())

  useEffect(() => {
    if (!typeId && typeList.length) setTypeId(String(typeList[0].id))
  }, [typeList, typeId])

  const { run, pending } = useAction(async () => {
    const data = [...picked].slice(0, 100).map((skuId) => ({
      skuId: Number(skuId),
      amount: Math.min(Number(amount) || 1, 100),
      barcodeTypeId: Number(typeId),
    }))
    const blob = await printBarcodes(shopId, { data })
    downloadBlob(blob, `uzum-labels-${Date.now()}.pdf`)
    toast.success(t('products.labelsReady'))
    onClose()
  })

  const submit = async () => {
    if (!picked.size) {
      toast.warning(t('products.selectSkusFirst'))
      return
    }
    try {
      await run()
    } catch (err) {
      toast.error(message(err))
    }
  }

  const toggle = (id) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('products.printLabelsTitle')}
      subtitle={t('products.labelsHint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" icon={Printer} onClick={submit} loading={pending} disabled={!typeId}>
            {t('common.print')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label={t('products.labelSize')}
          value={typeId}
          onChange={(e) => setTypeId(e.target.value)}
          options={typeList.map((x) => ({
            value: x.id,
            label: [x.title || `#${x.id}`, x.printType].filter(Boolean).join(' · '),
          }))}
          placeholder={types.loading ? t('common.loading') : undefined}
          disabled={types.loading || !typeList.length}
        />
        <Input
          type="number"
          min="1"
          max="100"
          label={t('products.labelCount')}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="tabular"
        />
      </div>

      <div className="border-app mt-4 max-h-72 overflow-y-auto rounded-lg border">
        {skus.length === 0 ? (
          <EmptyState compact title={t('common.noData')} hint={null} />
        ) : (
          <ul>
            {skus.map((s) => (
              <li key={s.skuId} className="border-app hover:bg-surface-hover border-b last:border-0">
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={picked.has(s.skuId)}
                    onChange={() => toggle(s.skuId)}
                    className="accent-brand-600 size-4"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-app truncate text-[13px] font-medium">
                      {s.skuTitle || s.skuFullTitle || `#${s.skuId}`}
                    </p>
                    <p className="text-faint truncate font-mono text-[11px]">
                      {s.skuId}
                      {s.barcode ? ` · ${s.barcode}` : ''}
                    </p>
                  </div>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className={cx('text-faint mt-2 text-[12px]', picked.size > 100 && 'text-amber-600 dark:text-amber-400')}>
        {t('common.selected', { count: picked.size })}
      </p>
    </Modal>
  )
}
