import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X, AlertTriangle } from 'lucide-react'
import { cx } from '../../utils/format'
import { useClickOutside, useEscape, useLockScroll } from '../../hooks/misc'
import { Button } from './primitives'

/* ===== Modal ===================================================== */

const MODAL_WIDTHS = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', closeOnOverlay = true }) {
  const panelRef = useRef(null)
  useEscape(onClose, open)
  useLockScroll(open)

  // Ochilganda fokusni modal ichiga ko'chiramiz
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector(
        'input:not([type="hidden"]), select, textarea, button:not([data-close])',
      )
      first?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="animate-in absolute inset-0 bg-neutral-950/50 backdrop-blur-[2px]"
        onClick={closeOnOverlay ? onClose : undefined}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'bg-surface animate-slide-up relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border shadow-pop sm:rounded-2xl',
          MODAL_WIDTHS[size],
        )}
      >
        <div className="border-app flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-app text-[15px] font-semibold">{title}</h2>
            {subtitle && <p className="text-muted mt-0.5 text-[13px]">{subtitle}</p>}
          </div>
          <button
            type="button"
            data-close
            onClick={onClose}
            className="text-faint hover:bg-surface-hover hover:text-app -m-1.5 rounded-lg p-1.5 transition-colors"
            aria-label="Yopish"
          >
            <X size={17} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && <div className="border-app bg-surface-2 flex justify-end gap-2 rounded-b-2xl border-t px-5 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ===== Drawer (o'ngdan chiquvchi panel) ========================== */

export function Drawer({ open, onClose, title, subtitle, children, footer, width = 'max-w-xl' }) {
  useEscape(onClose, open)
  useLockScroll(open)

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[80] flex justify-end">
      <div className="animate-in absolute inset-0 bg-neutral-950/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx('bg-surface animate-slide-left relative flex h-full w-full flex-col border-l shadow-pop', width)}
      >
        <div className="border-app flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-app truncate text-[15px] font-semibold">{title}</h2>
            {subtitle && <p className="text-muted mt-0.5 text-[13px]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-faint hover:bg-surface-hover hover:text-app -m-1.5 rounded-lg p-1.5 transition-colors"
            aria-label="Yopish"
          >
            <X size={17} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && <div className="border-app bg-surface-2 flex justify-end gap-2 border-t px-5 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ===== Tasdiqlash dialogi ======================================== */

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  variant = 'danger',
  loading = false,
  children,
}) {
  const { t } = useTranslation()

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmLabel || t('common.confirm')}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        {variant === 'danger' && (
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400">
            <AlertTriangle size={17} aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {body && <p className="text-muted text-[13.5px] leading-relaxed">{body}</p>}
          {children && <div className={cx(body && 'mt-4')}>{children}</div>}
        </div>
      </div>
    </Modal>
  )
}

/* ===== Dropdown ================================================== */

/**
 * @param {Function} trigger  `({ open, toggle, ref }) => ReactNode`
 */
export function Dropdown({ trigger, children, align = 'right', className, panelClassName }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useClickOutside(ref, () => setOpen(false), open)
  useEscape(() => setOpen(false), open)

  return (
    <div ref={ref} className={cx('relative', className)}>
      {trigger({ open, toggle: () => setOpen((v) => !v), close: () => setOpen(false) })}
      {open && (
        <div
          className={cx(
            'bg-surface animate-slide-up absolute z-50 mt-1.5 min-w-[12rem] rounded-xl border p-1 shadow-pop',
            align === 'right' ? 'right-0' : 'left-0',
            panelClassName,
          )}
          onClick={(e) => {
            // Menyu bandi bosilganda dropdown yopiladi
            if (e.target.closest('[data-menu-item]')) setOpen(false)
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

export function MenuItem({ icon: Icon, children, onClick, danger = false, disabled = false, className }) {
  return (
    <button
      type="button"
      data-menu-item
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40',
        danger
          ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40'
          : 'text-app hover:bg-surface-hover',
        className,
      )}
    >
      {Icon && <Icon size={15} className="shrink-0 opacity-70" aria-hidden />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  )
}

export function MenuDivider() {
  return <div className="border-app my-1 border-t" />
}

export function MenuLabel({ children }) {
  return <p className="text-faint px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide uppercase">{children}</p>
}
