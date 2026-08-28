import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Printer, FileCheck2, XCircle, Package, CalendarClock, ListChecks } from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useApi, useApiMessage, useAction } from '../hooks/useApi'
import {
  getFbsInvoices,
  getFbsInvoice,
  getFbsInvoiceOrders,
  cancelFbsInvoice,
  printFbsInvoice,
  getFbsInvoiceClosingDocs,
  updateFbsInvoiceContent,
} from '../api/endpoints'
import { FBS_INVOICE_STATUSES, PAGE_SIZES } from '../api/constants'
import { money, num, dateTime, base64ToBlob, openBlob, dash, cx } from '../utils/format'
import {
  PageHeader,
  Card,
  DataTable,
  Pagination,
  Button,
  Badge,
  Drawer,
  Modal,
  ConfirmDialog,
  Checkbox,
  Field,
  FieldGrid,
  Spinner,
  ErrorState,
  EmptyState,
} from '../components/ui'
import { StatusBadge, ProductCell, FilterBar } from '../components/common'
import { DevSource } from '../components/DevSource'
import { DataViewer } from '../components/DataViewer'
import { CreateInvoiceModal } from '../components/CreateInvoiceModal'

export default function FbsInvoices() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const apiLang = lang === 'ru' ? 'ru' : 'uz'
  const message = useApiMessage()

  // statuses — API'da majburiy parametr, shuning uchun boshida hammasi tanlangan
  const [statuses, setStatuses] = useState(FBS_INVOICE_STATUSES)
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)
  const [openId, setOpenId] = useState(null)

  const statusKey = statuses.join(',')

  useEffect(() => {
    setPage(0)
  }, [statusKey])

  const { data, loading, error, refetch } = useApi(
    (signal) => getFbsInvoices({ statuses, page, size, lang: apiLang }, { signal }),
    [statusKey, page, size, apiLang],
    { skip: statuses.length === 0, keepPreviousData: true },
  )

  const invoices = useMemo(() => (Array.isArray(data) ? data : data?.invoices || []), [data])

  const toggleStatus = (s) =>
    setStatuses((list) => (list.includes(s) ? list.filter((x) => x !== s) : [...list, s]))

  const columns = useMemo(
    () => [
      {
        key: 'number',
        header: t('fbsInvoices.number'),
        render: (inv) => <span className="text-app tabular text-[13.5px] font-medium">{dash(inv.number ?? inv.id)}</span>,
      },
      {
        key: 'status',
        header: t('common.status'),
        render: (inv) => (
          <StatusBadge
            group="fbsInvoiceStatus"
            value={inv.status?.value ?? inv.status}
            fallback={inv.status?.text}
            size="sm"
          />
        ),
      },
      {
        key: 'orders',
        header: t('fbsInvoices.ordersCount'),
        align: 'right',
        render: (inv) => (
          <span className="tabular">
            {num(inv.numberAcceptedOrders ?? 0, lang)} / {num(inv.numberOrders ?? 0, lang)}
          </span>
        ),
      },
      {
        key: 'fullPrice',
        header: t('fbsInvoices.fullPrice'),
        align: 'right',
        render: (inv) => <span className="tabular text-[13.5px] font-medium">{money(inv.fullPrice, lang, { currency: false })}</span>,
      },
      {
        key: 'dateCreated',
        header: t('common.created'),
        render: (inv) => <span className="text-muted tabular text-[13px]">{dateTime(inv.dateCreated, lang)}</span>,
      },
      {
        key: 'timeSlot',
        header: t('orders.timeSlot'),
        render: (inv) =>
          inv.timeSlot ? (
            <span className="tabular text-[13px]">
              {inv.timeSlot.timeFrom} – {inv.timeSlot.timeTo}
            </span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      {
        key: 'dropOffPoint',
        header: t('orders.dropOffPoint'),
        nowrap: false,
        render: (inv) => <span className="text-muted text-[13px]">{dash(inv.dropOffPoint?.address)}</span>,
      },
      {
        key: 'ettn',
        header: t('fbsInvoices.ettn'),
        render: (inv) =>
          inv.ettn?.status ? (
            <Badge size="sm" dot={false}>
              {inv.ettn.status}
            </Badge>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
    ],
    [t, lang],
  )

  return (
    <>
      <PageHeader title={t('fbsInvoices.title')} subtitle={t('fbsInvoices.subtitle')} />

      <DevSource
        className="mb-4"
        compact
        sources={[
          {
            path: '/v1/fbs/invoice',
            params: { statuses, page, size, 'Accept-Language': apiLang },
            count: invoices.length,
            note: 'statuses majburiy parametr',
          },
          { path: '/v1/fbs/invoice/{id}', note: 'Yuk xati tafsiloti' },
          { path: '/v1/fbs/invoice/{id}/orders', note: 'Yuk xatidagi buyurtmalar' },
          { path: '/v1/fbs/invoice/{id}/print | closing-documents', note: 'Dalolatnomalar (base64 PDF)' },
          { path: '/v1/fbs/invoice/dop/drop-off-points | time-slot', note: 'Yaratish sehrgari' },
          { method: 'POST', path: '/v1/fbs/invoice | cancel | update-content | dop/time-slot' },
        ]}
      />

      <FilterBar onReset={() => setStatuses(FBS_INVOICE_STATUSES)}>
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-muted text-[13px] font-medium">{t('common.status')}</span>
          {FBS_INVOICE_STATUSES.map((s) => (
            <Checkbox
              key={s}
              checked={statuses.includes(s)}
              onChange={() => toggleStatus(s)}
              label={t(`enums.fbsInvoiceStatus.${s}`)}
            />
          ))}
        </div>
      </FilterBar>

      {statuses.length === 0 ? (
        <Card>
          <EmptyState title={t('common.noData')} hint={t('common.noDataHint')} />
        </Card>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={invoices}
            rowKey={(inv) => inv.id}
            loading={loading}
            error={error ? message(error) : null}
            onRetry={refetch}
            emptyIcon={FileText}
            onRowClick={(inv) => setOpenId(inv.id)}
            numbered
            indexOffset={page * size}
          />
          <Pagination page={page} size={size} onPage={setPage} onSize={setSize} sizes={PAGE_SIZES} hasMore={invoices.length >= size} />
        </>
      )}

      <InvoiceDrawer invoiceId={openId} onClose={() => setOpenId(null)} onChanged={refetch} />
    </>
  )
}

/* ══ Yuk xati tafsiloti ═════════════════════════════════════════ */

function InvoiceDrawer({ invoiceId, onClose, onChanged }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const apiLang = lang === 'ru' ? 'ru' : 'uz'
  const toast = useToast()
  const message = useApiMessage()
  const { activeShopId } = useAuth()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [slotOpen, setSlotOpen] = useState(false)
  const [contentOpen, setContentOpen] = useState(false)

  const invoice = useApi((signal) => getFbsInvoice(invoiceId, apiLang, { signal }), [invoiceId, apiLang], {
    skip: !invoiceId,
  })

  const orders = useApi((signal) => getFbsInvoiceOrders(invoiceId, apiLang, { signal }), [invoiceId, apiLang], {
    skip: !invoiceId,
  })

  const inv = invoice.data
  const orderList = useMemo(
    () => (Array.isArray(orders.data) ? orders.data : orders.data?.orders || []),
    [orders.data],
  )

  const openPdf = async (loader, label) => {
    try {
      const res = await loader()
      const b64 = res?.document
      if (!b64) throw new Error(t('common.noData'))
      openBlob(base64ToBlob(b64))
    } catch (err) {
      toast.error(`${label}: ${message(err)}`)
    }
  }

  const printAct = useAction(() => openPdf(() => printFbsInvoice(invoiceId), t('fbsInvoices.printAct')))
  const closingDocs = useAction(() =>
    openPdf(() => getFbsInvoiceClosingDocs(invoiceId), t('fbsInvoices.closingDocs')),
  )

  const cancelAction = useAction(async () => {
    await cancelFbsInvoice(invoiceId, apiLang)
    setCancelOpen(false)
    toast.success(t('fbsInvoices.canceled'))
    invoice.refetch()
    onChanged?.()
  })

  const status = inv?.status?.value ?? inv?.status
  const canCancel = status === 'CREATED'

  return (
    <>
      <Drawer
        open={Boolean(invoiceId)}
        onClose={onClose}
        title={`${t('fbsInvoices.invoice')} №${inv?.number ?? invoiceId ?? ''}`}
        subtitle={inv ? dateTime(inv.dateCreated, lang) : undefined}
        footer={
          inv && (
            <div className="flex w-full flex-wrap justify-end gap-2">
              <Button variant="secondary" size="sm" icon={Printer} onClick={() => printAct.run()} loading={printAct.pending}>
                {t('fbsInvoices.printAct')}
              </Button>
              {status === 'ACCEPTED' && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={FileCheck2}
                  onClick={() => closingDocs.run()}
                  loading={closingDocs.pending}
                >
                  {t('fbsInvoices.closingDocs')}
                </Button>
              )}
              {canCancel && (
                <Button variant="secondary" size="sm" icon={ListChecks} onClick={() => setContentOpen(true)}>
                  {t('fbsInvoices.updateContent')}
                </Button>
              )}
              {canCancel && (
                <Button variant="secondary" size="sm" icon={CalendarClock} onClick={() => setSlotOpen(true)}>
                  {t('fbsInvoices.changeSlot')}
                </Button>
              )}
              {canCancel && (
                <Button variant="outlineDanger" size="sm" icon={XCircle} onClick={() => setCancelOpen(true)}>
                  {t('common.cancel')}
                </Button>
              )}
            </div>
          )
        }
      >
        {invoice.loading && (
          <div className="flex h-40 items-center justify-center">
            <Spinner size={24} />
          </div>
        )}
        {invoice.error && <ErrorState message={message(invoice.error)} onRetry={invoice.refetch} />}

        {inv && (
          <div className="space-y-5">
            <StatusBadge group="fbsInvoiceStatus" value={status} fallback={inv.status?.text} />

            <Card padded={false} className="p-4">
              <FieldGrid cols={2}>
                <Field label={t('fbsInvoices.ordersCount')}>
                  <span className="tabular">
                    {num(inv.numberAcceptedOrders ?? 0, lang)} / {num(inv.numberOrders ?? 0, lang)}
                  </span>
                </Field>
                <Field label={t('fbsInvoices.fullPrice')}>
                  <span className="tabular font-medium">{money(inv.fullPrice, lang)}</span>
                </Field>
                <Field label={t('fbsInvoices.acceptedPrice')}>
                  <span className="tabular">{money(inv.acceptedPrice, lang)}</span>
                </Field>
                <Field label={t('common.updated')}>{dateTime(inv.dateUpdated, lang)}</Field>
                {inv.acceptanceStartedDate && (
                  <Field label={t('fbsInvoices.acceptanceStarted')}>{dateTime(inv.acceptanceStartedDate, lang)}</Field>
                )}
                {inv.acceptedDate && <Field label={t('fbsInvoices.acceptedDate')}>{dateTime(inv.acceptedDate, lang)}</Field>}
                {inv.timeSlot && (
                  <Field label={t('orders.timeSlot')}>
                    {inv.timeSlot.timeFrom} – {inv.timeSlot.timeTo}
                  </Field>
                )}
                {inv.dropOffPoint && <Field label={t('orders.dropOffPoint')}>{inv.dropOffPoint.address}</Field>}
                {inv.stock && <Field label={t('orders.stock')}>{inv.stock.title || inv.stock.address}</Field>}
                {inv.ettn?.number && <Field label={t('fbsInvoices.ettn')}>{inv.ettn.number}</Field>}
              </FieldGrid>
            </Card>

            <section>
              <h3 className="text-app mb-2 text-[13px] font-semibold">
                {t('fbsInvoices.invoiceOrders')}
                <span className="text-faint ml-1.5 font-normal">({orderList.length})</span>
              </h3>

              {orders.loading && (
                <div className="flex h-24 items-center justify-center">
                  <Spinner />
                </div>
              )}
              {orders.error && <ErrorState message={message(orders.error)} onRetry={orders.refetch} compact />}
              {!orders.loading && !orders.error && orderList.length === 0 && (
                <EmptyState compact icon={Package} title={t('common.noData')} hint={null} />
              )}

              <ul className="space-y-3">
                {orderList.map((o) => (
                  <li key={o.orderId} className="border-app rounded-lg border p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-app tabular text-[13.5px] font-medium">#{o.orderId}</span>
                      <span className="tabular text-[13px] font-medium">{money(o.fullPrice, lang, { currency: false })}</span>
                    </div>
                    <ul className="space-y-2">
                      {(o.items || []).map((item, i) => (
                        <li key={`${item.skuId}-${i}`} className="flex items-center gap-3">
                          <ProductCell
                            image={item.photo?.photo?.[240]?.high || item.photo?.url}
                            title={item.title || item.skuTitle}
                            subtitle={item.barcode}
                            size={32}
                          />
                          <div className="ml-auto shrink-0 text-right">
                            <p className="tabular text-[12.5px]">
                              × {num(item.amount, lang)} · {money(item.price, lang, { currency: false })}
                            </p>
                            {item.status && (
                              <span className={cx('text-faint text-[11px]')}>{item.status?.text ?? item.status}</span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>

            <DataViewer data={inv} />
            {orderList.length > 0 && (
              <DataViewer data={orderList} title={`${t('common.allFields')} — ${t('fbsInvoices.invoiceOrders')}`} />
            )}
          </div>
        )}
      </Drawer>

      <CreateInvoiceModal
        mode="slot"
        open={slotOpen}
        onClose={() => setSlotOpen(false)}
        orderIds={orderList.map((o) => o.orderId)}
        sellerId={activeShopId}
        onCreated={() => {
          invoice.refetch()
          onChanged?.()
        }}
      />

      <UpdateContentModal
        open={contentOpen}
        onClose={() => setContentOpen(false)}
        invoiceId={invoiceId}
        sellerId={activeShopId}
        orders={orderList}
        onDone={() => {
          setContentOpen(false)
          invoice.refetch()
          orders.refetch()
          onChanged?.()
        }}
      />

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => cancelAction.run().catch((e) => toast.error(message(e)))}
        loading={cancelAction.pending}
        title={t('fbsInvoices.cancelTitle')}
        body={t('fbsInvoices.cancelBody', { id: inv?.number ?? invoiceId })}
        confirmLabel={t('common.cancel')}
      />
    </>
  )
}

/* ══ Yuk xati tarkibini o'zgartirish ════════════════════════════ */

/**
 * POST /v1/fbs/invoice/{invoiceId}/update-content — bitta buyurtmani
 * yuk xatidan chiqarib tashlaydi (yoki qo'shadi). API bir vaqtda faqat
 * bitta customerOrderId qabul qiladi.
 */
function UpdateContentModal({ open, onClose, invoiceId, sellerId, orders, onDone }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const apiLang = lang === 'ru' ? 'ru' : 'uz'
  const toast = useToast()
  const message = useApiMessage()
  const [picked, setPicked] = useState(null)

  useEffect(() => {
    if (open) setPicked(null)
  }, [open, invoiceId])

  const { run, pending } = useAction(async () => {
    await updateFbsInvoiceContent(
      invoiceId,
      {
        sellerId,
        invoiceId,
        customerOrderId: picked,
        idempotencyKey: `${invoiceId}-${picked}`,
      },
      apiLang,
    )
    onDone()
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={t('fbsInvoices.updateContent')}
      subtitle={t('fbsInvoices.invoiceOrders')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => run().catch((e) => toast.error(message(e)))}
            loading={pending}
            disabled={!picked}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      {orders.length === 0 ? (
        <EmptyState compact title={t('common.noData')} hint={null} />
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => (
            <li key={o.orderId}>
              <button
                type="button"
                onClick={() => setPicked(o.orderId)}
                className={cx(
                  'flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors',
                  picked === o.orderId ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-950/30' : 'hover:bg-surface-hover',
                )}
              >
                <span className="text-app tabular text-[13.5px] font-medium">#{o.orderId}</span>
                <span className="text-muted tabular text-[13px]">
                  {t('orders.itemsCount', { count: o.items?.length ?? 0 })} · {money(o.fullPrice, lang, { currency: false })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
