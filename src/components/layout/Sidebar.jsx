import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PanelLeftClose, PanelLeft, X } from 'lucide-react'
import { cx } from '../../utils/format'
import { NAV } from './navigation'
import { Logo } from '../Logo'

function Brand({ collapsed }) {
  const { t } = useTranslation()

  if (collapsed) {
    return (
      <div className="flex justify-center">
        <Logo variant="mark" height={30} />
      </div>
    )
  }

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Logo height={26} />
      <span className="border-app text-faint shrink-0 border-l pl-2.5 text-[11px] leading-tight">
        {t('app.name').replace('Uzum ', '')}
      </span>
    </div>
  )
}

/**
 * @param {boolean} collapsed  desktop'da faqat ikonkalar
 * @param {boolean} mobileOpen mobil qurilmada chiquvchi panel
 */
export function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile }) {
  const { t } = useTranslation()

  const content = (
    <>
      <div className={cx('flex h-14 shrink-0 items-center justify-between gap-2 px-3.5', collapsed && 'px-2.5')}>
        <Brand collapsed={collapsed} />
        <button
          type="button"
          onClick={onCloseMobile}
          className="text-faint hover:bg-surface-hover hover:text-app rounded-lg p-1.5 transition-colors lg:hidden"
          aria-label={t('common.close')}
        >
          <X size={17} />
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">
        {NAV.map((section, si) => (
          <div key={si} className={cx(si > 0 && 'mt-4')}>
            {section.group && !collapsed && (
              <p className="text-faint px-2.5 pb-1.5 text-[11px] font-semibold tracking-wide uppercase">
                {t(section.group)}
              </p>
            )}
            {section.group && collapsed && <div className="border-app mx-2 mb-2 border-t" />}

            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onCloseMobile}
                    title={collapsed ? t(item.key) : undefined}
                    className={({ isActive }) =>
                      cx(
                        'group relative flex items-center gap-3 rounded-lg text-[13.5px] font-medium transition-colors',
                        collapsed ? 'h-9 justify-center px-0' : 'h-9 px-2.5',
                        isActive
                          ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                          : 'text-muted hover:bg-surface-hover hover:text-app',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span className="bg-brand-600 dark:bg-brand-400 absolute top-1/2 -left-2.5 h-5 w-1 -translate-y-1/2 rounded-r-full" />
                        )}
                        <item.icon size={17} className="shrink-0" aria-hidden />
                        {!collapsed && <span className="truncate">{t(item.key)}</span>}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-app hidden shrink-0 border-t p-2.5 lg:block">
        <button
          type="button"
          onClick={onToggleCollapse}
          className={cx(
            'text-muted hover:bg-surface-hover hover:text-app flex h-9 w-full items-center gap-3 rounded-lg text-[13px] font-medium transition-colors',
            collapsed ? 'justify-center' : 'px-2.5',
          )}
          aria-label={collapsed ? t('common.expand') : t('common.collapse')}
        >
          {collapsed ? <PanelLeft size={17} /> : <PanelLeftClose size={17} />}
          {!collapsed && <span>{t('common.collapse')}</span>}
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop */}
      <aside
        className={cx(
          'bg-surface border-app fixed inset-y-0 left-0 z-30 hidden shrink-0 flex-col border-r transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[4.25rem]' : 'w-60',
        )}
      >
        {content}
      </aside>

      {/* Mobil */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="animate-in absolute inset-0 bg-neutral-950/50 backdrop-blur-[2px]" onClick={onCloseMobile} aria-hidden />
          <aside className="bg-surface animate-slide-right absolute inset-y-0 left-0 flex w-64 flex-col border-r shadow-pop">
            {content}
          </aside>
        </div>
      )}
    </>
  )
}
