import { forwardRef } from 'react'
import { Loader2, ChevronDown, Search, X } from 'lucide-react'
import { cx } from '../../utils/format'

/* ===== Button ==================================================== */

const BTN_VARIANTS = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300 dark:disabled:bg-brand-900',
  secondary:
    'bg-surface text-app border border-app hover:bg-surface-hover active:bg-surface-2 disabled:opacity-50',
  ghost: 'text-muted hover:bg-surface-hover hover:text-app disabled:opacity-50',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-red-300 dark:disabled:bg-red-950',
  outlineDanger:
    'border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40 disabled:opacity-50',
  success:
    'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-emerald-300 dark:disabled:bg-emerald-950',
}

const BTN_SIZES = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-9.5 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-xl',
  icon: 'h-9 w-9 rounded-lg',
  iconSm: 'h-8 w-8 rounded-lg',
}

export const Button = forwardRef(function Button(
  { variant = 'secondary', size = 'md', loading = false, icon: Icon, children, className, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={cx(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors',
        'disabled:cursor-not-allowed',
        BTN_VARIANTS[variant],
        BTN_SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 size={size === 'lg' ? 18 : 15} className="animate-spin" aria-hidden />
      ) : (
        Icon && <Icon size={size === 'lg' ? 18 : 15} aria-hidden />
      )}
      {children}
    </button>
  )
})

/* ===== Input ===================================================== */

export const Input = forwardRef(function Input(
  { label, hint, error, icon: Icon, className, wrapperClassName, id, ...rest },
  ref,
) {
  const inputId = id || rest.name
  return (
    <div className={cx('flex flex-col gap-1.5', wrapperClassName)}>
      {label && (
        <label htmlFor={inputId} className="text-muted text-[13px] font-medium">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <Icon size={15} className="text-faint pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" aria-hidden />
        )}
        <input
          ref={ref}
          id={inputId}
          className={cx(
            'bg-surface text-app placeholder:text-faint h-9.5 w-full rounded-lg border px-3 text-sm transition-colors',
            'focus:border-brand-500 focus:outline-none',
            'disabled:bg-surface-2 disabled:text-muted disabled:cursor-not-allowed',
            Icon && 'pl-9',
            error && 'border-red-400 dark:border-red-800',
            className,
          )}
          aria-invalid={error ? 'true' : undefined}
          {...rest}
        />
      </div>
      {error ? (
        <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>
      ) : (
        hint && <p className="text-faint text-[12px]">{hint}</p>
      )}
    </div>
  )
})

/** Qidiruv maydoni — tozalash tugmasi bilan */
export function SearchInput({ value, onChange, onClear, placeholder, className, ...rest }) {
  return (
    <div className={cx('relative', className)}>
      <Search size={15} className="text-faint pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cx(
          'bg-surface text-app placeholder:text-faint h-9.5 w-full rounded-lg border pr-8 pl-9 text-sm transition-colors',
          'focus:border-brand-500 focus:outline-none',
          '[&::-webkit-search-cancel-button]:hidden',
        )}
        {...rest}
      />
      {value && (
        <button
          type="button"
          onClick={() => (onClear ? onClear() : onChange(''))}
          className="text-faint hover:text-app absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 transition-colors"
          aria-label="Tozalash"
        >
          <X size={13} />
        </button>
      )}
    </div>
  )
}

/* ===== Select ==================================================== */

export const Select = forwardRef(function Select(
  { label, hint, error, options = [], placeholder, className, wrapperClassName, id, ...rest },
  ref,
) {
  const selectId = id || rest.name
  return (
    <div className={cx('flex flex-col gap-1.5', wrapperClassName)}>
      {label && (
        <label htmlFor={selectId} className="text-muted text-[13px] font-medium">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          className={cx(
            'bg-surface text-app h-9.5 w-full appearance-none rounded-lg border pr-8 pl-3 text-sm transition-colors',
            'focus:border-brand-500 focus:outline-none',
            'disabled:bg-surface-2 disabled:text-muted disabled:cursor-not-allowed',
            error && 'border-red-400 dark:border-red-800',
            className,
          )}
          {...rest}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value ?? o} value={o.value ?? o}>
              {o.label ?? o}
            </option>
          ))}
        </select>
        <ChevronDown
          size={15}
          className="text-faint pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2"
          aria-hidden
        />
      </div>
      {error ? (
        <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>
      ) : (
        hint && <p className="text-faint text-[12px]">{hint}</p>
      )}
    </div>
  )
})

/* ===== Textarea ================================================== */

export const Textarea = forwardRef(function Textarea({ label, hint, error, className, id, ...rest }, ref) {
  const areaId = id || rest.name
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={areaId} className="text-muted text-[13px] font-medium">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={areaId}
        className={cx(
          'bg-surface text-app placeholder:text-faint min-h-[80px] w-full resize-y rounded-lg border px-3 py-2 text-sm transition-colors',
          'focus:border-brand-500 focus:outline-none',
          error && 'border-red-400 dark:border-red-800',
          className,
        )}
        {...rest}
      />
      {error ? (
        <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>
      ) : (
        hint && <p className="text-faint text-[12px]">{hint}</p>
      )}
    </div>
  )
})

/* ===== Checkbox ================================================== */

export function Checkbox({ checked, indeterminate = false, onChange, label, disabled, className }) {
  return (
    <label className={cx('inline-flex cursor-pointer items-center gap-2 select-none', disabled && 'cursor-not-allowed opacity-50', className)}>
      <input
        type="checkbox"
        checked={Boolean(checked)}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked, e)}
        ref={(el) => {
          if (el) el.indeterminate = indeterminate && !checked
        }}
        className={cx(
          'accent-brand-600 size-4 shrink-0 cursor-pointer rounded',
          disabled && 'cursor-not-allowed',
        )}
      />
      {label && <span className="text-sm">{label}</span>}
    </label>
  )
}

/* ===== Switch ==================================================== */

export function Switch({ checked, onChange, label, disabled }) {
  return (
    <label className={cx('inline-flex cursor-pointer items-center gap-2.5 select-none', disabled && 'cursor-not-allowed opacity-50')}>
      <button
        type="button"
        role="switch"
        aria-checked={Boolean(checked)}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={cx(
          'relative h-5.5 w-9.5 shrink-0 rounded-full transition-colors',
          checked ? 'bg-brand-600' : 'bg-[var(--border-strong)]',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 size-4.5 rounded-full bg-white shadow-sm transition-[left] duration-200',
            checked ? 'left-[1.125rem]' : 'left-0.5',
          )}
        />
      </button>
      {label && <span className="text-sm">{label}</span>}
    </label>
  )
}

/* ===== Badge ===================================================== */

const BADGE_TONES = {
  neutral: 'bg-surface-2 text-muted border-app',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-900',
  warning: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-900',
  danger: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-900',
  info: 'bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-950/60 dark:text-brand-300 dark:border-brand-900',
}

export function Badge({ tone = 'neutral', children, className, dot = false, size = 'md' }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-md border font-medium whitespace-nowrap',
        size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-[12px]',
        BADGE_TONES[tone] || BADGE_TONES.neutral,
        className,
      )}
    >
      {dot && <span className="size-1.5 shrink-0 rounded-full bg-current opacity-70" aria-hidden />}
      {children}
    </span>
  )
}

/* ===== Spinner / Skeleton ======================================== */

export function Spinner({ size = 18, className }) {
  return <Loader2 size={size} className={cx('text-muted animate-spin', className)} aria-hidden />
}

export function Skeleton({ className, rounded = 'rounded-md' }) {
  return <div className={cx('skeleton', rounded, className)} aria-hidden />
}

/** Jadval yuklanayotgandagi skelet qatorlari */
export function SkeletonRows({ rows = 6, cols = 5 }) {
  return Array.from({ length: rows }, (_, r) => (
    <tr key={r} className="border-app border-b last:border-0">
      {Array.from({ length: cols }, (_, c) => (
        <td key={c} className="px-4 py-3.5">
          <Skeleton className={cx('h-4', c === 0 ? 'w-3/4' : 'w-1/2')} />
        </td>
      ))}
    </tr>
  ))
}

/* ===== Tooltip (CSS asosida, JS'siz) ============================= */

export function Tooltip({ label, children, side = 'top' }) {
  const pos = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
  }[side]

  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cx(
          'pointer-events-none absolute z-50 rounded-md bg-neutral-900 px-2 py-1 text-[11px] whitespace-nowrap text-white opacity-0 transition-opacity',
          'group-hover/tt:opacity-100 dark:bg-neutral-700',
          pos,
        )}
      >
        {label}
      </span>
    </span>
  )
}
