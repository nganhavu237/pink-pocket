import { lazy, Suspense } from 'react'
import {
  BrowserRouter,
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { LandingPage } from './pages/LandingPage'
const OverviewPage = lazy(() =>
  import('./pages/OverviewPage').then((module) => ({
    default: module.OverviewPage,
  })),
)
const TransactionsPage = lazy(() =>
  import('./pages/TransactionsPage').then((module) => ({
    default: module.TransactionsPage,
  })),
)
const BudgetsPage = lazy(() =>
  import('./pages/BudgetsPage').then((module) => ({
    default: module.BudgetsPage,
  })),
)
const AnalyticsPage = lazy(() =>
  import('./pages/AnalyticsPage').then((module) => ({
    default: module.AnalyticsPage,
  })),
)
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((module) => ({
    default: module.SettingsPage,
  })),
)
import { AuthPage } from './pages/AuthPage'
import { AuthProvider } from './contexts/AuthProvider'
import { useAuth } from './hooks/useAuth'
import { ErrorMessage, LoadingState } from './components/Feedback'
function ProtectedRoute() {
  const auth = useAuth()
  const location = useLocation()
  if (!auth.ready) return <LoadingState />
  if (auth.error)
    return (
      <main className="mx-auto max-w-lg p-6">
        <ErrorMessage message={auth.error} retry={auth.refresh} />
      </main>
    )
  if (!auth.user)
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    )
  return <Outlet />
}
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<LoadingState />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<OverviewPage />} />
                <Route path="/transactions" element={<TransactionsPage />} />
                <Route path="/budgets" element={<BudgetsPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
            </Route>
            <Route path="/login" element={<AuthPage />} />
            <Route path="/register" element={<AuthPage register />} />
            <Route
              path="*"
              element={
                <main className="mx-auto max-w-lg px-6 py-24">
                  <h1 className="text-3xl font-semibold">Page not found</h1>
                  <Link to="/" className="button-primary mt-5">
                    Back to home
                  </Link>
                </main>
              }
            />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}
