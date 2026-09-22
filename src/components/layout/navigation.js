import {
  LayoutDashboard,
  Package,
  Boxes,
  Repeat,
  Warehouse,
  ShoppingCart,
  Filter,
  PackageCheck,
  Undo2,
  ShieldAlert,
  FileText,
  Truck,
  TrendingUp,
  Receipt,
  Calculator,
  FileSpreadsheet,
  Scale,
  Banknote,
  ClipboardList,
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
      { to: '/turnover', key: 'nav.turnover', icon: Repeat },
      { to: '/warehouses', key: 'nav.warehouses', icon: Warehouse, needsShop: true },
    ],
  },
  {
    group: 'nav.groupSales',
    items: [
      { to: '/orders', key: 'nav.orders', icon: ShoppingCart },
      { to: '/returns', key: 'nav.returns', icon: Undo2 },
      { to: '/problem-orders', key: 'nav.problemOrders', icon: ShieldAlert },
      { to: '/funnel', key: 'nav.funnel', icon: Filter },
      { to: '/commission-goods', key: 'nav.commissionGoods', icon: PackageCheck, needsShop: true },
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
      { to: '/cashflow', key: 'nav.cashflow', icon: Banknote, needsShop: true },
      { to: '/settlements', key: 'nav.settlements', icon: Scale, needsShop: true },
    ],
  },
  {
    group: 'nav.groupReports',
    items: [
      { to: '/commission-report', key: 'nav.commissionReport', icon: FileSpreadsheet, needsShop: true },
      { to: '/profit-loss', key: 'nav.profitLoss', icon: Scale, needsShop: true },
      { to: '/unit-economics', key: 'nav.unitEconomics', icon: Calculator, needsShop: true },
      { to: '/purchase-planning', key: 'nav.purchasePlanning', icon: ClipboardList, needsShop: true },
    ],
  },
  {
    group: 'nav.groupSystem',
    items: [{ to: '/settings', key: 'nav.settings', icon: Settings }],
  },
]
