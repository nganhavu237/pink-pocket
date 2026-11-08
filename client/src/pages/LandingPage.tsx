import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { LandingPreview } from '../components/LandingPreview'
import { useAuth } from '../hooks/useAuth'
import './LandingPage.css'

export function LandingPage() {
  const { user } = useAuth()
  useEffect(() => {
    document.title = 'Pink Pocket · Personal finance'
  }, [])
  return (
    <div className="landing-page min-h-screen bg-surface">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-6 py-7">
        <Brand />
        <nav
          aria-label="Account navigation"
          className="flex items-center gap-5 text-sm font-medium"
        >
          <Link to={user ? '/dashboard' : '/login'}>Log in</Link>
          <Link
            to={user ? '/dashboard' : '/register'}
            className="button-primary"
          >
            Get started
          </Link>
        </nav>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-6xl px-6 pb-16"
      >
        <section className="grid items-center gap-12 py-16 md:grid-cols-[1.2fr_1fr] md:py-16">
          <div className="landing-entrance">
            <h1 className="mt-5 max-w-xl text-5xl leading-[1.12] font-extrabold tracking-tight sm:text-6xl">
              Track your
              <br />
              <span className="text-[#a64b68]">spending.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-muted">
              Manage expenses and budgets in one place.
            </p>
            <Link
              to={user ? '/dashboard' : '/login'}
              className="button-primary mt-8"
            >
              Open dashboard
            </Link>
          </div>
          <div className="landing-entrance landing-preview-entrance min-w-0">
            <LandingPreview />
          </div>
        </section>
      </main>
      <footer className="border-t border-line px-6 py-6 text-center text-xs text-muted">
        Pink Pocket
      </footer>
    </div>
  )
}
