import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Boxes, TrendingUp, Undo2, Package, AlertTriangle } from 'lucide-react'

import { useApi, useApiMessage } from '../hooks/useApi'
import { getStocks, getFinanceOrders, getReturns } from '../api/endpoints'
import { money, num, percent, dateTime, daysAgo, dash, cx, itemRevenue } from '../utils/format'
import { Drawer, Card, StatCard, Field, FieldGrid, Badge, Spinner, EmptyState, ErrorState } from './ui'
import { StatusBadge, Thumb } from './common'
import { DataViewer } from './DataViewer'

/**
 * Bitta SKU bo'yicha to'liq kuzatuv kartasi.
 *
 * Uch manbadan ma'lumot yig'iladi:
 *   1. Katalogdagi SKU kartasi (SkuForTable) — qoldiqlar va iqtisodiyot
 *   2. GET /v3/fbs/sku/stocks — jonli FBS qoldig'i
 *   3. GET /v1/finance/orders va GET /v1/return — sotuv va qaytarish tarixi
 */
export function ProductTracking({ open, onClose, sku, product, shopId }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const message = useApiMessage()

  const skuId = sku?.skuId
  const dateFrom = useMemo(() => daysAgo(90), [])

  /* Jonli FBS qoldig'i — kursor orqali bitta so'rovda topamiz */
  const liveStock = useApi(
    (signal) => getStocks({ size: 20, skuIdFrom: Math.max(0, Number(skuId) - 1) }, { signal }),
    [skuId],
    { skip: !open || !skuId },
  )

  const live = useMemo(
    () => (liveStock.data?.skuAmountList || []).find((s) => Number(s.skuId) === Number(skuId)) || null,
    [liveStock.data, skuId],
  )

  /* Sotuvlar tarixi */
  const sales = useApi(
    (signal) => getFinanceOrders({ shopIds: [shopId], page: 0, size: 100, dateFrom }, { signal }),
    [shopId, dateFrom],
    { skip: !open || !shopId },
  )

  const skuSales = useMemo(() => {
    const items = sales.data?.orderItems || []
    return items.filter(
      (it) =>
        Number(it.productId) === Number(product?.productId) ||
        (sku?.skuTitle && it.skuTitle === sku.skuTitle) ||
        (sku?.sellerItemCode && it.sellerSkuCode === sku.sellerItemCode),
    )
  }, [sales.data, product?.productId, sku?.skuTitle, sku?.sellerItemCode])

  const salesTotals = useMemo(
    () =>
      skuSales.reduce(
        (acc, it) => ({
          revenue: acc.revenue + itemRevenue(it),
          profit: acc.profit + (Number(it.sellerProfit) || 0),
          commission: acc.commission + (Number(it.commission) || 0),
          units: acc.units + (Number(it.amount) || 0),
        }),
        { revenue: 0, profit: 0, commission: 0, units: 0 },
      ),
    [skuSales],
  )

  /* Qaytarishlar tarixi */
  const returns = useApi((signal) => getReturns({ page: 0, size: 50 }, { signal }), [], {
    skip: !open || !skuId,
  })

  const skuReturns = useMemo(() => {
    const list = Array.isArray(returns.data) ? returns.data : []
    return list
      .map((r) => ({ ...r, matched: (r.returnItems || []).filter((it) => Number(it.skuId) === Number(skuId)) }))
      .filter((r) => r.matched.length > 0)
  }, [returns.data, skuId])

  if (!sku) return null

  const image = sku.previewImage || product?.previewImg || product?.image

  /* Qoldiq taqsimoti — API bergan barcha quantity* maydonlari */
  const stockRows = [
    ['quantityCreated', sku.quantityCreated],
    ['quantityActive', sku.quantityActive],
    ['quantityFbs', sku.quantityFbs],
    ['quantityAdditional', sku.quantityAdditional],
    ['quantityPending', sku.quantityPending],
    ['quantityOnPhotoStudio', sku.quantityOnPhotoStudio],
    ['quantityArchived', sku.quantityArchived],
    ['quantitySold', sku.quantitySold],
    ['quantityReturned', sku.quantityReturned],
    ['quantityDefected', sku.quantityDefected],
    ['quantityMissing', sku.quantityMissing],
  ]

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t('products.trackingTitle')}
      subtitle={t('products.trackingHint')}
      width="max-w-3xl"
    >
      <div className="space-y-5">
        {/* ── Sarlavha ─────────────────────────────────────────── */}
        <div className="flex items-start gap-4">
          <Thumb src={image} alt={sku.skuTitle} size={72} />
          <div className="min-w-0 flex-1">
            <h3 className="text-app text-[16px] leading-tight font-semibold">
              {sku.productTitle || product?.title || sku.skuTitle}
            </h3>
            <p className="text-muted mt-0.5 text-[13px]">{sku.skuFullTitle || sku.skuTitle}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge size="sm" dot={false} className="font-mono">
                SKU {sku.skuId}
              </Badge>
              {sku.barcode && (
                <Badge size="sm" dot={false} className="font-mono">
                  {sku.barcode}
                </Badge>
              )}
              {sku.rankInfo?.rank && <StatusBadge group="rank" value={sku.rankInfo.rank} size="sm" dot={false} />}
              {sku.blocked && (
                <Badge tone="danger" size="sm">
                  {t('products.blocked')}
                </Badge>
              )}
              {sku.archived && (
                <Badge tone="neutral" size="sm" dot={false}>
                  {t('products.archived')}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {sku.blocked && sku.blockingReason && (
          <div className="flex items-start gap-2.5 rounded-lg bg-red-50 p-3 dark:bg-red-950/40">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
            <p className="text-[13px] text-red-800 dark:text-red-300">{sku.blockingReason}</p>
          </div>
        )}

        {/* ── Asosiy ko'rsatkichlar ────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={t('fields.quantityActive')} value={num(sku.quantityActive, lang)} icon={Boxes} tone="brand" />
          <StatCard
            label={t('fields.quantityFbs')}
            value={num(live ? live.amount : sku.quantityFbs, lang)}
            hint={live ? t('products.fbsStock') : undefined}
            icon={Package}
            tone={Number(live ? live.amount : sku.quantityFbs) < 5 ? 'warning' : 'neutral'}
            loading={liveStock.loading}
          />
          <StatCard label={t('fields.quantitySold')} value={num(sku.quantitySold, lang)} icon={TrendingUp} tone="success" />
          <StatCard
            label={t('fields.quantityReturned')}
            value={num(sku.quantityReturned, lang)}
            hint={sku.returnedPercentage != null ? percent(sku.returnedPercentage, lang) : undefined}
            icon={Undo2}
            tone={Number(sku.returnedPercentage) > 10 ? 'danger' : 'neutral'}
          />
        </div>

        {/* ── Identifikatorlar ─────────────────────────────────── */}
        <section>
          <h4 className="text-app mb-2 text-[13px] font-semibold">{t('products.identity')}</h4>
          <Card padded={false} className="p-4">
            <FieldGrid cols={3}>
              <Field label={t('fields.skuId')} mono>{dash(sku.skuId)}</Field>
              <Field label={t('fields.productId')} mono>{dash(product?.productId)}</Field>
              <Field label={t('fields.barcode')} mono>{dash(sku.barcode)}</Field>
              <Field label={t('fields.article')} mono>{dash(sku.article)}</Field>
              <Field label={t('fields.ikpu')} mono>{dash(sku.ikpu)}</Field>
              <Field label={t('fields.sellerItemCode')} mono>{dash(sku.sellerItemCode)}</Field>
              <Field label={t('fields.characteristics')}>{dash(sku.characteristics)}</Field>
              <Field label={t('fields.category')}>{dash(product?.category)}</Field>
              <Field label={t('fields.dimensionalGroup')}>{dash(sku.dimensionalGroup)}</Field>
            </FieldGrid>
          </Card>
        </section>

        {/* ── Qoldiq taqsimoti ─────────────────────────────────── */}
        <section>
          <h4 className="text-app mb-2 text-[13px] font-semibold">{t('products.stockBreakdown')}</h4>
          <Card padded={false} className="p-4">
            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {stockRows.map(([key, value]) => (
                <div key={key} className="border-app flex items-center justify-between gap-3 border-b py-1.5 last:border-0">
                  <span className="text-muted text-[12.5px]">{t(`fields.${key}`)}</span>
                  <span
                    className={cx(
                      'tabular text-[13px] font-medium',
                      key === 'quantityDefected' && Number(value) > 0 && 'text-red-600 dark:text-red-400',
                      key === 'quantityMissing' && Number(value) > 0 && 'text-amber-600 dark:text-amber-400',
                    )}
                  >
                    {num(value, lang)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </section>

        {/* ── Iqtisodiyot ──────────────────────────────────────── */}
        <section>
          <h4 className="text-app mb-2 text-[13px] font-semibold">{t('products.economics')}</h4>
          <Card padded={false} className="p-4">
            <FieldGrid cols={3}>
              <Field label={t('fields.price')}>
                <span className="tabular font-medium">{money(sku.price, lang)}</span>
              </Field>
              <Field label={t('fields.purchasePrice')}>
                <span className="tabular">{money(sku.purchasePrice, lang)}</span>
              </Field>
              <Field label={t('fields.commission')}>
                <span className="tabular">{sku.commission != null ? percent(sku.commission, lang) : '—'}</span>
              </Field>
              <Field label={t('fields.turnover')}>
                <span className="tabular">{money(sku.turnover, lang)}</span>
              </Field>
              <Field label={t('fields.avgdsales')}>
                <span className="tabular">{sku.avgdsales != null ? num(Number(sku.avgdsales).toFixed(2), lang) : '—'}</span>
              </Field>
              <Field label={t('fields.avgdquantity')}>
                <span className="tabular">{sku.avgdquantity != null ? num(Number(sku.avgdquantity).toFixed(2), lang) : '—'}</span>
              </Field>
              <Field label={t('fields.paidStorageAmount')}>
                <span className="tabular">{money(sku.paidStorageAmount, lang)}</span>
              </Field>
              <Field label={t('fields.paidStoragePriceItem')}>
                <span className="tabular">{money(sku.paidStoragePriceItem, lang)}</span>
              </Field>
              <Field label={t('fields.pstorage')}>
                <Badge tone={sku.pstorage ? 'info' : 'neutral'} size="sm" dot={false}>
                  {sku.pstorage ? t('common.yes') : t('common.no')}
                </Badge>
              </Field>
            </FieldGrid>
          </Card>
        </section>

        {/* ── Jonli FBS qoldig'i ───────────────────────────────── */}
        {(live || liveStock.loading) && (
          <section>
            <h4 className="text-app mb-2 text-[13px] font-semibold">{t('products.fbsStock')}</h4>
            <Card padded={false} className="p-4">
              {liveStock.loading ? (
                <div className="flex h-16 items-center justify-center">
                  <Spinner />
                </div>
              ) : (
                <FieldGrid cols={3}>
                  <Field label={t('fields.amount')}>
                    <span className="tabular font-medium">{num(live.amount, lang)}</span>
                  </Field>
                  <Field label={t('fields.fbsLinked')}>
                    <Badge tone={live.fbsLinked ? 'success' : 'neutral'} size="sm" dot={false}>
                      {live.fbsLinked ? t('stocks.linked') : t('stocks.notLinked')}
                    </Badge>
                  </Field>
                  <Field label={t('fields.dbsLinked')}>
                    <Badge tone={live.dbsLinked ? 'success' : 'neutral'} size="sm" dot={false}>
                      {live.dbsLinked ? t('stocks.linked') : t('stocks.notLinked')}
                    </Badge>
                  </Field>
                  <Field label={t('fields.fbsAllowed')}>
                    <Badge tone={live.fbsAllowed ? 'success' : 'neutral'} size="sm" dot={false}>
                      {live.fbsAllowed ? t('common.yes') : t('common.no')}
                    </Badge>
                  </Field>
                  <Field label={t('fields.dbsAllowed')}>
                    <Badge tone={live.dbsAllowed ? 'success' : 'neutral'} size="sm" dot={false}>
                      {live.dbsAllowed ? t('common.yes') : t('common.no')}
                    </Badge>
                  </Field>
                  <Field label={t('fields.sellerSkuCode')} mono>
                    {dash(live.sellerSkuCode)}
                  </Field>
                </FieldGrid>
              )}
            </Card>
          </section>
        )}

        {/* ── Sotuvlar tarixi ──────────────────────────────────── */}
        <section>
          <h4 className="text-app mb-2 flex items-center justify-between text-[13px] font-semibold">
            <span>{t('products.salesHistory')}</span>
            {skuSales.length > 0 && (
              <span className="text-muted tabular text-[12px] font-normal">
                {t('finance.itemsSold')}: {num(salesTotals.units, lang)} · {money(salesTotals.revenue, lang)}
              </span>
            )}
          </h4>

          {sales.loading && (
            <div className="flex h-20 items-center justify-center">
              <Spinner />
            </div>
          )}
          {sales.error && <ErrorState message={message(sales.error)} onRetry={sales.refetch} compact />}
          {!sales.loading && !sales.error && skuSales.length === 0 && (
            <EmptyState compact icon={TrendingUp} title={t('products.noSalesForSku')} hint={null} />
          )}

          {skuSales.length > 0 && (
            <Card padded={false}>
              <ul>
                {skuSales.slice(0, 20).map((it, i) => (
                  <li key={it.id ?? i} className="border-app flex items-center gap-3 border-b px-4 py-2.5 last:border-0">
                    <span className="text-faint tabular w-6 shrink-0 text-[12px]">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-app tabular text-[13px] font-medium">#{dash(it.orderId)}</p>
                      <p className="text-faint tabular text-[11.5px]">{dateTime(it.date, lang)}</p>
                    </div>
                    <StatusBadge group="financeStatus" value={it.status} size="sm" />
                    <div className="shrink-0 text-right">
                      <p className="text-app tabular text-[13px] font-medium">
                        {money(itemRevenue(it), lang, { currency: false })}
                      </p>
                      <p className="tabular text-[11.5px] text-emerald-600 dark:text-emerald-400">
                        +{money(it.sellerProfit, lang, { currency: false })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>

        {/* ── Qaytarishlar tarixi ──────────────────────────────── */}
        <section>
          <h4 className="text-app mb-2 text-[13px] font-semibold">{t('products.returnsHistory')}</h4>

          {returns.loading && (
            <div className="flex h-20 items-center justify-center">
              <Spinner />
            </div>
          )}
          {returns.error && <ErrorState message={message(returns.error)} onRetry={returns.refetch} compact />}
          {!returns.loading && !returns.error && skuReturns.length === 0 && (
            <EmptyState compact icon={Undo2} title={t('common.noData')} hint={null} />
          )}

          {skuReturns.length > 0 && (
            <Card padded={false}>
              <ul>
                {skuReturns.map((r, i) => (
                  <li key={r.id} className="border-app flex items-center gap-3 border-b px-4 py-2.5 last:border-0">
                    <span className="text-faint tabular w-6 shrink-0 text-[12px]">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-app tabular text-[13px] font-medium">#{r.id}</p>
                      <p className="text-faint tabular text-[11.5px]">
                        {dateTime(r.dateCreated, lang)}
                        {r.executionDate ? ` · ${dateTime(r.executionDate, lang)}` : ''}
                      </p>
                    </div>
                    <Badge size="sm" dot={false}>
                      {t(`enums.returnType.${r.type}`, { defaultValue: r.type })}
                    </Badge>
                    <span className="text-app tabular shrink-0 text-[13px] font-medium">
                      × {num(r.matched.reduce((s, m) => s + (Number(m.amount) || 0), 0), lang)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>

        {/* ── API qaytargan barcha maydonlar ───────────────────── */}
        <DataViewer data={sku} title={`${t('common.allFields')} — SKU`} />
        {product && <DataViewer data={product} title={`${t('common.allFields')} — ${t('products.product')}`} exclude={['skuList']} />}
        {live && <DataViewer data={live} title={`${t('common.allFields')} — ${t('products.fbsStock')}`} />}
      </div>
    </Drawer>
  )
}
