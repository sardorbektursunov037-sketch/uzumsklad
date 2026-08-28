import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cx } from '../../utils/format'
import { useStoredState } from '../../hooks/misc'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppLayout() {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useStoredState('uzum.sidebar.collapsed', false)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="bg-app min-h-screen">
      <a
        href="#main"
        className="bg-brand-600 sr-only rounded-lg px-4 py-2 text-white focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[100]"
      >
        {t('nav.dashboard')}
      </a>

      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className={cx('transition-[padding] duration-200', collapsed ? 'lg:pl-[4.25rem]' : 'lg:pl-60')}>
        <Topbar onOpenMobileNav={() => setMobileOpen(true)} />
        <main id="main" className="mx-auto w-full max-w-[110rem] px-3 py-5 sm:px-5 sm:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
