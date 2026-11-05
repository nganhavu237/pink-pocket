import { useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useResource } from '../hooks/useResource'
import { api, send } from '../services/api'
import type { Category, User } from '../types'
import { PageHeader } from '../components/PageHeader'
import { ErrorMessage, LoadingState } from '../components/Feedback'
export function SettingsPage() {
  const { user, updateUser } = useAuth()
  const [name, setName] = useState(user!.name)
  const [email, setEmail] = useState(user!.email)
  const [currency, setCurrency] = useState(user!.currency)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const categories = useResource<Category[]>('/categories')
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      updateUser(
        await api<User>('/settings', send('PUT', { name, email, currency })),
      )
      setNotice('Settings saved.')
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid items-start gap-5 md:grid-cols-2">
        <section className="card p-6">
          <h2 className="mb-5 font-semibold">Account</h2>
          <form className="space-y-4" onSubmit={submit}>
            <label className="block">
              Name
              <input
                className="field"
                required
                maxLength={100}
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="block">
              Email
              <input
                className="field"
                required
                type="email"
                maxLength={254}
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="block">
              Currency
              <select
                aria-label="Currency"
                className="field"
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
              >
                {['USD', 'EUR', 'GBP', 'CAD', 'AUD'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <p className="text-xs text-muted">
              Changes display currency. Existing amounts are not converted.
            </p>
            {error && <ErrorMessage message={error} />}{' '}
            {notice && (
              <p role="status" className="text-sm">
                {notice}
              </p>
            )}
            <button className="button-primary" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save Changes'}
            </button>
          </form>
        </section>
        <section className="card p-6">
          <h2 className="mb-5 font-semibold">Categories</h2>
          {categories.loading ? (
            <LoadingState />
          ) : categories.error ? (
            <ErrorMessage
              message={categories.error}
              retry={categories.reload}
            />
          ) : (
            ['EXPENSE', 'INCOME'].map((type) => (
              <div key={type} className="mb-5">
                <h3 className="mb-3 text-sm text-muted">
                  {type === 'EXPENSE' ? 'Expense' : 'Income'}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {categories.data
                    ?.filter((cat) => cat.type === type)
                    .map((cat) => (
                      <span
                        className={`rounded-lg px-3 py-2 text-sm ${type === 'EXPENSE' ? 'bg-secondary' : 'bg-sage'}`}
                        key={cat.id}
                      >
                        {cat.name}
                      </span>
                    ))}
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </>
  )
}
