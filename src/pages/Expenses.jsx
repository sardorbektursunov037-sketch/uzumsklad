import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Receipt, ArrowDownRight, ArrowUpRight, Scale } from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import { useApi, useApiMessage } from '../hooks/useApi'
import { getExpenses } from '../api/endpoints'
import { PAGE_SIZES } from '../api/constants'
import { money, num, dateTime, dash, cx } from '../utils/format'
import { PageHeader, StatCard, DataTable, Pagination, Badge, SearchInput, Select } from '../components/ui'
import { StatusBadge, FilterBar, DateRangeFilter } from '../components/common'
import { DevSource } from '../components/DevSource'
import { PeriodLabel } from '../components/PeriodLabel'
import { DataViewer } from '../components/DataViewer'
import { useDebounced } from '../hooks/misc'

// Standart holatda sana filtri qo'yilmaydi — Uzum eng yangilarini qaytaradi.
// Davrni foydalanuvchi o'zi toraytiradi.
const DEFAULT_RANGE = { dateFrom: undefined, dateTo: undefined }

export default function Expenses() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const { shopIds } = useAuth()
  const message = useApiMessage()

  const [range, setRange] = useState(DEFAULT_RANGE)
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)
  const [query, setQuery] = useState('')
  const [source, setSource] = useState('')
  const search = useDebounced(query, 350)
  // Uzum manbalar ro'yxatini alohida endpointda bermaydi — kelgan
  // to'lovlardan yig'ib boramiz, shunda filtr real qiymatlar bilan to'ladi
  const [knownSources, setKnownSources] = useState([])

  const idsKey = shopIds.join(',')

  useEffect(() => {
    setPage(0)
  }, [range.dateFrom, range.dateTo, idsKey, source])

  const { data, loading, error, refetch } = useApi(
    (signal) =>
      getExpenses(
        {
          shopIds,
          page,
          size,
          dateFrom: range.dateFrom,
          dateTo: range.dateTo,
          sources: source ? [source] : undefined,
        },
        { signal },
      ),
    [idsKey, page, size, range.dateFrom, range.dateTo, source],
    { skip: shopIds.length === 0, keepPreviousData: true },
  )

  const all = useMemo(() => data?.payments || [], [data])

  useEffect(() => {
    const found = all.map((p) => p.source).filter(Boolean)
    if (!found.length) return
    setKnownSources((prev) => [...new Set([...prev, ...found])].sort())
  }, [all])

  // API to'lov nomi bo'yicha qidiruvni qo'llab-quvvatlamaydi — mahalliy filtr
  const rows = useMemo(() => {
    if (!search) return all
    const q = search.toLowerCase()
    return all.filter(
      (p) =>
        String(p.name || '').toLowerCase().includes(q) ||
        String(p.source || '').toLowerCase().includes(q) ||
        String(p.code || '').toLowerCase().includes(q) ||
        String(p.externalId || '').toLowerCase().includes(q),
    )
  }, [all, search])

  const totals = useMemo(
    () =>
      all.reduce(
        (acc, p) => {
          const v = Number(p.paymentPrice) || 0
          if (p.type === 'INCOME') acc.income += v
          else acc.outcome += v
          return acc
        },
        { income: 0, outcome: 0 },
      ),
    [all],
  )

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: t('expenses.paymentName'),
        nowrap: false,
        width: '28%',
        render: (p) => (
          <div className="min-w-0">
            <p className="text-app truncate text-[13.5px] font-medium">{dash(p.name)}</p>
            {p.code && <p className="text-faint truncate font-mono text-[11px]">{p.code}</p>}
          </div>
        ),
      },
      {
        key: 'source',
        header: t('expenses.source'),
        render: (p) =>
          p.source ? (
            <Badge size="sm" dot={false}>
              {p.source}
            </Badge>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      {
        key: 'type',
        header: t('expenses.type'),
        render: (p) => (
          <Badge tone={p.type === 'INCOME' ? 'success' : 'warning'} size="sm" dot={false}>
            {t(`enums.paymentType.${p.type}`, { defaultValue: p.type || '—' })}
          </Badge>
        ),
      },
      {
        key: 'status',
        header: t('common.status'),
        render: (p) => <StatusBadge group="paymentStatus" value={p.status} size="sm" />,
      },
      {
        key: 'dateCreated',
        header: t('common.created'),
        render: (p) => <span className="text-muted tabular text-[13px]">{dateTime(p.dateCreated, lang)}</span>,
      },
      {
        key: 'dateService',
        header: t('expenses.dateService'),
        render: (p) => <span className="text-muted tabular text-[13px]">{dateTime(p.dateService, lang)}</span>,
      },
      {
        key: 'amount',
        header: t('common.amount'),
        align: 'right',
        render: (p) => <span className="tabular">{num(p.amount, lang)}</span>,
      },
      {
        key: 'paymentPrice',
        header: t('expenses.paymentPrice'),
        align: 'right',
        render: (p) => (
          <span
            className={cx(
              'tabular text-[13.5px] font-semibold',
              p.type === 'INCOME' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
            )}
          >
            {p.type === 'INCOME' ? '+' : '−'}
            {money(p.paymentPrice, lang, { currency: false })}
          </span>
        ),
      },
    ],
    [t, lang],
  )

  return (
    <>
      <PageHeader title={t('expenses.title')} subtitle={t('expenses.subtitle')} />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label={t('expenses.totalOutcome')}
          value={money(totals.outcome, lang)}
          icon={ArrowDownRight}
          tone="danger"
          loading={loading}
        />
        <StatCard
          label={t('expenses.totalIncome')}
          value={money(totals.income, lang)}
          icon={ArrowUpRight}
          tone="success"
          loading={loading}
        />
        <StatCard
          label={t('expenses.balance')}
          value={money(totals.income - totals.outcome, lang)}
          icon={Scale}
          tone={totals.income - totals.outcome >= 0 ? 'success' : 'warning'}
          loading={loading}
        />
      </div>

      <PeriodLabel
        className="mb-3"
        dateFrom={range.dateFrom}
        dateTo={range.dateTo}
        count={all.length}
      />

      <DevSource
        className="mb-4"
        sources={[
          {
            path: '/v1/finance/expenses',
            params: {
              shopIds,
              page,
              size,
              sources: source ? [source] : undefined,
              dateFrom: range.dateFrom ? Math.floor(range.dateFrom / 1000) : undefined,
              dateTo: range.dateTo ? Math.floor(range.dateTo / 1000) : undefined,
            },
            count: all.length,
            note: 'SellerPaymentDto: paymentPrice, type (INCOME/OUTCOME), status, source, dateService',
          },
        ]}
      />

      <FilterBar
        onReset={() => {
          setRange(DEFAULT_RANGE)
          setQuery('')
          setSource('')
        }}
      >
        <SearchInput value={query} onChange={setQuery} placeholder={t('common.search')} className="w-full sm:w-72" />
        <Select
          label={t('expenses.sources')}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder={t('expenses.allSources')}
          options={knownSources.map((v) => ({ value: v, label: v }))}
          disabled={knownSources.length === 0}
          wrapperClassName="w-48"
        />
        <DateRangeFilter value={range} onChange={setRange} />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(p, i) => p.id ?? i}
        loading={loading}
        error={error ? message(error) : null}
        onRetry={refetch}
        emptyIcon={Receipt}
        numbered
        indexOffset={page * size}
        expandable={(row) => (
          <div className="p-4">
            <DataViewer data={row} defaultOpen />
          </div>
        )}
      />

      <Pagination page={page} size={size} onPage={setPage} onSize={setSize} sizes={PAGE_SIZES} hasMore={all.length >= size} />
    </>
  )
}
