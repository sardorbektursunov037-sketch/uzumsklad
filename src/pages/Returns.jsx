import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Undo2, Store } from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import { useApi, useApiMessage } from '../hooks/useApi'
import { useDebounced } from '../hooks/misc'
import { getShopReturns, getReturns, getShopReturn } from '../api/endpoints'
import { PAGE_SIZES } from '../api/constants'
import { money, num, dateTime, dash } from '../utils/format'
import {
  PageHeader,
  Card,
  DataTable,
  Pagination,
  Tabs,
  Badge,
  Input,
  Drawer,
  Field,
  FieldGrid,
  Spinner,
  EmptyState,
  ErrorState,
} from '../components/ui'
import { ProductCell, FilterBar } from '../components/common'
import { DevSource } from '../components/DevSource'
import { DataViewer } from '../components/DataViewer'

const TYPE_TONE = { RETURN: 'info', DEFECTED: 'danger', FBS: 'neutral' }

export default function Returns() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const { activeShopId, activeShop } = useAuth()
  const message = useApiMessage()

  const [tab, setTab] = useState('shop')
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)
  const [openId, setOpenId] = useState(null)
  // /v1/return endpointi aniq bitta qaytarishni ID bo'yicha qaytara oladi
  const [returnId, setReturnId] = useState('')
  const searchId = useDebounced(returnId, 400)

  useEffect(() => {
    setPage(0)
  }, [tab, activeShopId, searchId])

  const byShop = useApi(
    (signal) => getShopReturns(activeShopId, { page, size }, { signal }),
    [activeShopId, page, size],
    { skip: tab !== 'shop' || !activeShopId, keepPreviousData: true },
  )

  const all = useApi(
    (signal) => getReturns({ page, size, returnId: searchId || undefined }, { signal }),
    [page, size, searchId],
    { skip: tab !== 'all', keepPreviousData: true },
  )

  const source = tab === 'shop' ? byShop : all

  // API ba'zan yakka obyekt, ba'zan massiv qaytaradi — ikkalasini ham qo'llab-quvvatlaymiz
  const rows = useMemo(() => {
    const d = source.data
    if (!d) return []
    if (Array.isArray(d)) return d
    if (Array.isArray(d.returns)) return d.returns
    return [d]
  }, [source.data])

  const columns = useMemo(
    () => [
      {
        key: 'id',
        header: t('common.id'),
        render: (r) => <span className="text-app tabular text-[13.5px] font-medium">#{r.id}</span>,
      },
      {
        key: 'type',
        header: t('returns.type'),
        render: (r) => (
          <Badge tone={TYPE_TONE[r.type] || 'neutral'} size="sm" dot={false}>
            {t(`enums.returnType.${r.type}`, { defaultValue: r.type || '—' })}
          </Badge>
        ),
      },
      {
        key: 'status',
        header: t('common.status'),
        render: (r) => <span className="text-muted text-[13px]">{dash(r.status)}</span>,
      },
      {
        key: 'dateCreated',
        header: t('common.created'),
        render: (r) => <span className="text-muted tabular text-[13px]">{dateTime(r.dateCreated, lang)}</span>,
      },
      {
        key: 'executionDate',
        header: t('returns.executionDate'),
        render: (r) => <span className="text-muted tabular text-[13px]">{dateTime(r.executionDate, lang)}</span>,
      },
      {
        key: 'stock',
        header: t('orders.stock'),
        nowrap: false,
        render: (r) => <span className="text-muted text-[13px]">{dash(r.stock?.title || r.stock?.address)}</span>,
      },
      {
        key: 'totalAmount',
        header: t('returns.totalAmount'),
        align: 'right',
        render: (r) => <span className="tabular">{num(r.totalAmount, lang)}</span>,
      },
      {
        key: 'externalNumber',
        header: t('fboInvoices.externalNumber'),
        render: (r) => <span className="text-muted font-mono text-[12px]">{dash(r.externalNumber)}</span>,
      },
    ],
    [t, lang],
  )

  if (tab === 'shop' && !activeShopId) {
    return (
      <>
        <PageHeader title={t('returns.title')} subtitle={t('returns.subtitle')} />
        <Card>
          <EmptyState icon={Store} title={t('errors.noShopSelected')} hint={t('errors.shopRequired')} />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader title={t('returns.title')} subtitle={t('returns.subtitle')} />

      <DevSource
        className="mb-4"
        compact
        sources={[
          {
            path: '/v1/shop/{shopId}/return',
            params: { shopId: activeShopId, page, size },
            note: "«Do'kon bo'yicha» tab — SellerReturnLite",
          },
          {
            path: '/v1/shop/{shopId}/return/{returnId}',
            note: 'Qaytarish tafsiloti paneli — returnItems bilan',
          },
          {
            path: '/v1/return',
            params: { page, size, returnId: searchId || undefined },
            note: '«Barcha qaytarishlar» tab — SellerReturnDto',
          },
        ]}
      />

      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-4"
        tabs={[
          { value: 'shop', label: activeShop?.name || t('returns.byShop') },
          { value: 'all', label: t('returns.allReturns') },
        ]}
      />

      {tab === 'all' && (
        <FilterBar onReset={() => setReturnId('')}>
          <Input
            type="number"
            label={t('returns.searchById')}
            hint={t('returns.searchByIdHint')}
            value={returnId}
            onChange={(e) => setReturnId(e.target.value)}
            wrapperClassName="w-56"
            className="tabular"
          />
        </FilterBar>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={source.loading}
        error={source.error ? message(source.error) : null}
        onRetry={source.refetch}
        emptyIcon={Undo2}
        onRowClick={tab === 'shop' ? (r) => setOpenId(r.id) : undefined}
        expandable={
          tab === 'all'
            ? (r) => (
                <div>
                  <ReturnItems items={r.returnItems || []} />
                  <div className="px-5 pb-4">
                    <DataViewer data={r} exclude={['returnItems']} />
                  </div>
                </div>
              )
            : undefined
        }
        numbered
        indexOffset={page * size}
      />

      <Pagination page={page} size={size} onPage={setPage} onSize={setSize} sizes={PAGE_SIZES} hasMore={rows.length >= size} />

      <ReturnDrawer shopId={activeShopId} returnId={openId} onClose={() => setOpenId(null)} />
    </>
  )
}

/* ── Qaytarish tafsiloti ───────────────────────────────────────── */

function ReturnDrawer({ shopId, returnId, onClose }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const message = useApiMessage()

  const { data, loading, error, refetch } = useApi(
    (signal) => getShopReturn(shopId, returnId, { signal }),
    [shopId, returnId],
    { skip: !returnId || !shopId },
  )

  return (
    <Drawer
      open={Boolean(returnId)}
      onClose={onClose}
      title={t('returns.returnNo', { id: returnId })}
      subtitle={data ? dateTime(data.dateCreated, lang) : undefined}
    >
      {loading && (
        <div className="flex h-40 items-center justify-center">
          <Spinner size={24} />
        </div>
      )}
      {error && <ErrorState message={message(error)} onRetry={refetch} />}

      {data && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={TYPE_TONE[data.type] || 'neutral'} dot={false}>
              {t(`enums.returnType.${data.type}`, { defaultValue: data.type })}
            </Badge>
            {data.status && <Badge>{data.status}</Badge>}
          </div>

          <Card padded={false} className="p-4">
            <FieldGrid cols={2}>
              <Field label={t('returns.totalAmount')}>
                <span className="tabular">{num(data.totalAmount, lang)}</span>
              </Field>
              <Field label={t('returns.packedAmount')}>
                <span className="tabular">{num(data.totalPackedAmount, lang)}</span>
              </Field>
              <Field label={t('returns.assembledDate')}>{dateTime(data.assembledDate, lang)}</Field>
              <Field label={t('returns.completedDate')}>{dateTime(data.completedDate, lang)}</Field>
              {data.canceledDate && <Field label={t('returns.canceledDate')}>{dateTime(data.canceledDate, lang)}</Field>}
              {data.stock && <Field label={t('orders.stock')}>{data.stock.title || data.stock.address}</Field>}
              {data.externalNumber && <Field label={t('fboInvoices.externalNumber')} mono>{data.externalNumber}</Field>}
              {data.maxCountAllowedChange !== undefined && (
                <Field label={t('returns.allowedChanges')}>
                  <span className="tabular">
                    {num(data.countAllowedChange, lang)} / {num(data.maxCountAllowedChange, lang)}
                  </span>
                </Field>
              )}
            </FieldGrid>
          </Card>

          <section>
            <h3 className="text-app mb-2 text-[13px] font-semibold">
              {t('returns.items')}
              <span className="text-faint ml-1.5 font-normal">({data.returnItems?.length ?? 0})</span>
            </h3>
            <ReturnItems items={data.returnItems || []} bare />
          </section>

          <DataViewer data={data} />
        </div>
      )}
    </Drawer>
  )
}

function ReturnItems({ items, bare = false }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage

  if (!items.length) {
    return bare ? (
      <EmptyState compact title={t('common.noData')} hint={null} />
    ) : (
      <div className="text-faint px-5 py-4 text-[13px]">{t('common.noData')}</div>
    )
  }

  return (
    <ul className={bare ? 'space-y-2' : 'space-y-2 px-5 py-3'}>
      {items.map((it) => (
        <li key={it.id} className="border-app flex items-center gap-3 rounded-lg border p-3">
          <ProductCell title={it.productTitle} subtitle={it.skuTitle} size={36} />
          <div className="ml-auto shrink-0 text-right">
            <p className="text-app tabular text-[13px] font-medium">
              × {num(it.amount, lang)}
              {it.packedAmount !== undefined && (
                <span className="text-faint font-normal"> / {num(it.packedAmount, lang)}</span>
              )}
            </p>
            <p className="text-faint tabular text-[12px]">{money(it.purchasePrice, lang, { currency: false })}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
