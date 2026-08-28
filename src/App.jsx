import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FileQuestion } from 'lucide-react'

import { useAuth } from './context/AuthContext'
import { AppLayout } from './components/layout/AppLayout'
import { Spinner, EmptyState, Button } from './components/ui'
import Login from './pages/Login'

// Og'ir sahifalar (grafiklar, katta jadvallar) talab bo'yicha yuklanadi
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Products = lazy(() => import('./pages/Products'))
const Orders = lazy(() => import('./pages/Orders'))
const Stocks = lazy(() => import('./pages/Stocks'))
const FbsInvoices = lazy(() => import('./pages/FbsInvoices'))
const Supplies = lazy(() => import('./pages/Supplies'))
const Returns = lazy(() => import('./pages/Returns'))
const Finance = lazy(() => import('./pages/Finance'))
const Expenses = lazy(() => import('./pages/Expenses'))
const Profitability = lazy(() => import('./pages/Profitability'))
const Settings = lazy(() => import('./pages/Settings'))

function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner size={26} />
    </div>
  )
}

function NotFound() {
  const { t } = useTranslation()
  return (
    <EmptyState
      icon={FileQuestion}
      title={t('errors.pageNotFound')}
      hint={t('errors.pageNotFoundHint')}
      action={
        <Button variant="primary" onClick={() => window.history.back()}>
          {t('common.back')}
        </Button>
      }
    />
  )
}

export default function App() {
  const { authenticated, ready } = useAuth()

  // /api/config javobini kutamiz — serverda token bo'lsa login ekrani chiqmaydi
  if (!ready) {
    return (
      <div className="bg-app flex min-h-screen items-center justify-center">
        <Spinner size={26} />
      </div>
    )
  }

  if (!authenticated) return <Login />

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route
          path="/"
          element={
            <Suspense fallback={<PageLoader />}>
              <Dashboard />
            </Suspense>
          }
        />
        <Route
          path="/products"
          element={
            <Suspense fallback={<PageLoader />}>
              <Products />
            </Suspense>
          }
        />
        <Route
          path="/orders"
          element={
            <Suspense fallback={<PageLoader />}>
              <Orders />
            </Suspense>
          }
        />
        <Route
          path="/orders/:orderId"
          element={
            <Suspense fallback={<PageLoader />}>
              <Orders />
            </Suspense>
          }
        />
        <Route
          path="/stocks"
          element={
            <Suspense fallback={<PageLoader />}>
              <Stocks />
            </Suspense>
          }
        />
        <Route
          path="/fbs-invoices"
          element={
            <Suspense fallback={<PageLoader />}>
              <FbsInvoices />
            </Suspense>
          }
        />
        <Route
          path="/supplies"
          element={
            <Suspense fallback={<PageLoader />}>
              <Supplies />
            </Suspense>
          }
        />
        <Route
          path="/returns"
          element={
            <Suspense fallback={<PageLoader />}>
              <Returns />
            </Suspense>
          }
        />
        <Route
          path="/finance"
          element={
            <Suspense fallback={<PageLoader />}>
              <Finance />
            </Suspense>
          }
        />
        <Route
          path="/expenses"
          element={
            <Suspense fallback={<PageLoader />}>
              <Expenses />
            </Suspense>
          }
        />
        <Route
          path="/profitability"
          element={
            <Suspense fallback={<PageLoader />}>
              <Profitability />
            </Suspense>
          }
        />
        <Route
          path="/settings"
          element={
            <Suspense fallback={<PageLoader />}>
              <Settings />
            </Suspense>
          }
        />
        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Route>
    </Routes>
  )
}
