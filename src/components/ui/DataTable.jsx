import { Fragment, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown } from 'lucide-react'
import { cx } from '../../utils/format'
import { useTheme } from '../../context/ThemeContext'
import { Checkbox, SkeletonRows } from './primitives'
import { EmptyState, ErrorState } from './layout'

/**
 * Umumiy jadval.
 *
 * @param {Array} columns  [{ key, header, render(row, i), align, width, className, headerClassName }]
 * @param {Array} rows
 * @param {Function} rowKey        (row, i) => string|number
 * @param {object} [selection]     useSelection() natijasi — checkbox ustuni qo'shiladi
 * @param {Function} [expandable]  (row) => ReactNode — qatorni yoyish
 * @param {Function} [onRowClick]  (row) => void
 * @param {boolean} [numbered]     tartib raqami (№) ustunini qo'shadi
 * @param {number} [indexOffset]   sahifalashda raqamlash davom etishi uchun (page * size)
 */
export function DataTable({
  columns,
  rows,
  rowKey = (r, i) => r?.id ?? i,
  loading = false,
  error = null,
  onRetry,
  emptyTitle,
  emptyHint,
  emptyIcon,
  emptyAction,
  selection,
  expandable,
  onRowClick,
  rowClassName,
  stickyHeader = true,
  numbered = false,
  indexOffset = 0,
  className,
}) {
  const { t } = useTranslation()
  const { density } = useTheme()
  const [expanded, setExpanded] = useState(() => new Set())

  const compact = density === 'compact'
  const cellPad = compact ? 'px-3 py-2' : 'px-4 py-3'
  const colCount = columns.length + (selection ? 1 : 0) + (expandable ? 1 : 0) + (numbered ? 1 : 0)

  const toggleRow = (key) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div className={cx('bg-surface overflow-hidden rounded-[--radius-card] border shadow-soft', className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead className={cx('bg-surface-2', stickyHeader && 'sticky top-0 z-10')}>
            <tr className="border-app border-b">
              {selection && (
                <th className={cx(cellPad, 'w-10')}>
                  <Checkbox
                    checked={selection.allChecked}
                    indeterminate={selection.someChecked}
                    onChange={selection.toggleAll}
                  />
                  <span className="sr-only">{t('common.selectAll')}</span>
                </th>
              )}
              {expandable && <th className={cx(cellPad, 'w-9')} aria-hidden />}
              {numbered && (
                <th className={cx(cellPad, 'text-muted w-12 text-right text-[12px] font-semibold')}>№</th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className={cx(
                    cellPad,
                    'text-muted text-[12px] font-semibold whitespace-nowrap',
                    col.align === 'right' && 'text-right',
                    col.align === 'center' && 'text-center',
                    col.headerClassName,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading && <SkeletonRows rows={compact ? 10 : 7} cols={colCount} />}

            {!loading && error && (
              <tr>
                <td colSpan={colCount}>
                  <ErrorState message={error} onRetry={onRetry} compact />
                </td>
              </tr>
            )}

            {!loading && !error && (!rows || rows.length === 0) && (
              <tr>
                <td colSpan={colCount}>
                  <EmptyState title={emptyTitle} hint={emptyHint} icon={emptyIcon} action={emptyAction} compact />
                </td>
              </tr>
            )}

            {!loading &&
              !error &&
              rows?.map((row, i) => {
                const key = rowKey(row, i)
                const isOpen = expanded.has(key)
                return (
                  <Fragment key={key}>
                    <tr
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={cx(
                        'border-app border-b transition-colors last:border-0',
                        onRowClick && 'hover:bg-surface-hover cursor-pointer',
                        selection?.isSelected(key) && 'bg-brand-50/60 dark:bg-brand-950/25',
                        typeof rowClassName === 'function' ? rowClassName(row) : rowClassName,
                      )}
                    >
                      {selection && (
                        <td className={cellPad} onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selection.isSelected(key)} onChange={() => selection.toggle(key)} />
                        </td>
                      )}
                      {expandable && (
                        <td className={cellPad} onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => toggleRow(key)}
                            className="text-faint hover:bg-surface-hover hover:text-app -m-1 rounded p-1 transition-colors"
                            aria-expanded={isOpen}
                            aria-label={isOpen ? t('common.collapse') : t('common.expand')}
                          >
                            <ChevronDown size={15} className={cx('transition-transform', isOpen && 'rotate-180')} />
                          </button>
                        </td>
                      )}
                      {numbered && (
                        <td className={cx(cellPad, 'text-faint tabular w-12 text-right text-[12.5px]')}>
                          {indexOffset + i + 1}
                        </td>
                      )}
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className={cx(
                            cellPad,
                            'text-app align-middle text-[13.5px]',
                            col.align === 'right' && 'text-right',
                            col.align === 'center' && 'text-center',
                            col.nowrap !== false && 'whitespace-nowrap',
                            col.className,
                          )}
                        >
                          {col.render ? col.render(row, i) : (row[col.key] ?? '—')}
                        </td>
                      ))}
                    </tr>

                    {expandable && isOpen && (
                      <tr className="border-app border-b last:border-0">
                        <td colSpan={colCount} className="bg-surface-2 p-0">
                          {expandable(row)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ===== Sahifalash ================================================ */

/**
 * @param {number} page   0 dan boshlanadi (API shunday kutadi)
 * @param {number} total  jami yozuvlar soni (noma'lum bo'lsa — undefined)
 */
export function Pagination({ page, size, total, onPage, onSize, sizes = [10, 20, 50, 100], hasMore }) {
  const { t } = useTranslation()

  const totalPages = total !== undefined && total !== null ? Math.max(1, Math.ceil(total / size)) : null
  const from = total === 0 ? 0 : page * size + 1
  const to = total !== undefined && total !== null ? Math.min((page + 1) * size, total) : (page + 1) * size
  const canPrev = page > 0
  const canNext = totalPages !== null ? page < totalPages - 1 : Boolean(hasMore)

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <div className="text-muted flex items-center gap-3 text-[13px]">
        {total !== undefined && total !== null ? (
          <span className="tabular">{t('common.showing', { from, to, total })}</span>
        ) : (
          <span className="tabular">
            {t('common.page')} {page + 1}
          </span>
        )}

        {onSize && (
          <label className="flex items-center gap-1.5">
            <span className="hidden sm:inline">{t('common.perPage')}</span>
            <select
              value={size}
              onChange={(e) => {
                onSize(Number(e.target.value))
                onPage(0)
              }}
              className="bg-surface text-app h-7 rounded-md border px-1.5 text-[13px] focus:outline-none"
            >
              {sizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex items-center gap-1">
        <PageBtn onClick={() => onPage(0)} disabled={!canPrev} label={t('common.first')}>
          <ChevronsLeft size={15} />
        </PageBtn>
        <PageBtn onClick={() => onPage(page - 1)} disabled={!canPrev} label={t('common.prev')}>
          <ChevronLeft size={15} />
        </PageBtn>

        <span className="text-muted tabular px-2 text-[13px]">
          {page + 1}
          {totalPages !== null && ` / ${totalPages}`}
        </span>

        <PageBtn onClick={() => onPage(page + 1)} disabled={!canNext} label={t('common.next')}>
          <ChevronRight size={15} />
        </PageBtn>
        {totalPages !== null && (
          <PageBtn onClick={() => onPage(totalPages - 1)} disabled={!canNext} label={t('common.last')}>
            <ChevronsRight size={15} />
          </PageBtn>
        )}
      </div>
    </div>
  )
}

function PageBtn({ children, onClick, disabled, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cx(
        'bg-surface grid size-8 place-items-center rounded-lg border transition-colors',
        disabled ? 'text-faint cursor-not-allowed opacity-50' : 'text-muted hover:bg-surface-hover hover:text-app',
      )}
    >
      {children}
    </button>
  )
}
