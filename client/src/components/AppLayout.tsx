import {
  ArrowLeftRight,
  ChartNoAxesCombined,
  LayoutDashboard,
  Settings,
  Target,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { Brand } from './Brand'
import { useAuth } from '../hooks/useAuth'
import { useState } from 'react'
import { ErrorMessage } from './Feedback'

const navigation = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/budgets', label: 'Budgets', icon: Target },
  { to: '/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function AppLayout() {
  const { user, logout } = useAuth()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function signOut() {
    setBusy(true)
    setError('')
    try {
      await logout()
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[250px_1fr]">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="border-b border-line bg-white p-5 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-r lg:border-b-0 lg:p-7">
        <Brand />
        <nav
          aria-label="Main navigation"
          className="mt-5 grid grid-cols-2 gap-1 sm:flex sm:flex-wrap lg:flex-col lg:gap-2"
        >
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${isActive ? 'bg-secondary text-ink' : 'text-muted hover:bg-surface hover:text-ink'}`
              }
            >
              <Icon size={19} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-6 py-5 lg:px-10">
          <p className="text-sm text-muted">{user?.name}</p>
          <button
            className="button-secondary"
            type="button"
            disabled={busy}
            onClick={signOut}
          >
            {busy ? 'Logging out…' : 'Log Out'}
          </button>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto max-w-6xl px-6 py-9 lg:px-10 lg:py-9"
        >
          {error && <ErrorMessage message={error} />}
          <Outlet />
        </main>
      </div>
    </div>
  )
}
