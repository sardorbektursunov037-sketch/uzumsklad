import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ShoppingCart, FileText, Printer, Check, X, Truck, PackageCheck, Undo2, Hash } from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useApi, useApiMessage, useAction } from '../hooks/useApi'
import { useSelection } from '../hooks/misc'
import {
  getOrders,
  getOrdersAllStatuses,
  getOrdersCountByStatus,
  getOrder,
  confirmOrder,
  cancelOrder,
  setOrderIdentifiers,
  getOrderLabel,
  getReturnReasons,
  dbsDelivering,
  dbsCompleted,
  dbsRefund,
} from '../api/endpoints'
import {
  ORDER_STATUSES,
  ORDER_SCHEMES,
  CANCEL_REASONS,
  PAGE_SIZES,
  LABEL_SIZES,
  ORDER_PROBLEM_TONE,
} from '../api/constants'
import {
  money,
  num,
  dateTime,
  deadline,
  base64ToBlob,
  downloadBlob,
  dash,
  cx,
  itemRevenue,
  orderProblems,
  STUCK_DAYS,
} from '../utils/format'
import {
  PageHeader,
  Card,
  DataTable,
  Pagination,
  Button,
  Select,
  Textarea,
  Input,
  Badge,
  Switch,
  Drawer,
  Modal,
  ConfirmDialog,
  Dropdown,
  MenuItem,
  MenuLabel,
  Field,
  FieldGrid,
  Spinner,
  ErrorState,
  EmptyState,
} from '../components/ui'
import { StatusBadge, SchemeBadge, ProductCell, DeadlineCell, FilterBar, DateRangeFilter } from '../components/common'
import { DataViewer } from '../components/DataViewer'
import { DevSource } from '../components/DevSource'
import { PeriodLabel } from '../components/PeriodLabel'
import { CreateInvoiceModal } from '../components/CreateInvoiceModal'

// Standart holatda sana filtri qo'yilmaydi — Uzum eng yangilarini qaytaradi.
// Davrni foydalanuvchi o'zi toraytiradi.
const DEFAULT_RANGE = { dateFrom: undefined, dateTo: undefined }

export default function Orders() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const { shopIds, activeShopId } = useAuth()
  const message = useApiMessage()

  const [status, setStatus] = useState('')
  const [scheme, setScheme] = useState('')
  const [range, setRange] = useState(DEFAULT_RANGE)
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)

  const [openOrderId, setOpenOrderId] = useState(null)
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [problemOnly, setProblemOnly] = useState(false)

  const idsKey = shopIds.join(',')

  useEffect(() => {
    setPage(0)
  }, [status, scheme, range.dateFrom, range.dateTo, idsKey])

  // Status tanlanmagan bo'lsa — barcha statuslarni yig'amiz (Uzum aks holda
  // bo'sh ro'yxat qaytaradi), sahifalash esa mahalliy bajariladi.
  const aggregated = !status

  const { data, loading, error, refetch } = useApi(
    (signal) =>
      aggregated
        ? getOrdersAllStatuses(
            {
              shopIds,
              scheme: scheme || undefined,
              dateFrom: range.dateFrom,
              dateTo: range.dateTo,
              perStatus: 50,
            },
            { signal },
          )
        : getOrders(
            {
              shopIds,
              status,
              scheme: scheme || undefined,
              dateFrom: range.dateFrom,
              dateTo: range.dateTo,
              page,
              size,
            },
            { signal },
          ),
    [idsKey, status, scheme, range.dateFrom, range.dateTo, page, size, aggregated],
    { skip: shopIds.length === 0, keepPreviousData: true },
  )

  const fetched = useMemo(() => data?.orders || [], [data])

  /* Statuslar bo'yicha haqiqiy sanoq — ro'yxatdan mustaqil, alohida endpoint */
  const counts = useApi(
    (signal) =>
      getOrdersCountByStatus(
        {
          shopIds,
          dateFrom: range.dateFrom,
          dateTo: range.dateTo,
        },
        { signal },
      ),
    [idsKey, range.dateFrom, range.dateTo],
    { skip: shopIds.length === 0, keepPreviousData: true },
  )

  const byStatus = counts.data?.byStatus
  const failedStatuses = counts.data?.failed || []
  const totalAllStatuses = counts.data?.total
  // Token faqat ayrim do'konlarga ruxsat berishi mumkin — 403 ni ajratamiz
  const forbidden = counts.data?.forbidden || data?.forbidden

  // Muammoli buyurtmalar API filtri yo'q — joriy sahifada hisoblaymiz
  const allOrders = useMemo(
    () => (problemOnly ? fetched.filter((o) => orderProblems(o).length > 0) : fetched),
    [fetched, problemOnly],
  )

  // Yig'ma rejimda sahifalash mahalliy
  const orders = useMemo(
    () => (aggregated || problemOnly ? allOrders.slice(page * size, (page + 1) * size) : allOrders),
    [allOrders, aggregated, problemOnly, page, size],
  )
  const problemCount = useMemo(
    () => allOrders.filter((o) => orderProblems(o).length > 0).length,
    [allOrders],
  )
  const total = aggregated || problemOnly ? allOrders.length : data?.totalAmount

  // Yuk xatiga faqat tasdiqlangan FBS buyurtmalarni qo'shish mumkin
  const selectableIds = useMemo(
    () => orders.filter((o) => o.scheme === 'FBS' && ['PACKING', 'PENDING_DELIVERY'].includes(o.status)).map((o) => o.id),
    [orders],
  )
  const selection = useSelection(selectableIds)

  const columns = useMemo(
    () => [
      {
        key: 'id',
        header: t('common.id'),
        render: (o) => (
          <div className="flex items-center gap-2">
            <span className="text-app tabular text-[13.5px] font-medium">#{o.id}</span>
            <SchemeBadge scheme={o.scheme} />
          </div>
        ),
      },
      {
        key: 'status',
        header: t('common.status'),
        render: (o) => <StatusBadge group="orderStatus" value={o.status} size="sm" />,
      },
      {
        key: 'dateCreated',
        header: t('common.created'),
        render: (o) => <span className="text-muted tabular text-[13px]">{dateTime(o.dateCreated, lang)}</span>,
      },
      {
        key: 'acceptUntil',
        header: t('orders.acceptUntil'),
        render: (o) =>
          o.status === 'CREATED' ? (
            <DeadlineCell deadline={deadline(o.acceptUntil, lang)} text={dateTime(o.acceptUntil, lang)} />
          ) : (
            <span className="text-muted tabular text-[13px]">{dateTime(o.acceptUntil, lang)}</span>
          ),
      },
      {
        key: 'deliverUntil',
        header: t('orders.deliverUntil'),
        render: (o) => <span className="text-muted tabular text-[13px]">{dateTime(o.deliverUntil, lang)}</span>,
      },
      {
        key: 'items',
        header: t('orders.items'),
        align: 'center',
        render: (o) => <span className="tabular">{num(o.orderItems?.length ?? 0, lang)}</span>,
      },
      {
        key: 'invoiceNumber',
        header: t('orders.invoiceNo'),
        render: (o) => <span className="text-muted tabular text-[13px]">{dash(o.invoiceNumber)}</span>,
      },
      {
        key: 'price',
        header: t('common.price'),
        align: 'right',
        render: (o) => <span className="tabular text-[13.5px] font-medium">{money(o.price, lang, { currency: false })}</span>,
      },
      {
        key: 'problem',
        header: t('orders.problem'),
        render: (o) => {
          const problems = orderProblems(o)
          if (!problems.length) return <span className="text-faint">—</span>
          return (
            <div className="flex flex-wrap gap-1">
              {problems.map((p) => (
                <Badge key={p} tone={ORDER_PROBLEM_TONE[p] || 'warning'} size="sm">
                  {t(`problems.type.${p}`)}
                </Badge>
              ))}
            </div>
          )
        },
      },
    ],
    [t, lang],
  )

  return (
    <>
      <PageHeader title={t('orders.title')} subtitle={t('orders.subtitle')}>
        {selection.count > 0 && (
          <>
            <span className="text-muted text-[13px]">{t('common.selected', { count: selection.count })}</span>
            <Button variant="ghost" size="sm" onClick={selection.clear}>
              {t('common.clearSelection')}
            </Button>
            <Button variant="primary" icon={FileText} onClick={() => setInvoiceOpen(true)}>
              {t('orders.createInvoice')}
            </Button>
          </>
        )}
      </PageHeader>

      {/* Har bir status bo'yicha aniq sanoq — «0» haqiqatan 0 ekanini ko'rsatadi.
          Manba: GET /v2/fbs/orders/count (ro'yxat hajmiga bog'liq emas) */}
      {(byStatus || counts.loading) && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {counts.loading && !byStatus && <Spinner size={14} />}
          {byStatus &&
            ORDER_STATUSES.map((s) => {
            const n = byStatus[s]
            const unknown = n === null || n === undefined
            const active = status === s
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(active ? '' : s)}
                title={unknown ? t('orders.countUnknown') : undefined}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12.5px] transition-colors',
                  active
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                    : 'hover:bg-surface-hover',
                  !active && !unknown && n === 0 && 'opacity-55',
                )}
              >
                <span>{t(`enums.orderStatus.${s}`)}</span>
                <span className={cx('tabular font-semibold', unknown && 'text-amber-600 dark:text-amber-400')}>
                  {unknown ? '?' : num(n, lang)}
                </span>
              </button>
            )
          })}
          {totalAllStatuses !== undefined && (
            <span className="text-faint tabular ml-1 text-[12.5px]">
              {t('common.total')}: {num(totalAllStatuses, lang)}
            </span>
          )}
        </div>
      )}

      {forbidden ? (
        <div className="mb-3 rounded-lg bg-red-50 p-3 dark:bg-red-950/40">
          <p className="text-[13px] font-medium text-red-800 dark:text-red-300">{t('orders.shopForbidden')}</p>
          <p className="mt-1 text-[12.5px] text-red-700/90 dark:text-red-300/80">
            {t('orders.shopForbiddenHint')}
          </p>
        </div>
      ) : (
        failedStatuses.length > 0 && (
          <p className="mb-3 rounded-lg bg-amber-50 p-3 text-[13px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            {t('orders.partialLoad', { statuses: failedStatuses.map((s) => t(`enums.orderStatus.${s}`)).join(', ') })}
          </p>
        )
      )}

      <PeriodLabel
        className="mb-3"
        dateFrom={range.dateFrom}
        dateTo={range.dateTo}
        count={allOrders.length}
      />

      <DevSource
        className="mb-4"
        compact
        sources={[
          {
            path: '/v2/fbs/orders',
            params: {
              shopIds,
              status: aggregated ? '11 ta status alohida' : status,
              scheme: scheme || undefined,
              page: aggregated ? 0 : page,
              size: aggregated ? 50 : size,
              dateFrom: range.dateFrom ? Math.floor(range.dateFrom / 1000) : undefined,
              dateTo: range.dateTo ? Math.floor(range.dateTo / 1000) : undefined,
            },
            count: allOrders.length,
            note: aggregated
              ? "status ko'rsatilmasa API bo'sh qaytaradi — har bir status alohida so'raladi"
              : 'SellerOrdersDto.orders + totalAmount',
          },
          {
            path: '/v2/fbs/orders/count',
            params: { shopIds, status: '11 ta status alohida' },
            count: totalAllStatuses,
            note: "Status chiplaridagi haqiqiy sonlar",
          },
          { path: '/v1/fbs/order/{orderId}', note: 'Buyurtma tafsiloti paneli' },
          { path: '/v1/fbs/order/return-reasons', note: 'Bekor qilish sabablari' },
          { path: '/v1/fbs/order/{orderId}/labels/print', note: 'Etiketka (base64 PDF)' },
          { method: 'POST', path: '/v1/fbs/order/{orderId}/confirm | cancel | identifier' },
          { method: 'POST', path: '/v1/dbs/order/{orderId}/delivering | completed | refund' },
        ]}
      />

      <FilterBar
        onReset={() => {
          setStatus('')
          setScheme('')
          setRange(DEFAULT_RANGE)
          setProblemOnly(false)
        }}
      >
        <Select
          label={t('common.status')}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          placeholder={t('common.all')}
          options={ORDER_STATUSES.map((v) => ({ value: v, label: t(`enums.orderStatus.${v}`) }))}
          wrapperClassName="w-48"
        />
        <Select
          label={t('orders.scheme')}
          value={scheme}
          onChange={(e) => setScheme(e.target.value)}
          placeholder={t('common.all')}
          options={ORDER_SCHEMES.map((v) => ({ value: v, label: v }))}
          wrapperClassName="w-32"
        />
        <DateRangeFilter value={range} onChange={setRange} />
        <div className="pb-1.5">
          <Switch
            checked={problemOnly}
            onChange={setProblemOnly}
            label={`${t('orders.problemOnly')}${problemCount ? ` (${problemCount})` : ''}`}
          />
        </div>
        <p className="text-faint pb-2 text-[12px]">{t('orders.problemHint', { days: STUCK_DAYS })}</p>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={orders}
        rowKey={(o) => o.id}
        loading={loading}
        error={error ? message(error) : null}
        onRetry={refetch}
        emptyIcon={ShoppingCart}
        emptyTitle={t('orders.noOrders')}
        emptyHint={t('orders.noOrdersHint')}
        selection={selectableIds.length ? selection : undefined}
        onRowClick={(o) => setOpenOrderId(o.id)}
        numbered
        indexOffset={page * size}
      />

      <Pagination page={page} size={size} total={total} onPage={setPage} onSize={setSize} sizes={PAGE_SIZES.filter((s) => s <= 50)} />

      <OrderDrawer
        orderId={openOrderId}
        onClose={() => setOpenOrderId(null)}
        onChanged={() => {
          refetch()
        }}
      />

      <CreateInvoiceModal
        open={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        orderIds={selection.ids}
        sellerId={activeShopId}
        onCreated={() => {
          selection.clear()
          refetch()
        }}
      />
    </>
  )
}

/* ══ Buyurtma tafsiloti (drawer) ════════════════════════════════ */

function OrderDrawer({ orderId, onClose, onChanged }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const toast = useToast()
  const message = useApiMessage()

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [identOpen, setIdentOpen] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [issueOpen, setIssueOpen] = useState(false)
  // POST /identifier javobi — API da identifikatorlarni o'qish uchun
  // alohida GET yo'q, shuning uchun oxirgi javobni saqlab ko'rsatamiz
  const [identifiers, setIdentifiers] = useState(null)

  const { data: order, loading, error, refetch } = useApi(
    (signal) => getOrder(orderId, { signal }),
    [orderId],
    { skip: !orderId },
  )

  useEffect(() => {
    setIdentifiers(null)
  }, [orderId])

  const done = (msg) => {
    toast.success(msg)
    refetch()
    onChanged?.()
  }

  const fail = (err) => toast.error(message(err))

  const confirmAction = useAction(async () => {
    await confirmOrder(orderId)
    setConfirmOpen(false)
    done(t('orders.confirmed'))
  })

  const deliveringAction = useAction(async () => {
    await dbsDelivering(orderId)
    done(t('orders.dbsDeliveringDone'))
  })

  const labelAction = useAction(async (size) => {
    const res = await getOrderLabel(orderId, size)
    const docs = res?.document || []
    if (!docs.length) throw new Error(t('common.noData'))
    docs.forEach((b64, i) => downloadBlob(base64ToBlob(b64), `uzum-order-${orderId}${docs.length > 1 ? `-${i + 1}` : ''}.pdf`))
    toast.success(t('orders.labelDownloaded'))
  })

  const isDbs = order?.scheme === 'DBS'
  const canConfirm = order?.status === 'CREATED'
  const canCancel = order && !['CANCELED', 'COMPLETED', 'RETURNED'].includes(order.status)

  return (
    <>
      <Drawer
        open={Boolean(orderId)}
        onClose={onClose}
        title={t('orders.orderNo', { id: orderId })}
        subtitle={order ? dateTime(order.dateCreated, lang) : undefined}
        footer={
          order && (
            <div className="flex w-full flex-wrap items-center justify-end gap-2">
              {/* Etiketka faqat FBS buyurtmalar uchun — DBS da API 400 qaytaradi */}
              {order.scheme !== 'DBS' && (
              <Dropdown
                trigger={({ toggle }) => (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Printer}
                    onClick={toggle}
                    loading={labelAction.pending}
                  >
                    {t('orders.label')}
                  </Button>
                )}
              >
                <MenuLabel>{t('orders.labelSizeLabel')}</MenuLabel>
                {LABEL_SIZES.map((sz) => (
                  <MenuItem key={sz} onClick={() => labelAction.run(sz).catch(fail)}>
                    {t(`enums.labelSize.${sz}`)}
                  </MenuItem>
                ))}
              </Dropdown>
              )}

              {order.identifierRequired && (
                <Button variant="secondary" size="sm" icon={Hash} onClick={() => setIdentOpen(true)}>
                  {t('orders.identifiers')}
                </Button>
              )}

              {isDbs && order.status === 'PACKING' && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Truck}
                  onClick={() => deliveringAction.run().catch(fail)}
                  loading={deliveringAction.pending}
                >
                  {t('orders.dbsDelivering')}
                </Button>
              )}

              {isDbs && ['DELIVERING', 'DELIVERED'].includes(order.status) && (
                <Button variant="success" size="sm" icon={PackageCheck} onClick={() => setIssueOpen(true)}>
                  {t('orders.dbsCompleted')}
                </Button>
              )}

              {isDbs && ['COMPLETED', 'DELIVERED'].includes(order.status) && (
                <Button variant="secondary" size="sm" icon={Undo2} onClick={() => setRefundOpen(true)}>
                  {t('orders.dbsRefund')}
                </Button>
              )}

              {canCancel && (
                <Button variant="outlineDanger" size="sm" icon={X} onClick={() => setCancelOpen(true)}>
                  {t('orders.cancel')}
                </Button>
              )}

              {canConfirm && (
                <Button variant="primary" size="sm" icon={Check} onClick={() => setConfirmOpen(true)}>
                  {t('orders.confirm')}
                </Button>
              )}
            </div>
          )
        }
      >
        {loading && (
          <div className="flex h-40 items-center justify-center">
            <Spinner size={24} />
          </div>
        )}

        {error && <ErrorState message={message(error)} onRetry={refetch} />}

        {order && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge group="orderStatus" value={order.status} />
              <SchemeBadge scheme={order.scheme} />
              {order.identifierRequired && (
                <Badge tone="warning" size="sm">
                  {t('orders.identifierRequired')}
                </Badge>
              )}
            </div>

            <Card padded={false} className="p-4">
              <FieldGrid cols={2}>
                <Field label={t('common.price')}>
                  <span className="tabular font-medium">{money(order.price, lang)}</span>
                </Field>
                <Field label={t('orders.invoiceNo')}>{dash(order.invoiceNumber)}</Field>
                <Field label={t('orders.acceptUntil')}>
                  <DeadlineCell deadline={deadline(order.acceptUntil, lang)} text={dateTime(order.acceptUntil, lang)} />
                </Field>
                <Field label={t('orders.deliverUntil')}>{dateTime(order.deliverUntil, lang)}</Field>
                <Field label={t('fields.dateCreated')}>{dateTime(order.dateCreated, lang)}</Field>
                <Field label={t('fields.acceptedDate')}>{dateTime(order.acceptedDate, lang)}</Field>
                <Field label={t('fields.deliveringDate')}>{dateTime(order.deliveringDate, lang)}</Field>
                <Field label={t('fields.deliveryDate')}>{dateTime(order.deliveryDate, lang)}</Field>
                <Field label={t('fields.deliveredToDeliveryPointDate')}>
                  {dateTime(order.deliveredToDeliveryPointDate, lang)}
                </Field>
                <Field label={t('fields.completedDate')}>{dateTime(order.completedDate, lang)}</Field>
                <Field label={t('fields.dateCancelled')}>{dateTime(order.dateCancelled, lang)}</Field>
                <Field label={t('fields.returnDate')}>{dateTime(order.returnDate, lang)}</Field>
                {order.cancelReason && <Field label={t('orders.cancelReason')}>{order.cancelReason}</Field>}
                {order.place && <Field label={t('orders.place')}>{order.place}</Field>}
              </FieldGrid>
            </Card>

            {order.deliveryInfo && (
              <section>
                <h3 className="text-app mb-2 text-[13px] font-semibold">{t('orders.customer')}</h3>
                <Card padded={false} className="p-4">
                  <FieldGrid cols={2}>
                    <Field label={t('orders.customerName')}>{dash(order.deliveryInfo.customerFullname)}</Field>
                    <Field label={t('orders.phone')}>
                      {order.deliveryInfo.customerPhone ? (
                        <a href={`tel:${order.deliveryInfo.customerPhone}`} className="text-brand-600 dark:text-brand-400">
                          {order.deliveryInfo.customerPhone}
                        </a>
                      ) : (
                        '—'
                      )}
                    </Field>
                    <Field label={t('orders.address')} className="sm:col-span-2">
                      {dash(order.deliveryInfo.deliveryAddress)}
                    </Field>
                    {order.deliveryInfo.deliveryComment && (
                      <Field label={t('orders.deliveryComment')} className="sm:col-span-2">
                        {order.deliveryInfo.deliveryComment}
                      </Field>
                    )}
                  </FieldGrid>
                </Card>
              </section>
            )}

            {(order.stock || order.dropOffPoint || order.timeSlot) && (
              <section>
                <h3 className="text-app mb-2 text-[13px] font-semibold">{t('nav.groupLogistics')}</h3>
                <Card padded={false} className="p-4">
                  <FieldGrid cols={2}>
                    {order.stock && <Field label={t('orders.stock')}>{order.stock.title || order.stock.address}</Field>}
                    {order.dropOffPoint && <Field label={t('orders.dropOffPoint')}>{order.dropOffPoint.address}</Field>}
                    {order.timeSlot && (
                      <Field label={t('orders.timeSlot')}>
                        {order.timeSlot.timeFrom} – {order.timeSlot.timeTo}
                      </Field>
                    )}
                  </FieldGrid>
                </Card>
              </section>
            )}

            <section>
              <h3 className="text-app mb-2 text-[13px] font-semibold">
                {t('orders.items')}
                <span className="text-faint ml-1.5 font-normal">({order.orderItems?.length ?? 0})</span>
              </h3>
              {!order.orderItems?.length ? (
                <EmptyState compact title={t('common.noData')} hint={null} />
              ) : (
                <ul className="space-y-2">
                  {order.orderItems.map((item, i) => (
                    <li key={item.id ?? i} className="border-app rounded-lg border p-3">
                      <div className="flex items-start gap-3">
                        <ProductCell
                          image={item.productImage?.photo?.[540]?.high || item.productImage?.url}
                          title={item.productTitle || item.skuTitle}
                          subtitle={[item.skuCharTitle, item.skuCharValue].filter(Boolean).join(': ')}
                          size={44}
                        />
                        <div className="ml-auto shrink-0 text-right">
                          <p className="text-app tabular text-[13.5px] font-medium">
                            {money(itemRevenue(item) || item.purchasePrice, lang, { currency: false })}
                          </p>
                          <p className="text-faint tabular text-[12px]">
                            {t('common.amount')}: {num(item.amount ?? 1, lang)}
                          </p>
                        </div>
                      </div>
                      <div className="text-faint mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px]">
                        {item.skuTitle && <span>{t('fields.skuTitle')}: {item.skuTitle}</span>}
                        {item.sellerSkuCode && <span>{t('fields.sellerSkuCode')}: {item.sellerSkuCode}</span>}
                        {item.productId != null && <span>{t('fields.productId')}: {item.productId}</span>}
                        {item.commission != null && (
                          <span>{t('fields.commission')}: {money(item.commission, lang, { currency: false })}</span>
                        )}
                        {item.sellerProfit != null && (
                          <span>{t('fields.sellerProfit')}: {money(item.sellerProfit, lang, { currency: false })}</span>
                        )}
                        {item.logisticDeliveryFee != null && (
                          <span>{t('fields.logisticDeliveryFee')}: {money(item.logisticDeliveryFee, lang, { currency: false })}</span>
                        )}
                        {item.returnCause && <span>{t('fields.returnCause')}: {item.returnCause}</span>}
                      </div>

                      <DataViewer data={item} title={t('common.allFields')} className="mt-3" />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {identifiers && identifiers.length > 0 && (
              <section>
                <h3 className="text-app mb-2 text-[13px] font-semibold">{t('orders.identifiersCurrent')}</h3>
                <Card padded={false} className="p-4">
                  <ul className="space-y-3">
                    {identifiers.map((info, i) => (
                      <li key={i} className="border-app border-b pb-3 last:border-0 last:pb-0">
                        <div className="flex items-center gap-2">
                          <Badge size="sm" dot={false} className="font-mono">
                            {info.type || '—'}
                          </Badge>
                          {info.required && (
                            <Badge tone="warning" size="sm" dot={false}>
                              {t('fields.required')}
                            </Badge>
                          )}
                        </div>
                        {info.values?.length ? (
                          <ul className="mt-1.5 flex flex-wrap gap-1.5">
                            {info.values.map((v, vi) => (
                              <li
                                key={vi}
                                className="bg-surface-2 text-app rounded-md px-2 py-0.5 font-mono text-[12px]"
                              >
                                {v}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-faint mt-1 text-[12.5px]">{t('orders.noIdentifiers')}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>
            )}

            <DataViewer data={order} defaultOpen={false} />
          </div>
        )}
      </Drawer>

      {/* Tasdiqlash */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => confirmAction.run().catch(fail)}
        loading={confirmAction.pending}
        title={t('orders.confirmTitle')}
        body={t('orders.confirmBody', { id: orderId })}
        confirmLabel={t('orders.confirm')}
        variant="primary"
      />

      {/* Bekor qilish */}
      <CancelOrderModal
        open={cancelOpen}
        orderId={orderId}
        onClose={() => setCancelOpen(false)}
        onDone={() => {
          setCancelOpen(false)
          done(t('orders.canceled'))
        }}
      />

      {/* Identifikatorlar */}
      <IdentifiersModal
        open={identOpen}
        orderId={orderId}
        items={order?.orderItems || []}
        onClose={() => setIdentOpen(false)}
        onDone={(result) => {
          setIdentOpen(false)
          setIdentifiers(Array.isArray(result) ? result : null)
          done(t('orders.identifiersSaved'))
        }}
      />

      {/* DBS: topshirish kodi */}
      <IssueCodeModal
        open={issueOpen}
        orderId={orderId}
        onClose={() => setIssueOpen(false)}
        onDone={() => {
          setIssueOpen(false)
          done(t('orders.dbsCompletedDone'))
        }}
      />

      {/* DBS: qaytarish */}
      <RefundConfirm
        open={refundOpen}
        orderId={orderId}
        onClose={() => setRefundOpen(false)}
        onDone={() => {
          setRefundOpen(false)
          done(t('orders.dbsRefundDone'))
        }}
      />
    </>
  )
}

/* ══ Bekor qilish modali ════════════════════════════════════════ */

function CancelOrderModal({ open, orderId, onClose, onDone }) {
  const { t } = useTranslation()
  const toast = useToast()
  const message = useApiMessage()
  const [reason, setReason] = useState(CANCEL_REASONS[0])
  const [comment, setComment] = useState('')

  // Sabablar ro'yxatini API dan olamiz; so'rov muvaffaqiyatsiz bo'lsa —
  // spetsifikatsiyadagi doimiy ro'yxatga qaytamiz.
  const reasons = useApi((signal) => getReturnReasons({ signal }), [], { skip: !open })
  const reasonList = useMemo(() => {
    const raw = reasons.data
    const fromApi = raw?.reasons || (Array.isArray(raw) ? raw : [])
    const codes = fromApi.map((r) => r.reason ?? r).filter(Boolean)
    return codes.length ? codes : CANCEL_REASONS
  }, [reasons.data])

  const { run, pending } = useAction(async () => {
    await cancelOrder(orderId, { reason, comment: comment || undefined })
    onDone()
  })

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={() => run().catch((e) => toast.error(message(e)))}
      loading={pending}
      title={t('orders.cancelTitle')}
      body={t('orders.cancelBody', { id: orderId })}
      confirmLabel={t('orders.cancel')}
    >
      <div className="space-y-3">
        <Select
          label={t('common.reason')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          options={reasonList.map((v) => ({ value: v, label: t(`enums.cancelReason.${v}`, { defaultValue: v }) }))}
        />
        <Textarea
          label={`${t('common.comment')} (${t('common.optional')})`}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
        />
      </div>
    </ConfirmDialog>
  )
}

/* ══ Identifikatorlar modali ════════════════════════════════════ */

function IdentifiersModal({ open, orderId, items, onClose, onDone }) {
  const { t } = useTranslation()
  const toast = useToast()
  const message = useApiMessage()
  const [values, setValues] = useState({})

  useEffect(() => {
    if (open) setValues({})
  }, [open, orderId])

  const { run, pending } = useAction(async () => {
    const payload = Object.entries(values)
      .map(([orderItemId, raw]) => ({
        orderItemId: Number(orderItemId),
        values: String(raw)
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      }))
      .filter((x) => x.values.length)
    if (!payload.length) return
    const result = await setOrderIdentifiers(orderId, payload)
    onDone(result)
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={t('orders.identifiersTitle')}
      subtitle={t('orders.identifiersHint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => run().catch((e) => toast.error(message(e)))} loading={pending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      {items.length === 0 ? (
        <EmptyState compact title={t('common.noData')} hint={null} />
      ) : (
        <div className="space-y-4">
          {items.map((item, i) => (
            <div key={item.id ?? i}>
              <p className="text-app mb-1.5 text-[13px] font-medium">
                {item.productTitle || item.skuTitle}
                <span className="text-faint ml-1.5 font-normal">
                  × {num(item.amount ?? 1)}
                </span>
              </p>
              <Textarea
                rows={Math.min(Number(item.amount) || 1, 5)}
                value={values[item.id] || ''}
                onChange={(e) => setValues((v) => ({ ...v, [item.id]: e.target.value }))}
                placeholder="IMEI / SN"
                className="font-mono text-[12.5px]"
              />
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

/* ══ DBS: topshirish kodi ═══════════════════════════════════════ */

function IssueCodeModal({ open, orderId, onClose, onDone }) {
  const { t } = useTranslation()
  const toast = useToast()
  const message = useApiMessage()
  const [code, setCode] = useState('')

  useEffect(() => {
    if (open) setCode('')
  }, [open, orderId])

  const { run, pending } = useAction(async () => {
    await dbsCompleted(orderId, code ? Number(code) : undefined)
    onDone()
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={t('orders.dbsCompleted')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button variant="success" onClick={() => run().catch((e) => toast.error(message(e)))} loading={pending}>
            {t('common.confirm')}
          </Button>
        </>
      }
    >
      <Input
        type="number"
        label={t('orders.issueCode')}
        hint={t('orders.issueCodeHint')}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="tabular"
        autoFocus
      />
    </Modal>
  )
}

/* ══ DBS: qaytarish ═════════════════════════════════════════════ */

function RefundConfirm({ open, orderId, onClose, onDone }) {
  const { t } = useTranslation()
  const toast = useToast()
  const message = useApiMessage()

  const { run, pending } = useAction(async () => {
    await dbsRefund(orderId)
    onDone()
  })

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={() => run().catch((e) => toast.error(message(e)))}
      loading={pending}
      title={t('orders.dbsRefund')}
      body={t('orders.dbsRefundBody', { id: orderId })}
      confirmLabel={t('orders.dbsRefund')}
    />
  )
}
