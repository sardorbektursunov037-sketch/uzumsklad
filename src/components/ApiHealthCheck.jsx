import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PlayCircle, CheckCircle2, XCircle, MinusCircle, Loader2, Lock, AlertTriangle } from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import { useApiMessage } from '../hooks/useApi'
import { cx } from '../utils/format'
import { Card, CardHeader, Button, Badge } from './ui'
import {
  getShops,
  getProducts,
  getBarcodeTypes,
  getStocks,
  getStocksLegacy,
  getOrders,
  getOrdersCount,
  getOrder,
  getReturnReasons,
  getOrderLabel,
  getFbsInvoices,
  getFbsInvoice,
  getFbsInvoiceOrders,
  getFbsInvoiceClosingDocs,
  printFbsInvoice,
  getDropOffPoints,
  getTimeSlots,
  getShopInvoices,
  getInvoiceProducts,
  getAllInvoices,
  getShopReturns,
  getShopReturn,
  getReturns,
  getFinanceOrders,
  getExpenses,
} from '../api/endpoints'

/** Javobdagi yozuvlar sonini taxminlaydi — turli DTO lar uchun */
function countOf(res) {
  if (res === null || res === undefined) return null
  if (Array.isArray(res)) return res.length
  if (typeof res === 'number') return res
  if (typeof res !== 'object') return null
  for (const k of [
    'orders',
    'orderItems',
    'productList',
    'skuAmountList',
    'payments',
    'returnItems',
    'invoices',
    'barcodeTypes',
    'reasons',
    'dropOffPoints',
    'timeSlots',
    'document',
  ]) {
    const v = res[k]
    if (Array.isArray(v)) return v.length
  }
  return Object.keys(res).length ? 1 : 0
}

/**
 * Har bir Uzum endpointini jonli chaqirib, holatini ko'rsatadi.
 *
 * Faqat O'QISH amallari bajariladi. Yozish amallari (tasdiqlash, bekor qilish,
 * qoldiq yangilash, yuk xati yaratish) ro'yxatda ko'rinadi, lekin haqiqiy
 * ma'lumotni o'zgartirmaslik uchun ishga tushirilmaydi.
 */
const WRITE_ONLY = [
  'POST /v1/product/{shopId}/sendPriceData',
  'POST /v1/product/shop/{shopId}/barcodes/print',
  'POST /v2/fbs/sku/stocks',
  'POST /v1/fbs/order/{orderId}/confirm',
  'POST /v1/fbs/order/{orderId}/cancel',
  'POST /v1/fbs/order/{orderId}/identifier',
  'POST /v1/dbs/order/{orderId}/delivering',
  'POST /v1/dbs/order/{orderId}/completed',
  'POST /v1/dbs/order/{orderId}/refund',
  'POST /v1/fbs/invoice',
  'POST /v1/fbs/invoice/{invoiceId}/update-content',
  'POST /v1/fbs/invoice/{invoiceId}/cancel',
  'POST /v1/fbs/invoice/dop/time-slot',
]

export function ApiHealthCheck() {
  const { t } = useTranslation()
  const { activeShopId, shopIds } = useAuth()
  const message = useApiMessage()

  const [rows, setRows] = useState([])
  const [running, setRunning] = useState(false)
  const cancelRef = useRef(false)

  const run = useCallback(async () => {
    setRunning(true)
    cancelRef.current = false

    const ids = shopIds.length ? shopIds : activeShopId ? [activeShopId] : []
    const shopId = activeShopId ?? ids[0]

    /** Zanjirli sinovlar uchun oldingi javoblardan olingan ID lar */
    const ctx = {}

    const probes = [
      { path: 'GET /v1/shops', run: () => getShops().then((r) => ((ctx.shops = r), r)) },
      { path: 'GET /v1/product/shop/{shopId}', run: () => getProducts(shopId, { size: 1, page: 0 }) },
      { path: 'GET /v1/product/barcodes/types', run: () => getBarcodeTypes() },
      { path: 'GET /v3/fbs/sku/stocks', run: () => getStocks({ page: 0, size: 5 }) },
      {
        path: 'GET /v2/fbs/sku/stocks',
        run: () => getStocksLegacy(),
        note: 'eskirgan versiya',
        // Uzum bu endpointni olib tashlagan — 404 kutilgan natija
        expect404: true,
      },
      {
        path: 'GET /v2/fbs/orders',
        run: () =>
          getOrders({ shopIds: ids, status: 'COMPLETED', page: 0, size: 5 }).then((r) => {
            ctx.orderId = r?.orders?.[0]?.id
            // Etiketka faqat FBS uchun ishlaydi — alohida FBS buyurtma qidiramiz
            ctx.fbsOrderId = (r?.orders || []).find((o) => o.scheme === 'FBS')?.id
            return r
          }),
        note: 'status=COMPLETED',
      },
      { path: 'GET /v2/fbs/orders/count', run: () => getOrdersCount({ shopIds: ids, status: 'COMPLETED' }) },
      {
        path: 'GET /v1/fbs/order/{orderId}',
        needs: () => ctx.orderId,
        run: () => getOrder(ctx.orderId),
      },
      { path: 'GET /v1/fbs/order/return-reasons', run: () => getReturnReasons() },
      {
        path: 'GET /v1/fbs/order/{orderId}/labels/print',
        needs: () => ctx.fbsOrderId,
        run: () => getOrderLabel(ctx.fbsOrderId, 'LARGE'),
        note: 'faqat FBS buyurtmalar uchun',
      },
      {
        path: 'GET /v1/fbs/invoice',
        run: () =>
          getFbsInvoices({ statuses: ['CREATED', 'ACCEPTANCE_IN_PROGRESS', 'ACCEPTED', 'CANCELLED'], page: 0, size: 5 }).then(
            (r) => {
              const list = Array.isArray(r) ? r : r?.invoices || []
              ctx.invoiceId = list[0]?.id
              return r
            },
          ),
      },
      { path: 'GET /v1/fbs/invoice/{id}', needs: () => ctx.invoiceId, run: () => getFbsInvoice(ctx.invoiceId, 'uz') },
      {
        path: 'GET /v1/fbs/invoice/{id}/orders',
        needs: () => ctx.invoiceId,
        run: () => getFbsInvoiceOrders(ctx.invoiceId, 'uz'),
      },
      {
        path: 'GET /v1/fbs/invoice/{id}/closing-documents',
        needs: () => ctx.invoiceId,
        run: () => getFbsInvoiceClosingDocs(ctx.invoiceId),
      },
      { path: 'GET /v1/fbs/invoice/{id}/print', needs: () => ctx.invoiceId, run: () => printFbsInvoice(ctx.invoiceId) },
      {
        path: 'GET /v1/fbs/invoice/dop/drop-off-points',
        needs: () => ctx.orderId,
        run: () => getDropOffPoints([ctx.orderId], 'uz'),
      },
      {
        path: 'GET /v1/fbs/invoice/dop/time-slot',
        needs: () => ctx.dopId && ctx.orderId,
        run: () => getTimeSlots(ctx.dopId, [ctx.orderId], 'uz'),
        note: 'punkt UUID kerak',
      },
      {
        path: 'GET /v1/shop/{shopId}/invoice',
        run: () =>
          getShopInvoices(shopId, { page: 0, size: 5 }).then((r) => {
            ctx.fboInvoiceId = (Array.isArray(r) ? r : [])[0]?.id
            return r
          }),
      },
      {
        path: 'GET /v1/shop/{shopId}/invoice/products',
        needs: () => ctx.fboInvoiceId,
        run: () => getInvoiceProducts(shopId, ctx.fboInvoiceId),
      },
      { path: 'GET /v1/invoice', run: () => getAllInvoices({ page: 0, size: 5 }) },
      {
        path: 'GET /v1/shop/{shopId}/return',
        run: () =>
          getShopReturns(shopId, { page: 0, size: 5 }).then((r) => {
            const list = Array.isArray(r) ? r : r ? [r] : []
            ctx.returnId = list[0]?.id
            return r
          }),
      },
      {
        path: 'GET /v1/shop/{shopId}/return/{returnId}',
        needs: () => ctx.returnId,
        run: () => getShopReturn(shopId, ctx.returnId),
      },
      { path: 'GET /v1/return', run: () => getReturns({ page: 0, size: 5 }) },
      { path: 'GET /v1/finance/orders', run: () => getFinanceOrders({ shopIds: ids, page: 0, size: 5 }) },
      { path: 'GET /v1/finance/expenses', run: () => getExpenses({ shopIds: ids, page: 0, size: 5 }) },
    ]

    setRows(probes.map((p) => ({ path: p.path, note: p.note, state: 'pending' })))

    for (let i = 0; i < probes.length; i++) {
      if (cancelRef.current) break
      const p = probes[i]

      setRows((r) => r.map((x, xi) => (xi === i ? { ...x, state: 'running' } : x)))

      if (p.needs && !p.needs()) {
        setRows((r) => r.map((x, xi) => (xi === i ? { ...x, state: 'skipped' } : x)))
        continue
      }

      const started = performance.now()
      try {
        const res = await p.run()
        // Punkt UUID ni keyingi sinov uchun eslab qolamiz
        if (p.path.endsWith('drop-off-points')) {
          const list = res?.dropOffPoints || res?.points || (Array.isArray(res) ? res : [])
          ctx.dopId = list[0]?.uuid
        }
        setRows((r) =>
          r.map((x, xi) =>
            xi === i
              ? { ...x, state: 'ok', count: countOf(res), ms: Math.round(performance.now() - started) }
              : x,
          ),
        )
      } catch (err) {
        // Eskirgan endpoint uchun 404 — kutilgan natija, xato emas
        const expected = p.expect404 && err?.status === 404
        setRows((r) =>
          r.map((x, xi) =>
            xi === i
              ? {
                  ...x,
                  state: expected
                    ? 'expected'
                    : err?.status === 403 || err?.status === 401
                      ? 'forbidden'
                      : 'fail',
                  error: message(err),
                  status: err?.status,
                  ms: Math.round(performance.now() - started),
                }
              : x,
          ),
        )
      }
    }

    setRunning(false)
  }, [activeShopId, shopIds, message])

  const done = rows.filter((r) => r.state !== 'pending' && r.state !== 'running')
  const ok = rows.filter((r) => r.state === 'ok').length
  const fail = rows.filter((r) => r.state === 'fail').length
  const forbidden = rows.filter((r) => r.state === 'forbidden').length
  const skipped = rows.filter((r) => r.state === 'skipped').length
  const expected = rows.filter((r) => r.state === 'expected').length

  return (
    <Card>
      <CardHeader
        title={t('health.title')}
        subtitle={t('health.hint')}
        action={
          <Button variant="primary" icon={running ? undefined : PlayCircle} loading={running} onClick={run}>
            {t('health.run')}
          </Button>
        }
      />

      {rows.length > 0 && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone="success">
              {t('health.ok')}: {ok}
            </Badge>
            {fail > 0 && (
              <Badge tone="danger">
                {t('health.fail')}: {fail}
              </Badge>
            )}
            {forbidden > 0 && (
              <Badge tone="danger">
                403: {forbidden}
              </Badge>
            )}
            {expected > 0 && (
              <Badge tone="warning">
                {t('health.expected')}: {expected}
              </Badge>
            )}
            {skipped > 0 && (
              <Badge tone="neutral">
                {t('health.skipped')}: {skipped}
              </Badge>
            )}
            <Badge tone="info">
              {done.length} / {rows.length}
            </Badge>
          </div>

          <ul className="mt-3">
            {rows.map((r) => (
              <li key={r.path} className="border-app flex items-center gap-2.5 border-b py-2 last:border-0">
                <StateIcon state={r.state} />
                <span className="text-app min-w-0 flex-1 font-mono text-[12px] break-all">
                  {r.path}
                  {r.note && <span className="text-faint"> · {r.note}</span>}
                </span>
                {r.count !== undefined && r.count !== null && (
                  <span className="text-muted tabular shrink-0 text-[12px]">
                    {r.count} {t('dev.records')}
                  </span>
                )}
                {r.ms !== undefined && (
                  <span className="text-faint tabular shrink-0 text-[11.5px]">{r.ms} ms</span>
                )}
                {r.error && (
                  <span className="shrink-0 text-[11.5px] text-red-600 dark:text-red-400">
                    {r.status ? `${r.status} · ` : ''}
                    {r.error}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="border-app mt-4 border-t pt-3">
        <p className="text-muted text-[12.5px] font-medium">{t('health.writeTitle')}</p>
        <p className="text-faint mt-0.5 text-[12px]">{t('health.writeHint')}</p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {WRITE_ONLY.map((p) => (
            <li
              key={p}
              className="text-muted bg-surface-2 rounded-md px-2 py-0.5 font-mono text-[11px]"
            >
              {p}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

function StateIcon({ state }) {
  const common = 'shrink-0'
  if (state === 'ok') return <CheckCircle2 size={15} className={cx(common, 'text-emerald-600 dark:text-emerald-400')} />
  if (state === 'fail') return <XCircle size={15} className={cx(common, 'text-red-600 dark:text-red-400')} />
  if (state === 'forbidden') return <Lock size={15} className={cx(common, 'text-red-600 dark:text-red-400')} />
  if (state === 'expected')
    return <AlertTriangle size={15} className={cx(common, 'text-amber-600 dark:text-amber-400')} />
  if (state === 'skipped') return <MinusCircle size={15} className={cx(common, 'text-faint')} />
  if (state === 'running') return <Loader2 size={15} className={cx(common, 'text-brand-500 animate-spin')} />
  return <MinusCircle size={15} className={cx(common, 'text-faint opacity-40')} />
}
