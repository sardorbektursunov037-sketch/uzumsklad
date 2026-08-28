import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Menu, Sun, Moon, Monitor, Languages, Store, LogOut, Check, ChevronDown, RefreshCw } from 'lucide-react'
import { cx } from '../../utils/format'
import { useTheme } from '../../context/ThemeContext'
import { useAuth } from '../../context/AuthContext'
import { LANGUAGES, LANG_KEY } from '../../i18n'
import { Button, Dropdown, MenuItem, MenuDivider, MenuLabel, Spinner, ConfirmDialog } from '../ui'

const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor }

export function Topbar({ onOpenMobileNav }) {
  const { t, i18n } = useTranslation()
  const { theme, setTheme, isDark } = useTheme()
  const { shops, shopsLoading, activeShop, activeShopId, setActiveShopId, logout, reloadShops, serverToken } = useAuth()
  const [confirmLogout, setConfirmLogout] = useState(false)

  const changeLang = (code) => {
    i18n.changeLanguage(code)
    try {
      localStorage.setItem(LANG_KEY, code)
    } catch {
      /* e'tiborsiz */
    }
  }

  const currentLang = LANGUAGES.find((l) => l.code === i18n.resolvedLanguage) || LANGUAGES[0]

  return (
    <header className="bg-surface/85 border-app sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-3 backdrop-blur-md sm:px-5">
      <button
        type="button"
        onClick={onOpenMobileNav}
        className="text-muted hover:bg-surface-hover hover:text-app -ml-1 rounded-lg p-2 transition-colors lg:hidden"
        aria-label={t('common.moreActions')}
      >
        <Menu size={18} />
      </button>

      {/* Do'kon tanlagich */}
      <Dropdown
        align="left"
        trigger={({ toggle, open }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            className="hover:bg-surface-hover flex h-9 max-w-[15rem] items-center gap-2 rounded-lg border px-2.5 transition-colors"
          >
            <Store size={15} className="text-brand-600 dark:text-brand-400 shrink-0" aria-hidden />
            <span className="text-app min-w-0 flex-1 truncate text-left text-[13px] font-medium">
              {shopsLoading && !activeShop
                ? t('common.loading')
                : activeShop?.name || (shops.length ? t('common.allShops') : t('common.selectShop'))}
            </span>
            <ChevronDown size={14} className={cx('text-faint shrink-0 transition-transform', open && 'rotate-180')} />
          </button>
        )}
      >
        <MenuLabel>{t('settings.shops')}</MenuLabel>
        {shopsLoading && (
          <div className="flex items-center gap-2 px-2.5 py-2">
            <Spinner size={14} />
            <span className="text-muted text-[13px]">{t('common.loading')}</span>
          </div>
        )}
        {!shopsLoading && shops.length === 0 && (
          <p className="text-faint px-2.5 py-2 text-[13px]">{t('common.noData')}</p>
        )}
        {shops.length > 1 && (
          <MenuItem onClick={() => setActiveShopId(null)}>
            <span className="flex items-center justify-between gap-2">
              <span>{t('common.allShops')}</span>
              {!activeShopId && <Check size={14} className="text-brand-600 dark:text-brand-400 shrink-0" />}
            </span>
          </MenuItem>
        )}
        {shops.map((s) => (
          <MenuItem key={s.id} onClick={() => setActiveShopId(s.id)}>
            <span className="flex items-center justify-between gap-2">
              <span className="truncate">{s.name || `#${s.id}`}</span>
              {s.id === activeShopId && <Check size={14} className="text-brand-600 dark:text-brand-400 shrink-0" />}
            </span>
          </MenuItem>
        ))}
        <MenuDivider />
        <MenuItem icon={RefreshCw} onClick={() => reloadShops()}>
          {t('common.refresh')}
        </MenuItem>
      </Dropdown>

      <div className="flex-1" />

      {/* Til */}
      <Dropdown
        trigger={({ toggle, open }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label={t('lang.label')}
            className="text-muted hover:bg-surface-hover hover:text-app flex h-9 items-center gap-1.5 rounded-lg px-2.5 transition-colors"
          >
            <Languages size={17} aria-hidden />
            <span className="text-[12px] font-semibold">{currentLang.short}</span>
          </button>
        )}
      >
        <MenuLabel>{t('lang.label')}</MenuLabel>
        {LANGUAGES.map((l) => (
          <MenuItem key={l.code} onClick={() => changeLang(l.code)}>
            <span className="flex items-center justify-between gap-2">
              <span>{l.label}</span>
              {l.code === currentLang.code && <Check size={14} className="text-brand-600 dark:text-brand-400" />}
            </span>
          </MenuItem>
        ))}
      </Dropdown>

      {/* Mavzu */}
      <Dropdown
        trigger={({ toggle, open }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label={t('theme.label')}
            className="text-muted hover:bg-surface-hover hover:text-app flex size-9 items-center justify-center rounded-lg transition-colors"
          >
            {isDark ? <Moon size={17} /> : <Sun size={17} />}
          </button>
        )}
      >
        <MenuLabel>{t('theme.label')}</MenuLabel>
        {['light', 'dark', 'system'].map((mode) => {
          const Icon = THEME_ICONS[mode]
          return (
            <MenuItem key={mode} icon={Icon} onClick={() => setTheme(mode)}>
              <span className="flex items-center justify-between gap-2">
                <span>{t(`theme.${mode}`)}</span>
                {theme === mode && <Check size={14} className="text-brand-600 dark:text-brand-400" />}
              </span>
            </MenuItem>
          )
        })}
      </Dropdown>

      {!serverToken && (
        <Button variant="ghost" size="icon" onClick={() => setConfirmLogout(true)} aria-label={t('auth.logout')}>
          <LogOut size={17} />
        </Button>
      )}

      <ConfirmDialog
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        onConfirm={() => {
          setConfirmLogout(false)
          logout()
        }}
        title={t('auth.logout')}
        body={t('auth.logoutConfirm')}
        confirmLabel={t('auth.logout')}
      />
    </header>
  )
}
