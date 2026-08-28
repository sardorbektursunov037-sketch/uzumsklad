import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Boxes, Save, RotateCcw, Info, Layers, Link2, PackageX } from 'lucide-react'

import { useToast } from '../context/ToastContext'
import { useApi, useApiMessage, useAction } from '../hooks/useApi'
import { useDebounced } from '../hooks/misc'
import { getStocks, getStocksLegacy, updateStocks } from '../api/endpoints'
import { num, cx, dash } from '../utils/format'
import {
  PageHeader,
  DataTable,
  Pagination,
  Button,
  Badge,
  Input,
  SearchInput,
  Tooltip,
  StatCard,
  Segmented,
} from '../components/ui'
import { ProductCell, FilterBar } from '../components/common'
import { DevSource } from '../components/DevSource'
import { DataViewer } from '../components/DataViewer'

export default function Stocks() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const toast = useToast()
  const message = useApiMessage()

  const [page, setPage] = useState(0)
  const [size, setSize] = useState(50)
  const [query, setQuery] = useState('')
  const search = useDebounced(query, 350)
  // v3 — kursor asosidagi joriy endpoint, v2 — eskirgan (moslik uchun qoldirilgan)
  const [apiVersion, setApiVersion] = useState('v3')
  // v3 ikki rejimda ishlaydi: sahifa raqami yoki skuIdFrom kursori
  const [mode, setMode] = useState('page')
  const [cursor, setCursor] = useState('')
  const cursorValue = useDebounced(cursor, 450)

  /** Tahrirlangan qoldiqlar: { [skuId]: yangiQiymat } */
  const [edits, setEdits] = useState({})

  const { data, loading, error, refetch } = useApi(
    (signal) => {
      if (apiVersion === 'v2') return getStocksLegacy({ signal })
      return mode === 'cursor'
        ? getStocks({ size, skuIdFrom: Number(cursorValue) || 0 }, { signal })
        : getStocks({ page, size }, { signal })
    },
    [page, size, apiVersion, mode, cursorValue],
    { keepPreviousData: true },
  )

  const all = useMemo(() => data?.skuAmountList || [], [data])

  // Uzum API qidiruvni qo'llab-quvvatlamaydi — sahifa ichida filtrlaymiz
  const rows = useMemo(() => {
    if (!search) return all
    const q = search.toLowerCase()
    return all.filter(
      (s) =>
        String(s.skuTitle || '').toLowerCase().includes(q) ||
        String(s.productTitle || '').toLowerCase().includes(q) ||
        String(s.barcode || '').includes(q) ||
        String(s.skuId || '').includes(q) ||
        String(s.sellerSkuCode || '').toLowerCase().includes(q),
    )
  }, [all, search])

  // Sahifa yoki manba almashganda tahrirlar bekor qilinadi —
  // noto'g'ri qatorga yozib yuborishning oldini oladi
  useEffect(() => {
    setEdits({})
  }, [page, size, apiVersion, mode, cursorValue])

  /* Umumiy ko'rsatkichlar */
  const summary = useMemo(
    () => ({
      total: all.length,
      units: all.reduce((s, x) => s + (Number(x.amount) || 0), 0),
      linked: all.filter((x) => x.fbsLinked || x.dbsLinked).length,
      zero: all.filter((x) => Number(x.amount) === 0).length,
    }),
    [all],
  )

  const changed = useMemo(
    () =>
      all.filter((s) => {
        const v = edits[s.skuId]
        return v !== undefined && v !== '' && Number(v) !== Number(s.amount)
      }),
    [all, edits],
  )

  const { run: save, pending: saving } = useAction(async () => {
    const payload = changed
      .filter((s) => s.barcode)
      .map((s) => ({ barcode: String(s.barcode), amount: Number(edits[s.skuId]) }))

    if (!payload.length) {
      toast.warning(t('stocks.noBarcode'))
      return
    }

    await updateStocks(payload)
    toast.success(t('stocks.updated'))
    setEdits({})
    refetch()
  })

  const setAmount = (skuId, value) => setEdits((e) => ({ ...e, [skuId]: value }))

  const columns = useMemo(
    () => [
      {
        key: 'sku',
        header: t('common.sku'),
        nowrap: false,
        width: '34%',
        render: (s) => <ProductCell title={s.productTitle || s.skuTitle} subtitle={s.skuTitle} size={34} />,
      },
      {
        key: 'skuId',
        header: 'ID',
        render: (s) => <span className="text-muted font-mono text-[12px]">{s.skuId}</span>,
      },
      {
        key: 'barcode',
        header: t('common.barcode'),
        render: (s) =>
          s.barcode ? (
            <span className="font-mono text-[12px]">{s.barcode}</span>
          ) : (
            <Tooltip label={t('stocks.noBarcode')}>
              <span className="text-amber-600 dark:text-amber-400">—</span>
            </Tooltip>
          ),
      },
      {
        key: 'sellerSkuCode',
        header: t('products.sellerCode'),
        render: (s) => <span className="text-muted text-[12.5px]">{dash(s.sellerSkuCode)}</span>,
      },
      {
        key: 'links',
        header: t('stocks.linked'),
        render: (s) => (
          <div className="flex gap-1">
            <Badge tone={s.fbsLinked ? 'success' : 'neutral'} size="sm" dot={false}>
              FBS
            </Badge>
            <Badge tone={s.dbsLinked ? 'success' : 'neutral'} size="sm" dot={false}>
              DBS
            </Badge>
          </div>
        ),
      },
      {
        key: 'amount',
        header: t('stocks.current'),
        align: 'right',
        render: (s) => (
          <span
            className={cx(
              'tabular text-[13.5px] font-medium',
              Number(s.amount) === 0 && 'text-red-600 dark:text-red-400',
              Number(s.amount) > 0 && Number(s.amount) < 5 && 'text-amber-600 dark:text-amber-400',
            )}
          >
            {num(s.amount, lang)}
          </span>
        ),
      },
      {
        key: 'newAmount',
        header: t('stocks.newAmount'),
        align: 'right',
        width: 130,
        render: (s) => {
          const value = edits[s.skuId]
          const dirty = value !== undefined && value !== '' && Number(value) !== Number(s.amount)
          return (
            <input
              type="number"
              min="0"
              inputMode="numeric"
              disabled={!s.barcode}
              value={value ?? ''}
              placeholder={String(s.amount ?? 0)}
              onChange={(e) => setAmount(s.skuId, e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className={cx(
                'tabular bg-surface h-8 w-24 rounded-lg border px-2 text-right text-[13px] transition-colors',
                'focus:border-brand-500 focus:outline-none',
                'disabled:bg-surface-2 disabled:cursor-not-allowed',
                dirty && 'border-brand-500 bg-brand-50/60 dark:bg-brand-950/30 font-medium',
              )}
            />
          )
        },
      },
    ],
    [t, lang, edits],
  )

  return (
    <>
      <PageHeader title={t('stocks.title')} subtitle={t('stocks.subtitle')}>
        {changed.length > 0 && (
          <>
            <Badge tone="info">{t('stocks.changed', { count: changed.length })}</Badge>
            <Button variant="ghost" icon={RotateCcw} onClick={() => setEdits({})} disabled={saving}>
              {t('stocks.discardChanges')}
            </Button>
          </>
        )}
        <Button
          variant="primary"
          icon={Save}
          onClick={() => save().catch((e) => toast.error(message(e)))}
          loading={saving}
          disabled={changed.length === 0}
        >
          {t('stocks.saveChanges')}
        </Button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('common.sku')} value={num(summary.total, lang)} icon={Layers} tone="brand" loading={loading} />
        <StatCard label={t('stocks.current')} value={num(summary.units, lang)} icon={Boxes} tone="success" loading={loading} />
        <StatCard label={t('stocks.linked')} value={num(summary.linked, lang)} icon={Link2} tone="neutral" loading={loading} />
        <StatCard
          label={t('enums.productStatus.RUN_OUT')}
          value={num(summary.zero, lang)}
          icon={PackageX}
          tone={summary.zero ? 'danger' : 'neutral'}
          loading={loading}
        />
      </div>

      <DevSource
        className="mb-4"
        compact
        sources={[
          {
            path: apiVersion === 'v3' ? '/v3/fbs/sku/stocks' : '/v2/fbs/sku/stocks',
            params:
              apiVersion === 'v3'
                ? mode === 'cursor'
                  ? { size, skuIdFrom: Number(cursorValue) || 0 }
                  : { page, size }
                : {},
            count: all.length,
            note: 'SkuAmountApiResponseDto: amount, barcode, fbsLinked, dbsLinked',
          },
          {
            method: 'POST',
            path: '/v2/fbs/sku/stocks',
            note: "Qoldiqni saqlash — barcode majburiy",
          },
        ]}
      />

      <FilterBar>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={t('common.searchPlaceholder')}
          className="w-full sm:w-80"
        />
        {apiVersion === 'v3' && (
          <Segmented
            size="sm"
            ariaLabel={t('common.filter')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'page', label: t('stocks.modePage') },
              { value: 'cursor', label: t('stocks.modeCursor') },
            ]}
          />
        )}
        {apiVersion === 'v3' && mode === 'cursor' && (
          <Input
            type="number"
            min="0"
            label={t('stocks.cursor')}
            hint={t('stocks.cursorHint')}
            value={cursor}
            onChange={(e) => setCursor(e.target.value)}
            wrapperClassName="w-56"
            className="tabular"
          />
        )}
        <Segmented
          size="sm"
          ariaLabel="API"
          value={apiVersion}
          onChange={setApiVersion}
          options={[
            { value: 'v3', label: 'v3' },
            { value: 'v2', label: 'v2' },
          ]}
        />
        <p className="text-faint flex items-center gap-1.5 text-[12px]">
          <Info size={13} aria-hidden />
          {t('stocks.updateHint')}
        </p>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(s) => s.skuId}
        loading={loading}
        error={error ? message(error) : null}
        onRetry={refetch}
        emptyIcon={Boxes}
        numbered
        indexOffset={apiVersion === 'v3' && mode === 'page' ? page * size : 0}
        expandable={(row) => (
          <div className="p-4">
            <DataViewer data={row} defaultOpen />
          </div>
        )}
      />

      {apiVersion === 'v3' && mode === 'page' && (
        <Pagination
          page={page}
          size={size}
          onPage={setPage}
          onSize={setSize}
          sizes={[25, 50, 100]}
          hasMore={all.length >= size}
        />
      )}
    </>
  )
}
