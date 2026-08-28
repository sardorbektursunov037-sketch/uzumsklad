import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Truck, Store } from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import { useApi, useApiMessage } from '../hooks/useApi'
import { getShopInvoices, getAllInvoices, getInvoiceProducts } from '../api/endpoints'
import { PAGE_SIZES } from '../api/constants'
import { money, num, dateTime, dash } from '../utils/format'
import {
  PageHeader,
  Card,
  DataTable,
  Pagination,
  Tabs,
  Spinner,
  EmptyState,
  ErrorState,
} from '../components/ui'
import { ProductCell } from '../components/common'
import { DevSource } from '../components/DevSource'
import { DataViewer } from '../components/DataViewer'

export default function Supplies() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const { activeShopId, activeShop } = useAuth()
  const message = useApiMessage()

  const [tab, setTab] = useState('shop')
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)

  useEffect(() => {
    setPage(0)
  }, [tab, activeShopId])

  const byShop = useApi(
    (signal) => getShopInvoices(activeShopId, { page, size }, { signal }),
    [activeShopId, page, size],
    { skip: tab !== 'shop' || !activeShopId, keepPreviousData: true },
  )

  const all = useApi((signal) => getAllInvoices({ page, size }, { signal }), [page, size], {
    skip: tab !== 'all',
    keepPreviousData: true,
  })

  const source = tab === 'shop' ? byShop : all
  const rows = useMemo(() => (Array.isArray(source.data) ? source.data : []), [source.data])

  const columns = useMemo(
    () => [
      {
        key: 'invoiceNumber',
        header: t('fboInvoices.invoiceNumber'),
        render: (inv) => <span className="text-app tabular text-[13.5px] font-medium">{dash(inv.invoiceNumber ?? inv.id)}</span>,
      },
      ...(tab === 'all'
        ? [
            {
              key: 'shopTitle',
              header: t('common.shop'),
              render: (inv) => <span className="text-muted text-[13px]">{dash(inv.shopTitle)}</span>,
            },
          ]
        : []),
      {
        key: 'status',
        header: t('common.status'),
        render: (inv) => {
          const s = inv.invoiceStatus
          if (!s) return <span className="text-faint">{dash(inv.status)}</span>
          return (
            <span
              className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[12px] font-medium"
              style={s.color ? { color: s.color, borderColor: `${s.color}44` } : undefined}
            >
              {s.text || s.value}
            </span>
          )
        },
      },
      {
        key: 'dateCreated',
        header: t('common.created'),
        render: (inv) => <span className="text-muted tabular text-[13px]">{dateTime(inv.dateCreated, lang)}</span>,
      },
      {
        key: 'dateAccepted',
        header: t('fboInvoices.dateAccepted'),
        render: (inv) => <span className="text-muted tabular text-[13px]">{dateTime(inv.dateAccepted, lang)}</span>,
      },
      {
        key: 'totalToStock',
        header: t('fboInvoices.totalToStock'),
        align: 'right',
        render: (inv) => <span className="tabular">{num(inv.totalToStock, lang)}</span>,
      },
      {
        key: 'totalAccepted',
        header: t('fboInvoices.totalAccepted'),
        align: 'right',
        render: (inv) => <span className="tabular">{num(inv.totalAccepted, lang)}</span>,
      },
      {
        key: 'fullPrice',
        header: t('fbsInvoices.fullPrice'),
        align: 'right',
        render: (inv) => <span className="tabular text-[13.5px] font-medium">{money(inv.fullPrice, lang, { currency: false })}</span>,
      },
      {
        key: 'stock',
        header: t('orders.stock'),
        nowrap: false,
        render: (inv) => <span className="text-muted text-[13px]">{dash(inv.stock?.title || inv.stock?.address)}</span>,
      },
      {
        key: 'externalNumber',
        header: t('fboInvoices.externalNumber'),
        render: (inv) => <span className="text-muted font-mono text-[12px]">{dash(inv.externalNumber)}</span>,
      },
    ],
    [t, lang, tab],
  )

  /** Yoyilgan qator: xat tarkibi */
  const renderContent = (inv) => (
    <div>
      {tab === 'all' ? (
        <InvoiceProductsList products={inv.productForInvoiceDto || []} />
      ) : (
        <ShopInvoiceProducts shopId={activeShopId} invoiceId={inv.id} />
      )}
      <div className="px-5 pb-4">
        <DataViewer data={inv} exclude={['productForInvoiceDto']} />
      </div>
    </div>
  )

  if (tab === 'shop' && !activeShopId) {
    return (
      <>
        <PageHeader title={t('fboInvoices.title')} subtitle={t('fboInvoices.subtitle')} />
        <Card>
          <EmptyState icon={Store} title={t('errors.noShopSelected')} hint={t('errors.shopRequired')} />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader title={t('fboInvoices.title')} subtitle={t('fboInvoices.subtitle')} />

      <DevSource
        className="mb-4"
        compact
        sources={[
          {
            path: '/v1/shop/{shopId}/invoice',
            params: { shopId: activeShopId, page, size },
            note: "«Do'kon bo'yicha» tab — InvoiceInList",
          },
          {
            path: '/v1/shop/{shopId}/invoice/products',
            note: 'Xat tarkibi — ProductForInvoiceDto',
          },
          {
            path: '/v1/invoice',
            params: { page, size },
            note: '«Barcha do\u2019konlar» tab — InvoiceWithSkuListDto',
          },
        ]}
      />

      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-4"
        tabs={[
          { value: 'shop', label: activeShop?.name || t('fboInvoices.byShop') },
          { value: 'all', label: t('fboInvoices.allShops') },
        ]}
      />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(inv) => inv.id}
        loading={source.loading}
        error={source.error ? message(source.error) : null}
        onRetry={source.refetch}
        emptyIcon={Truck}
        expandable={renderContent}
        numbered
        indexOffset={page * size}
      />

      <Pagination page={page} size={size} onPage={setPage} onSize={setSize} sizes={PAGE_SIZES} hasMore={rows.length >= size} />
    </>
  )
}

/* ── Xat tarkibi (do'kon bo'yicha — alohida so'rov) ────────────── */

function ShopInvoiceProducts({ shopId, invoiceId }) {
  const message = useApiMessage()
  const { data, loading, error, refetch } = useApi(
    (signal) => getInvoiceProducts(shopId, invoiceId, { signal }),
    [shopId, invoiceId],
  )

  if (loading) {
    return (
      <div className="flex h-20 items-center justify-center">
        <Spinner />
      </div>
    )
  }
  if (error) return <ErrorState message={message(error)} onRetry={refetch} compact />

  return <InvoiceProductsList products={Array.isArray(data) ? data : []} />
}

function InvoiceProductsList({ products }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage

  if (!products.length) {
    return <div className="text-faint px-5 py-4 text-[13px]">{t('common.noData')}</div>
  }

  return (
    <div className="overflow-x-auto px-5 py-3">
      <table className="w-full text-left text-[12.5px]">
        <thead>
          <tr className="text-faint">
            <th className="py-1.5 pr-4 font-medium">{t('products.product')}</th>
            <th className="py-1.5 pr-4 text-right font-medium">{t('fboInvoices.totalToStock')}</th>
            <th className="py-1.5 pr-4 text-right font-medium">{t('fboInvoices.totalAccepted')}</th>
            <th className="py-1.5 text-right font-medium">{t('products.purchasePrice')}</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-app border-t">
              <td className="py-2 pr-4">
                <ProductCell title={p.productTitle} subtitle={p.skuTitle} size={30} />
              </td>
              <td className="tabular py-2 pr-4 text-right">{num(p.quantityToStock, lang)}</td>
              <td className="tabular py-2 pr-4 text-right">
                <span
                  className={
                    p.quantityAccepted < p.quantityToStock ? 'font-medium text-amber-600 dark:text-amber-400' : undefined
                  }
                >
                  {num(p.quantityAccepted, lang)}
                </span>
              </td>
              <td className="tabular py-2 text-right">{money(p.purchasePrice, lang, { currency: false })}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Har bir tovarning SKU tarkibi va qolgan maydonlari */}
      <DataViewer
        data={products}
        title={`${t('common.allFields')} — ${t('fboInvoices.content')}`}
        className="mt-3"
      />
    </div>
  )
}
