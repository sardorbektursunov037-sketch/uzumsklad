import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MapPin, Clock, Check, PackageCheck } from 'lucide-react'

import { useToast } from '../context/ToastContext'
import { useApi, useApiMessage, useAction } from '../hooks/useApi'
import { getDropOffPoints, getTimeSlots, createFbsInvoice, updateTimeSlot } from '../api/endpoints'
import { cx, time as fmtTime, dateTime } from '../utils/format'
import { Modal, Button, Badge, Spinner, EmptyState, ErrorState } from './ui'

/**
 * FBS yuk xati yaratish sehrgari.
 *
 * Uzum ketma-ketligi:
 *   1. GET /dop/drop-off-points?customerOrderIds — mos punktlar
 *   2. GET /dop/time-slot?dopId&sellerOrderIds   — punktdagi bo'sh oraliqlar
 *   3. POST /v1/fbs/invoice                       — yuk xati
 *
 * `mode='slot'` bo'lganda xuddi shu tanlov mavjud yuk xatining punkti va
 * vaqt oralig'ini yangilash uchun ishlatiladi (POST /dop/time-slot).
 *
 * @param {number[]} orderIds  tanlangan buyurtma ID lari
 * @param {'create'|'slot'} [mode]
 */
export function CreateInvoiceModal({ open, onClose, orderIds = [], sellerId, onCreated, mode = 'create' }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage === 'ru' ? 'ru' : 'uz'
  const toast = useToast()
  const message = useApiMessage()

  const [dop, setDop] = useState(null)
  const [slot, setSlot] = useState(null)

  const idsKey = orderIds.join(',')

  useEffect(() => {
    if (open) {
      setDop(null)
      setSlot(null)
    }
  }, [open, idsKey])

  const points = useApi(
    (signal) => getDropOffPoints(orderIds, lang, { signal }),
    [idsKey, lang],
    { skip: !open || orderIds.length === 0 },
  )

  const slots = useApi(
    (signal) => getTimeSlots(dop?.uuid, orderIds, lang, { signal }),
    [dop?.uuid, idsKey, lang],
    { skip: !open || !dop },
  )

  const pointList = useMemo(() => {
    const raw = points.data
    return raw?.dropOffPoints || raw?.points || (Array.isArray(raw) ? raw : [])
  }, [points.data])

  const slotList = useMemo(() => {
    const raw = slots.data
    return raw?.timeSlots || raw?.slots || (Array.isArray(raw) ? raw : [])
  }, [slots.data])

  const { run, pending } = useAction(async () => {
    // idempotencyKey — tarmoq uzilib qayta yuborilsa, ikkinchi xat yaratilmasligi uchun
    const body = {
      orderIds,
      dropOffPointUuid: dop.uuid,
      timeSlotUuid: slot.uuid ?? slot.timeSlotUuid,
      sellerId,
      idempotencyKey: `${orderIds.join('-')}-${dop.uuid}-${slot.uuid ?? slot.timeSlotUuid}`,
    }
    const invoice = mode === 'slot' ? await updateTimeSlot(body, lang) : await createFbsInvoice(body, lang)
    toast.success(t(mode === 'slot' ? 'fbsInvoices.slotUpdated' : 'fbsInvoices.created'))
    onCreated?.(invoice)
    onClose()
  })

  const submit = async () => {
    try {
      await run()
    } catch (err) {
      toast.error(message(err))
    }
  }

  const step = !dop ? 2 : !slot ? 3 : 3

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t(mode === 'slot' ? 'fbsInvoices.changeSlot' : 'fbsInvoices.createTitle')}
      subtitle={t('common.selected', { count: orderIds.length })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" icon={PackageCheck} onClick={submit} loading={pending} disabled={!dop || !slot}>
            {t(mode === 'slot' ? 'common.save' : 'fbsInvoices.create')}
          </Button>
        </>
      }
    >
      {/* Bosqichlar */}
      <ol className="mb-5 flex items-center gap-2 text-[12px]">
        {[
          { n: 1, label: t('fbsInvoices.step1'), done: orderIds.length > 0 },
          { n: 2, label: t('fbsInvoices.step2'), done: Boolean(dop) },
          { n: 3, label: t('fbsInvoices.step3'), done: Boolean(slot) },
        ].map((s, i) => (
          <li key={s.n} className="flex items-center gap-2">
            {i > 0 && <span className="text-faint">→</span>}
            <span
              className={cx(
                'inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium',
                s.done
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                  : step === s.n
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                    : 'bg-surface-2 text-faint',
              )}
            >
              {s.done ? <Check size={12} /> : <span className="tabular">{s.n}</span>}
              {s.label}
            </span>
          </li>
        ))}
      </ol>

      {/* 2-bosqich: qabul punkti */}
      <section>
        <h3 className="text-app mb-2 flex items-center gap-2 text-[13px] font-semibold">
          <MapPin size={14} className="text-brand-600 dark:text-brand-400" />
          {t('fbsInvoices.selectDropOff')}
        </h3>

        {points.loading && (
          <div className="flex h-24 items-center justify-center">
            <Spinner />
          </div>
        )}
        {points.error && <ErrorState message={message(points.error)} onRetry={points.refetch} compact />}
        {!points.loading && !points.error && pointList.length === 0 && (
          <EmptyState compact title={t('fbsInvoices.noDropOffPoints')} hint={null} />
        )}

        <ul className="max-h-56 space-y-2 overflow-y-auto">
          {pointList.map((p) => {
            const active = dop?.uuid === p.uuid
            return (
              <li key={p.uuid}>
                <button
                  type="button"
                  onClick={() => {
                    setDop(p)
                    setSlot(null)
                  }}
                  className={cx(
                    'w-full rounded-lg border p-3 text-left transition-colors',
                    active
                      ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-950/30'
                      : 'hover:bg-surface-hover',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-app text-[13.5px] font-medium">{p.address || p.uuid}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {p.type && (
                          <Badge size="sm" dot={false}>
                            {t(`enums.dropOffType.${p.type}`, { defaultValue: p.type })}
                          </Badge>
                        )}
                        {p.dimensionalGroupIsLarge && (
                          <Badge size="sm" tone="warning" dot={false}>
                            {t('fbsInvoices.largeGroup')}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {active && <Check size={16} className="text-brand-600 dark:text-brand-400 mt-0.5 shrink-0" />}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      {/* 3-bosqich: vaqt oralig'i */}
      {dop && (
        <section className="border-app mt-5 border-t pt-4">
          <h3 className="text-app mb-2 flex items-center gap-2 text-[13px] font-semibold">
            <Clock size={14} className="text-brand-600 dark:text-brand-400" />
            {t('fbsInvoices.selectTimeSlot')}
          </h3>

          {slots.loading && (
            <div className="flex h-20 items-center justify-center">
              <Spinner />
            </div>
          )}
          {slots.error && <ErrorState message={message(slots.error)} onRetry={slots.refetch} compact />}
          {!slots.loading && !slots.error && slotList.length === 0 && (
            <EmptyState compact title={t('fbsInvoices.noTimeSlots')} hint={null} />
          )}

          <div className="flex flex-wrap gap-2">
            {slotList.map((s) => {
              const uuid = s.uuid ?? s.timeSlotUuid
              const active = (slot?.uuid ?? slot?.timeSlotUuid) === uuid
              return (
                <button
                  key={uuid}
                  type="button"
                  onClick={() => setSlot(s)}
                  className={cx(
                    'rounded-lg border px-3 py-2 text-left text-[13px] transition-colors',
                    active ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-950/30' : 'hover:bg-surface-hover',
                  )}
                >
                  <span className="text-app tabular block font-medium">
                    {s.timeFrom ? `${fmtTime(s.timeFrom, i18n.resolvedLanguage)} – ${fmtTime(s.timeTo, i18n.resolvedLanguage)}` : uuid}
                  </span>
                  {s.date && <span className="text-faint block text-[11px]">{dateTime(s.date, i18n.resolvedLanguage)}</span>}
                  {s.remainingCapacity !== undefined && (
                    <span className="text-faint block text-[11px]">
                      {t('fbsInvoices.capacity')}: {s.remainingCapacity}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </section>
      )}
    </Modal>
  )
}
