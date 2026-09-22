import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Scale, Store, Download, Banknote, Hourglass, TrendingUp, Percent } from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import { useBulkLoad } from '../hooks/useBulkLoad'
import { cacheKey as ck } from '../api/cache'
import { useApiMessage } from '../hooks/useApi'
import { realizedItems } from '../api/financeItems'
import { fetchFinanceAndExpenses } from '../api/bulk'
import { groupExpenses } from '../api/expenseCategories'
import { money, num, itemRevenue, monthKey, monthLabel, cx, toDate, dayKey, date as fmtDate } from '../utils/format'
import { exportCsv, csvNum } from '../utils/csv'
import {
  PageHeader,
  Card,
  CardHeader,
  StatCard,
  DataTable,
  Button,
  Field,
  FieldGrid,
  EmptyState,
  ErrorState,
  Spinner,
} from '../components/ui'
import { FilterBar, DateRangeFilter } from '../components/common'
import { DevSource } from '../components/DevSource'
import { PeriodLabel } from '../components/PeriodLabel'

/**
 * O'zaro hisob-kitoblar (Взаиморасчеты).
 *
 * Uzum sotuvchisi uchun kontragent bitta — Uzum Market. U komissioner
 * sifatida tovarni sotadi, mukofotini ushlab qoladi va qolganini sotuvchi
 * hisobiga o'tkazadi. Shuning uchun butun o'zaro hisob-kitob bitta qatorga
 * sig'adi:
 *
 *   Bizga hisoblangan  = Σ sellerProfit          (Uzum bizga qarzi)
 *   Hisobga o'tkazilgan = Σ withdrawnProfit + Σ INCOME to'lovlar
 *   Ushlab qolingan     = Σ OUTCOME to'lovlar    (logistika, saqlash, ...)
 *   Yakuniy qoldiq      = hisoblangan − o'tkazilgan
 *
 * Manba: `/v1/finance/orders` va `/v1/finance/expenses`.
 */

const DEFAULT_RANGE = { dateFrom: undefined, dateTo: undefined }

/** Uzum Market — yagona kontragent */
const COUNTERPARTY = 'Uzum Market'

export default function Settlements() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const { shopIds } = useAuth()
  const message = useApiMessage()

  const [range, setRange] = useState(DEFAULT_RANGE)

  const idsKey = shopIds.join(',')
  const ids = useMemo(() => (idsKey ? idsKey.split(',').map(Number) : []), [idsKey])

  const load = useCallback(
    (signal, onProgress) =>
      fetchFinanceAndExpenses({ shopIds: ids, dateFrom: range.dateFrom, dateTo: range.dateTo }, signal, onProgress),
    [ids, range.dateFrom, range.dateTo],
  )

  const { data, loading, error, loaded, total, reload } = useBulkLoad(
    load,
    [idsKey, range.dateFrom, range.dateTo],
    { skip: ids.length === 0, cacheKey: ck('settlements', { ids: idsKey, from: range.dateFrom, to: range.dateTo }) },
  )

  const items = useMemo(() => realizedItems(data?.sales?.items || []), [data])
  const payments = useMemo(() => data?.expenses?.payments || [], [data])
  const capped = data?.sales?.capped

  /* ── Yig'indi ────────────────────────────────────────────────── */

  const totals = useMemo(() => {
    let accrued = 0 // bizga hisoblangan (sellerProfit)
    let withdrawn = 0 // sotuv yozuvida ko'rsatilgan to'lov
    let revenue = 0
    let commission = 0
    let orders = new Set()

    for (const it of items) {
      accrued += Number(it.sellerProfit) || 0
      withdrawn += Number(it.withdrawnProfit) || 0
      revenue += itemRevenue(it)
      commission += Number(it.commission) || 0
      if (it.orderId !== undefined && it.orderId !== null) orders.add(it.orderId)
    }

    const { outcome, income } = groupExpenses(payments)

    // To'langan summa faqat sotuv yozuvidagi `withdrawnProfit` dan olinadi.
    // `INCOME` to'lovlar — bu ushlab qolingan xarajatning qaytarimi
    // (masalan, logistika haqi qaytarilishi), hisobga o'tkazish emas.
    const settled = withdrawn

    return {
      accrued,
      withdrawn,
      income,
      outcome,
      settled,
      balance: accrued - settled,
      revenue,
      commission,
      orders: orders.size,
      netCash: income - outcome,
    }
  }, [items, payments])

  /* ── Oylar kesimi ────────────────────────────────────────────── */

  const rows = useMemo(() => {
    const map = new Map()

    const row = (key) => {
      if (!map.has(key)) {
        map.set(key, { key, label: monthLabel(key, lang), accrued: 0, withdrawn: 0, income: 0, outcome: 0 })
      }
      return map.get(key)
    }

    for (const it of items) {
      const key = monthKey(it.date ?? it.dateIssued)
      if (!key) continue
      const r = row(key)
      r.accrued += Number(it.sellerProfit) || 0
      r.withdrawn += Number(it.withdrawnProfit) || 0
    }

    for (const p of payments) {
      const key = monthKey(p.dateService ?? p.dateCreated ?? p.date)
      if (!key) continue
      const r = row(key)
      const amount = Number(p.paymentPrice) || 0
      if (p.type === 'INCOME') r.income += amount
      else r.outcome += amount
    }

    // Qoldiq oydan oyga to'planadi — eng eskisidan boshlab
    const list = [...map.values()].sort((a, b) => a.key.localeCompare(b.key))
    let running = 0
    for (const r of list) {
      r.opening = running
      r.settled = Math.max(r.withdrawn, r.income)
      r.change = r.accrued - r.settled
      running += r.change
      r.closing = running
    }

    return list.reverse()
  }, [items, payments, lang])

  /* ── To'lovlar tarixi ────────────────────────────────────────── */

  /**
   * Uzum alohida «yechib olish» hujjatini bermaydi — to'langanlik faqat
   * sotuv pozitsiyasidagi `withdrawnProfit` orqali ko'rinadi. Shuning uchun
   * bir kunda to'langan pozitsiyalarni bitta to'lov deb yig'amiz: amalda
   * Uzum hisobga bir kunda bir marta o'tkazadi.
   */
  const payouts = useMemo(() => {
    const map = new Map()

    for (const it of items) {
      const amount = Number(it.withdrawnProfit) || 0
      if (amount <= 0) continue
      const d = toDate(it.date ?? it.dateIssued)
      const key = dayKey(d)
      if (!key) continue
      const row = map.get(key) || { key, at: d.getTime(), count: 0, amount: 0, orders: new Set() }
      row.count++
      row.amount += amount
      if (it.orderId !== undefined && it.orderId !== null) row.orders.add(it.orderId)
      map.set(key, row)
    }

    return [...map.values()]
      .map((r) => ({ ...r, orders: r.orders.size }))
      .sort((a, b) => b.at - a.at)
  }, [items])

  const payoutColumns = useMemo(
    () => [
      {
        key: 'date',
        header: t('common.date'),
        render: (r) => <span className="text-app tabular text-[13.5px]">{fmtDate(r.at, lang)}</span>,
      },
      {
        key: 'orders',
        header: t('settlements.payoutOrders'),
        align: 'right',
        render: (r) => <span className="text-muted tabular text-[13px]">{num(r.orders, lang)}</span>,
      },
      {
        key: 'count',
        header: t('settlements.payoutPositions'),
        align: 'right',
        render: (r) => <span className="text-muted tabular text-[13px]">{num(r.count, lang)}</span>,
      },
      {
        key: 'amount',
        header: t('settlements.payoutSum'),
        align: 'right',
        render: (r) => (
          <span className="tabular text-[13.5px] font-semibold text-emerald-600 dark:text-emerald-400">
            {money(Math.round(r.amount), lang, { currency: false })}
          </span>
        ),
      },
    ],
    [t, lang],
  )

  const handleExport = () => {
    exportCsv(
      rows,
      [
        { key: 'label', header: t('settlements.month') },
        { key: 'opening', header: t('settlements.opening'), value: (r) => csvNum(Math.round(r.opening)) },
        { key: 'accrued', header: t('settlements.accrued'), value: (r) => csvNum(Math.round(r.accrued)) },
        { key: 'settled', header: t('settlements.settled'), value: (r) => csvNum(Math.round(r.settled)) },
        { key: 'outcome', header: t('settlements.withheld'), value: (r) => csvNum(Math.round(r.outcome)) },
        { key: 'closing', header: t('settlements.closing'), value: (r) => csvNum(Math.round(r.closing)) },
      ],
      `ozaro-hisob-kitob-${new Date().toISOString().slice(0, 10)}.csv`,
    )
  }

  const columns = useMemo(
    () => [
      {
        key: 'label',
        header: t('settlements.month'),
        render: (r) => <span className="text-app text-[13.5px] font-medium">{r.label}</span>,
      },
      {
        key: 'opening',
        header: t('settlements.opening'),
        align: 'right',
        render: (r) => <span className="text-muted tabular text-[13px]">{money(Math.round(r.opening), lang, { currency: false })}</span>,
      },
      {
        key: 'accrued',
        header: t('settlements.accrued'),
        align: 'right',
        render: (r) => (
          <span className="tabular text-[13px] text-emerald-600 dark:text-emerald-400">
            +{money(Math.round(r.accrued), lang, { currency: false })}
          </span>
        ),
      },
      {
        key: 'settled',
        header: t('settlements.settled'),
        align: 'right',
        render: (r) =>
          r.settled > 0 ? (
            <span className="tabular text-[13px] text-red-600 dark:text-red-400">
              −{money(Math.round(r.settled), lang, { currency: false })}
            </span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      {
        key: 'outcome',
        header: t('settlements.withheld'),
        align: 'right',
        render: (r) => <span className="text-muted tabular text-[13px]">{money(Math.round(r.outcome), lang, { currency: false })}</span>,
      },
      {
        key: 'closing',
        header: t('settlements.closing'),
        align: 'right',
        render: (r) => (
          <span
            className={cx(
              'tabular text-[13.5px] font-semibold',
              r.closing > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-app',
            )}
          >
            {money(Math.round(r.closing), lang, { currency: false })}
          </span>
        ),
      },
    ],
    [t, lang],
  )

  if (ids.length === 0) {
    return (
      <>
        <PageHeader title={t('settlements.title')} subtitle={t('settlements.subtitle')} />
        <Card>
          <EmptyState icon={Store} title={t('errors.noShopSelected')} hint={t('errors.shopRequired')} />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader title={t('settlements.title')} subtitle={t('settlements.subtitle')}>
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
            note: 'sellerProfit — bizga hisoblangan, withdrawnProfit — to‘langan',
          },
          {
            path: '/v1/finance/expenses',
            params: { shopIds: ids, dateFrom: range.dateFrom, dateTo: range.dateTo, size: 100 },
            count: payments.length,
            note: 'INCOME — hisobga o‘tkazish, OUTCOME — ushlab qolingan xizmatlar',
          },
        ]}
      />

      <FilterBar onReset={() => setRange(DEFAULT_RANGE)}>
        <DateRangeFilter value={range} onChange={setRange} />
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

      {capped && (
        <Card className="mb-4">
          <p className="text-[13px] text-amber-600 dark:text-amber-400">{t('commission.capped')}</p>
        </Card>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('settlements.accrued')}
          value={money(Math.round(totals.accrued), lang)}
          hint={t('commission.docsCount', { n: totals.orders })}
          icon={TrendingUp}
          tone="brand"
          loading={loading}
        />
        <StatCard
          label={t('settlements.settled')}
          value={money(Math.round(totals.settled), lang)}
          hint={t('settlements.timesN', { n: payouts.length })}
          icon={Banknote}
          tone="success"
          loading={loading}
        />
        <StatCard
          label={t('settlements.withheld')}
          value={money(Math.round(totals.outcome), lang)}
          hint={t('settlements.withheldHint')}
          icon={Percent}
          tone="warning"
          loading={loading}
        />
        <StatCard
          label={t('settlements.balance')}
          value={money(Math.round(totals.balance), lang)}
          hint={totals.balance > 0 ? t('settlements.theyOwe') : t('settlements.settledUp')}
          icon={Hourglass}
          tone={totals.balance > 0 ? 'warning' : 'success'}
          loading={loading}
        />
      </div>

      {/* Kontragent kartasi — MoySklad'dagi «Контрагенты» qatoriga mos */}
      <Card className="mb-4">
        <CardHeader
          title={COUNTERPARTY}
          subtitle={t('settlements.counterpartyHint')}
          action={<PeriodLabel dateFrom={range.dateFrom} dateTo={range.dateTo} count={items.length} />}
        />
        <FieldGrid cols={4}>
          <Field label={t('settlements.salesCount')}>{num(totals.orders, lang)}</Field>
          <Field label={t('settlements.avgCheck')}>
            {money(totals.orders > 0 ? Math.round(totals.revenue / totals.orders) : 0, lang)}
          </Field>
          <Field label={t('settlements.salesSum')}>{money(Math.round(totals.revenue), lang)}</Field>
          <Field label={t('settlements.lastSale')}>
            {items.length > 0
              ? fmtDate(
                  items.reduce(
                    (max, it) => Math.max(max, toDate(it.date ?? it.dateIssued)?.getTime() || 0),
                    0,
                  ),
                  lang,
                )
              : '—'}
          </Field>
          <Field label={t('settlements.commission')}>{money(Math.round(totals.commission), lang)}</Field>
          <Field label={t('settlements.income')}>{money(Math.round(totals.income), lang)}</Field>
          <Field label={t('settlements.outcome')}>{money(Math.round(totals.outcome), lang)}</Field>
          <Field label={t('settlements.balance')}>
            <strong className={totals.balance > 0 ? 'text-amber-600 dark:text-amber-400' : undefined}>
              {money(Math.round(totals.balance), lang)}
            </strong>
          </Field>
        </FieldGrid>
      </Card>

      <Card className="mb-4">
        <CardHeader
          title={t('settlements.payouts')}
          subtitle={t('settlements.payoutsHint')}
          action={
            payouts.length > 0 ? (
              <span className="text-muted text-[13px]">
                {t('settlements.timesN', { n: payouts.length })} ·{' '}
                <strong className="text-app">{money(Math.round(totals.withdrawn), lang)}</strong>
              </span>
            ) : null
          }
        />
        <DataTable
          columns={payoutColumns}
          rows={payouts}
          rowKey={(r) => r.key}
          loading={loading && payouts.length === 0}
          emptyIcon={Banknote}
          emptyTitle={t('settlements.noPayouts')}
          emptyHint={t('settlements.noPayoutsHint')}
        />
      </Card>

      <Card>
        <CardHeader title={t('settlements.byMonth')} subtitle={t('settlements.byMonthHint')} />
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.key}
          loading={loading && rows.length === 0}
          emptyIcon={Scale}
          emptyTitle={t('settlements.empty')}
          emptyHint={t('settlements.emptyHint')}
        />
        <p className="text-faint mt-3 text-[12px]">{t('settlements.formula')}</p>
      </Card>
    </>
  )
}
