import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { ErrorMessage, LoadingState } from '../components/Feedback'
import { useAuth } from '../hooks/useAuth'
export function AuthPage({ register = false }: { register?: boolean }) {
  useEffect(() => {
    document.title = `${register ? 'Create an account' : 'Log in'} · Pink Pocket`
  }, [register])
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const target =
    typeof location.state?.from === 'string' &&
    location.state.from.startsWith('/') &&
    !location.state.from.startsWith('//')
      ? location.state.from
      : '/dashboard'
  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (register) await auth.register(name, email, password)
      else await auth.login(email, password)
      navigate(target, { replace: true })
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  if (!auth.ready) return <LoadingState />
  if (auth.user) return <Navigate to="/dashboard" replace />
  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <Brand />
      <section className="card mt-9 p-7">
        <h1 className="mb-6 text-2xl font-semibold">
          {register ? 'Create an account' : 'Log in'}
        </h1>
        <form className="space-y-4" onSubmit={submit}>
          {register && (
            <label className="block">
              Name
              <input
                className="field"
                autoComplete="name"
                required
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          )}
          <label className="block">
            Email
            <input
              className="field"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="block">
            Password
            <input
              className="field"
              type="password"
              aria-describedby={register ? 'password-help' : undefined}
              autoComplete={register ? 'new-password' : 'current-password'}
              required
              minLength={register ? 8 : 1}
              maxLength={72}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {register && (
            <p id="password-help" className="text-xs text-muted">
              At least 8 characters
            </p>
          )}
          {(error || auth.error) && (
            <ErrorMessage message={error || auth.error} />
          )}
          <button
            className="button-primary w-full"
            disabled={busy}
            type="submit"
          >
            {busy ? 'Please wait…' : register ? 'Create Account' : 'Log In'}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-muted">
          {register ? 'Already have an account?' : 'New to Pink Pocket?'}{' '}
          <Link
            className="text-ink underline"
            to={register ? '/login' : '/register'}
          >
            {register ? 'Log in' : 'Create an account'}
          </Link>
        </p>
      </section>
    </main>
  )
}
