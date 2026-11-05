import { useEffect } from 'react'
import {
  ArrowRight,
  ArrowLeftRight,
  Target,
  ChartNoAxesCombined,
  Wallet,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Brand } from '../components/Brand'

export function LandingPage() {
  useEffect(() => {
    document.title = 'Pink Pocket · Personal finance'
  }, [])
  return (
    <div className="min-h-screen bg-surface">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-6 py-7">
        <Brand />
        <nav
          aria-label="Account navigation"
          className="flex items-center gap-5 text-sm font-medium"
        >
          <Link to="/login">Log in</Link>
          <Link to="/register" className="button-primary">
            Get started
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </nav>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-6xl px-6 pb-16"
      >
        <section className="grid items-center gap-12 py-16 md:grid-cols-[1.2fr_1fr] md:py-16">
          <div>
            <h1 className="mt-5 max-w-xl text-5xl leading-[1.12] font-semibold tracking-tight sm:text-6xl">
              Your money.
              <br />
              <span className="text-[#a64b68]">At a glance.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-muted">
              Track spending. Plan budgets. See the bigger picture.
            </p>
            <Link to="/dashboard" className="button-primary mt-8">
              Open dashboard
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <div className="card relative p-8 sm:p-10">
            <span className="inline-flex rounded-2xl bg-secondary p-4">
              <Wallet size={34} strokeWidth={1.5} aria-hidden="true" />
            </span>
            <p className="mt-8 text-xs font-semibold uppercase tracking-widest text-muted">
              Pink Pocket
            </p>
            <h2 className="mt-3 text-3xl leading-tight font-semibold">
              Track. Plan. Review.
            </h2>
            <div className="mt-8 space-y-3">
              {['Transactions', 'Budgets', 'Analytics'].map((label, i) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-xl bg-surface px-4 py-3 text-sm"
                >
                  <span
                    className={`h-3 w-3 rounded-full ${['bg-primary', 'bg-lavender', 'bg-sage'][i]}`}
                  />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </section>
        <section aria-labelledby="features-heading">
          <h2
            id="features-heading"
            className="text-2xl font-semibold tracking-tight"
          >
            Simple tools. Clear finances.
          </h2>
          <div className="mt-7 grid gap-5 md:grid-cols-3">
            {[
              {
                icon: ArrowLeftRight,
                title: 'Transactions',
                text: 'Income and expenses, organized.',
                color: 'bg-lavender',
              },
              {
                icon: Target,
                title: 'Budgets',
                text: 'Monthly limits by category.',
                color: 'bg-sage',
              },
              {
                icon: ChartNoAxesCombined,
                title: 'Analytics',
                text: 'Spending trends and breakdowns.',
                color: 'bg-sky',
              },
            ].map(({ icon: Icon, title, text, color }) => (
              <article key={title} className="card p-7">
                <span className={`inline-flex rounded-xl p-3 ${color}`}>
                  <Icon size={22} aria-hidden="true" />
                </span>
                <h3 className="mt-5 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{text}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
      <footer className="border-t border-line px-6 py-6 text-center text-xs text-muted">
        Pink Pocket
      </footer>
    </div>
  )
}
