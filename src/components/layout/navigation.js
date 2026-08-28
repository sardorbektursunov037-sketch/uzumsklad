import {
  LayoutDashboard,
  Package,
  Boxes,
  ShoppingCart,
  Undo2,
  FileText,
  Truck,
  TrendingUp,
  Receipt,
  Calculator,
  Settings,
} from 'lucide-react'

/**
 * Yon menyu tuzilishi. `group` — i18n kaliti, `null` bo'lsa guruhsiz (yuqorida).
 * `needsShop` — bo'lim ishlashi uchun do'kon tanlangan bo'lishi kerak.
 */
export const NAV = [
  {
    group: null,
    items: [{ to: '/', key: 'nav.dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    group: 'nav.groupCatalog',
    items: [
      { to: '/products', key: 'nav.products', icon: Package, needsShop: true },
      { to: '/stocks', key: 'nav.stocks', icon: Boxes },
    ],
  },
  {
    group: 'nav.groupSales',
    items: [
      { to: '/orders', key: 'nav.orders', icon: ShoppingCart },
      { to: '/returns', key: 'nav.returns', icon: Undo2 },
    ],
  },
  {
    group: 'nav.groupLogistics',
    items: [
      { to: '/fbs-invoices', key: 'nav.fbsInvoices', icon: FileText },
      { to: '/supplies', key: 'nav.fboInvoices', icon: Truck },
    ],
  },
  {
    group: 'nav.groupMoney',
    items: [
      { to: '/finance', key: 'nav.finance', icon: TrendingUp, needsShop: true },
      { to: '/profitability', key: 'nav.profitability', icon: Calculator, needsShop: true },
      { to: '/expenses', key: 'nav.expenses', icon: Receipt },
    ],
  },
  {
    group: 'nav.groupSystem',
    items: [{ to: '/settings', key: 'nav.settings', icon: Settings }],
  },
]
