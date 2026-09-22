import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Warehouse, Store, Download, Boxes, PackageX, Undo2, Camera, FileWarning } from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import { useBulkLoad } from '../hooks/useBulkLoad'
import { cacheKey as ck } from '../api/cache'
import { useApiMessage } from '../hooks/useApi'
import { fetchProductsForShops } from '../api/bulk'
import { PAGE_SIZES } from '../api/constants'
import { num, money, cx } from '../utils/format'
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
  EmptyState,
  ErrorState,
  Spinner,
  Modal,
} from '../components/ui'
import { ProductCell, FilterBar } from '../components/common'
import { DevSource } from '../components/DevSource'
import { useDebounced } from '../hooks/misc'

/**
 * Omborlar kesimi (Склады).
 *
 * Uzum'da «ombor» degan alohida ma'lumotnoma yo'q — uning o'rniga har bir
 * SKU uchun qoldiq zonalarga bo'lingan holda beriladi (`quantity*`
 * maydonlari, `/v1/product/shop/{shopId}`). MoySklad integratsiyasi shu
 * zonalarni virtual omborlarga aylantiradi (Uzum · Uzum FBS · Uzum ПВЗ ·
 * Непринятые товары · Uzum FBS возвраты), biz esa ularni asl nomlari bilan
 * ko'rsatamiz — hech qanday zona yo'qolmasligi uchun.
 */

/** Qoldiq zonalari — ko'rsatish tartibida. i18n kaliti `fields.<key>`. */
const ZONES = [
  { key: 'quantityActive', tone: 'success' },
  { key: 'quantityFbs', tone: 'brand' },
  { key: 'quantityAdditional', tone: 'neutral' },
  { key: 'quantityPending', tone: 'warning' },
  { key: 'quantityOnPhotoStudio', tone: 'neutral' },
  { key: 'quantityReturned', tone: 'warning' },
  { key: 'quantityDefected', tone: 'danger' },
  { key: 'quantityMissing', tone: 'danger' },
  { key: 'quantityArchived', tone: 'neutral' },
  { key: 'quantitySold', tone: 'success' },
  { key: 'quantityCreated', tone: 'neutral' },
]

export default function Warehouses() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const { shopIds, shops } = useAuth()
  const message = useApiMessage()

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)
  const [lossOpen, setLossOpen] = useState(false)

  const debounced = useDebounced(search)

  const idsKey = shopIds.join(',')
  const ids = useMemo(() => (idsKey ? idsKey.split(',').map(Number) : []), [idsKey])

  const load = useCallback(
    (signal, onProgress) => fetchProductsForShops(ids, signal, onProgress),
    [ids],
  )

  const { data, loading, error, loaded, reload } = useBulkLoad(load, [idsKey], {
    skip: ids.length === 0,
    cacheKey: ck('warehouses', { ids: idsKey }),
  })

  const products = useMemo(() => data?.products || [], [data])

  /** Har bir SKU — alohida qator, chunki qoldiq SKU darajasida yuritiladi */
  const skus = useMemo(() => {
    const list = []
    for (const p of products) {
      for (const s of p.skuList || []) {
        list.push({
          key: `${p.productId}-${s.skuId}`,
          skuId: s.skuId,
          title: p.title || s.productTitle || s.skuTitle,
          subtitle: s.skuFullTitle || s.skuTitle,
          article: s.sellerItemCode || s.article,
          barcode: s.barcode,
          image: s.previewImage || p.previewImg || p.image,
          shopId: p.shopId,
          purchasePrice: Number(s.purchasePrice) || 0,
          price: Number(s.price) || 0,
          ...Object.fromEntries(ZONES.map((z) => [z.key, Number(s[z.key]) || 0])),
        })
      }
    }
    return list
  }, [products])

  const rows = useMemo(() => {
    let list = skus
    if (debounced) {
      const q = debounced.toLowerCase()
      list = list.filter(
        (s) =>
          String(s.title).toLowerCase().includes(q) ||
          String(s.subtitle || '').toLowerCase().includes(q) ||
          String(s.barcode || '').includes(q) ||
          String(s.article || '').toLowerCase().includes(q) ||
          String(s.skuId || '').includes(q),
      )
    }
    return [...list].sort((a, b) => b.quantityActive - a.quantityActive || b.quantityFbs - a.quantityFbs)
  }, [skus, debounced])

  const pageRows = useMemo(() => rows.slice(page * size, (page + 1) * size), [rows, page, size])

  /** Zona bo'yicha umumiy qoldiq */
  const totals = useMemo(() => {
    const acc = {}
    for (const z of ZONES) acc[z.key] = 0
    for (const s of rows) for (const z of ZONES) acc[z.key] += s[z.key]
    return acc
  }, [rows])

  const shopName = useMemo(() => {
    const map = new Map(shops.map((s) => [s.id, s.name]))
    return (id) => map.get(id) || (id ? `#${id}` : '—')
  }, [shops])

  /**
   * Yo'qolgan/nuqsonli tovarlar hisoboti — faqat kamomad yoki nuqson qayd
   * etilgan SKU'lar, taxminiy zarar tannarx bo'yicha hisoblanadi.
   */
  const lossRows = useMemo(() => {
    return rows
      .map((s) => {
        const lostQty = s.quantityMissing + s.quantityDefected
        return { ...s, lostQty, lostValue: lostQty * s.purchasePrice }
      })
      .filter((s) => s.lostQty > 0)
      .sort((a, b) => b.lostValue - a.lostValue || b.lostQty - a.lostQty)
  }, [rows])

  const lossTotals = useMemo(
    () => ({
      qty: lossRows.reduce((sum, s) => sum + s.lostQty, 0),
      value: lossRows.reduce((sum, s) => sum + s.lostValue, 0),
    }),
    [lossRows],
  )

  const handleLossExport = () => {
    exportCsv(
      lossRows,
      [
        { key: 'title', header: t('products.product') },
        { key: 'subtitle', header: t('common.sku') },
        { key: 'skuId', header: 'SKU ID' },
        { key: 'quantityMissing', header: t('fields.quantityMissing'), value: (r) => csvNum(r.quantityMissing) },
        { key: 'quantityDefected', header: t('fields.quantityDefected'), value: (r) => csvNum(r.quantityDefected) },
        { key: 'lostQty', header: t('warehouses.lossReport.totalQty'), value: (r) => csvNum(r.lostQty) },
        { key: 'purchasePrice', header: t('products.purchasePrice'), value: (r) => csvNum(r.purchasePrice) },
        { key: 'lostValue', header: t('warehouses.lossReport.totalValue'), value: (r) => csvNum(r.lostValue) },
      ],
      `yoqolgan-tovarlar-${new Date().toISOString().slice(0, 10)}.csv`,
    )
  }

  const handleExport = () => {
    exportCsv(
      rows,
      [
        { key: 'title', header: t('products.product') },
        { key: 'subtitle', header: t('common.sku') },
        { key: 'skuId', header: 'SKU ID' },
        { key: 'barcode', header: t('common.barcode') },
        { key: 'article', header: t('common.article') },
        ...ZONES.map((z) => ({
          key: z.key,
          header: t(`fields.${z.key}`),
          value: (r) => csvNum(r[z.key]),
        })),
      ],
      `omborlar-${new Date().toISOString().slice(0, 10)}.csv`,
    )
  }

  const columns = useMemo(
    () => [
      {
        key: 'product',
        header: t('products.product'),
        nowrap: false,
        width: '26%',
        render: (s) => <ProductCell image={s.image} title={s.title} subtitle={s.subtitle} size={34} />,
      },
      ...(ids.length > 1
        ? [
            {
              key: 'shop',
              header: t('common.shop'),
              render: (s) => <span className="text-muted text-[13px]">{shopName(s.shopId)}</span>,
            },
          ]
        : []),
      ...ZONES.map((z) => ({
        key: z.key,
        header: t(`fields.${z.key}`),
        align: 'right',
        render: (s) => (
          <span
            className={cx(
              'tabular text-[13px]',
              s[z.key] === 0 && 'text-faint',
              s[z.key] > 0 && z.tone === 'danger' && 'font-medium text-red-600 dark:text-red-400',
              s[z.key] > 0 && z.tone === 'warning' && 'text-amber-600 dark:text-amber-400',
            )}
          >
            {num(s[z.key], lang)}
          </span>
        ),
      })),
    ],
    [t, lang, ids.length, shopName],
  )

  if (ids.length === 0) {
    return (
      <>
        <PageHeader title={t('warehouses.title')} subtitle={t('warehouses.subtitle')} />
        <Card>
          <EmptyState icon={Store} title={t('errors.noShopSelected')} hint={t('errors.shopRequired')} />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader title={t('warehouses.title')} subtitle={t('warehouses.subtitle')}>
        <Button variant="secondary" icon={Download} onClick={handleExport} disabled={rows.length === 0}>
          {t('common.exportCsv')}
        </Button>
      </PageHeader>

      <DevSource
        className="mb-4"
        compact
        sources={[
          {
            path: '/v1/product/shop/{shopId}',
            params: { shopIds: ids, size: 100, filter: 'ALL' },
            count: skus.length,
            note: t('warehouses.sourceNote'),
          },
        ]}
      />

      <FilterBar
        onReset={() => {
          setSearch('')
          setPage(0)
        }}
      >
        <SearchInput
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(0)
          }}
          onClear={() => setSearch('')}
          placeholder={t('common.searchPlaceholder')}
          className="w-64"
        />
      </FilterBar>

      {loading && (
        <Card className="mb-4">
          <div className="flex items-center justify-center gap-3 py-6">
            <Spinner />
            <span className="text-muted text-[13px]">{t('warehouses.loading', { loaded })}</span>
          </div>
        </Card>
      )}

      {error && <ErrorState message={message(error)} onRetry={reload} className="mb-4" />}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('fields.quantityActive')}
          value={num(totals.quantityActive, lang)}
          hint={t('warehouses.activeHint')}
          icon={Boxes}
          tone="success"
          loading={loading}
        />
        <StatCard
          label={t('fields.quantityFbs')}
          value={num(totals.quantityFbs, lang)}
          hint={t('warehouses.fbsHint')}
          icon={Warehouse}
          tone="brand"
          loading={loading}
        />
        <StatCard
          label={t('fields.quantityReturned')}
          value={num(totals.quantityReturned, lang)}
          hint={t('warehouses.returnedHint')}
          icon={Undo2}
          tone={totals.quantityReturned > 0 ? 'warning' : 'success'}
          loading={loading}
        />
        <StatCard
          label={t('fields.quantityMissing')}
          value={num(totals.quantityMissing + totals.quantityDefected, lang)}
          hint={t('warehouses.problemHint')}
          icon={PackageX}
          tone={totals.quantityMissing + totals.quantityDefected > 0 ? 'danger' : 'success'}
          loading={loading}
          onClick={() => setLossOpen(true)}
        />
      </div>

      {/* Zona bo'yicha umumiy taqsimot — MoySklad'dagi «Склады» ro'yxati o'rnida */}
      <Card className="mb-4">
        <CardHeader title={t('warehouses.distribution')} subtitle={t('warehouses.distributionHint')} />
        <div className="divide-app divide-y">
          {ZONES.map((z) => (
            <div key={z.key} className="flex items-center justify-between gap-4 py-2.5">
              <span className="text-app flex items-center gap-2 text-[13.5px]">
                {z.key === 'quantityOnPhotoStudio' && <Camera size={14} className="text-faint" aria-hidden />}
                {t(`fields.${z.key}`)}
              </span>
              <span
                className={cx(
                  'tabular text-[13.5px] font-medium',
                  totals[z.key] === 0 && 'text-faint',
                  totals[z.key] > 0 && z.tone === 'danger' && 'text-red-600 dark:text-red-400',
                  totals[z.key] > 0 && z.tone === 'warning' && 'text-amber-600 dark:text-amber-400',
                )}
              >
                {num(totals[z.key], lang)}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <DataTable
        columns={columns}
        rows={pageRows}
        rowKey={(s) => s.key}
        loading={loading && pageRows.length === 0}
        emptyIcon={Warehouse}
        emptyTitle={t('warehouses.empty')}
        emptyHint={t('warehouses.emptyHint')}
        numbered
        indexOffset={page * size}
      />

      <Pagination page={page} size={size} total={rows.length} onPage={setPage} onSize={setSize} sizes={PAGE_SIZES} />

      <Modal
        open={lossOpen}
        onClose={() => setLossOpen(false)}
        title={t('warehouses.lossReport.title')}
        subtitle={t('warehouses.lossReport.subtitle')}
        size="xl"
        footer={
          <>
            <div className="text-muted mr-auto text-[13px]">
              {t('warehouses.lossReport.totalQty')}:{' '}
              <span className="text-app font-semibold">{num(lossTotals.qty, lang)}</span>
              <span className="mx-2">·</span>
              {t('warehouses.lossReport.totalValue')}:{' '}
              <span className="font-semibold text-red-600 dark:text-red-400">
                {money(lossTotals.value, lang)}
              </span>
            </div>
            <Button variant="secondary" icon={Download} onClick={handleLossExport} disabled={lossRows.length === 0}>
              {t('common.exportCsv')}
            </Button>
          </>
        }
      >
        <DataTable
          columns={[
            {
              key: 'product',
              header: t('products.product'),
              width: '30%',
              render: (s) => <ProductCell image={s.image} title={s.title} subtitle={s.subtitle} size={30} />,
            },
            {
              key: 'quantityMissing',
              header: t('fields.quantityMissing'),
              align: 'right',
              render: (s) => <span className="tabular text-[13px]">{num(s.quantityMissing, lang)}</span>,
            },
            {
              key: 'quantityDefected',
              header: t('fields.quantityDefected'),
              align: 'right',
              render: (s) => <span className="tabular text-[13px]">{num(s.quantityDefected, lang)}</span>,
            },
            {
              key: 'lostQty',
              header: t('warehouses.lossReport.totalQty'),
              align: 'right',
              render: (s) => (
                <span className="tabular text-[13px] font-medium text-red-600 dark:text-red-400">
                  {num(s.lostQty, lang)}
                </span>
              ),
            },
            {
              key: 'purchasePrice',
              header: t('products.purchasePrice'),
              align: 'right',
              render: (s) => <span className="tabular text-muted text-[13px]">{money(s.purchasePrice, lang)}</span>,
            },
            {
              key: 'lostValue',
              header: t('warehouses.lossReport.totalValue'),
              align: 'right',
              render: (s) => (
                <span className="tabular text-[13px] font-semibold text-red-600 dark:text-red-400">
                  {money(s.lostValue, lang)}
                </span>
              ),
            },
          ]}
          rows={lossRows}
          rowKey={(s) => s.key}
          emptyIcon={FileWarning}
          emptyTitle={t('warehouses.lossReport.empty')}
          emptyHint={t('warehouses.lossReport.emptyHint')}
        />
      </Modal>
    </>
  )
}
