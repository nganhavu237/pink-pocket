import { useState, type FormEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useResource } from '../hooks/useResource'
import { api, send } from '../services/api'
import type { Category, User } from '../types'
import { PageHeader } from '../components/PageHeader'
import { CategoryManager } from '../components/CategoryManager'
import { ErrorMessage, LoadingState } from '../components/Feedback'
import './SettingsPage.css'

const currencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'VND']
export function SettingsPage() {
  const { user, updateUser } = useAuth()
  const [name, setName] = useState(user!.name),
    [email, setEmail] = useState(user!.email)
  const [currency, setCurrency] = useState(
    currencies.includes(user!.currency) ? user!.currency : 'CUSTOM',
  )
  const [customCurrency, setCustomCurrency] = useState(
    currencies.includes(user!.currency) ? '' : user!.currency,
  )
  const [startingBalance, setStartingBalance] = useState(
    user!.startingBalance ?? '0.00',
  )
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const categories = useResource<Category[]>('/categories')
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const selected =
        currency === 'CUSTOM' ? customCurrency.trim().toUpperCase() : currency
      updateUser(
        await api<User>(
          '/settings',
          send('PUT', {
            name,
            email,
            currency: selected,
            startingBalance: startingBalance.trim() || '0.00',
          }),
        ),
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
          <form className="settings-form space-y-4" onSubmit={submit}>
            <label className="settings-field">
              <span className="settings-label">Name</span>
              <input
                className="field"
                required
                maxLength={100}
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="settings-field">
              <span className="settings-label">Email</span>
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
            <label className="settings-field">
              <span className="settings-label">Currency</span>
              <span className="relative block min-w-0">
                <select
                  aria-label="Currency"
                  className="field"
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                >
                  {currencies.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                  <option value="CUSTOM">Other / Custom Currency</option>
                </select>
                <ChevronDown
                  size={16}
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted"
                />
              </span>
            </label>
            {currency === 'CUSTOM' && (
              <label className="settings-field">
                <span className="settings-label">Currency code</span>
                <input
                  className="field uppercase"
                  aria-describedby="currency-help"
                  aria-label="Currency code"
                  required
                  maxLength={3}
                  minLength={3}
                  pattern="[A-Za-z]{3}"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="JPY"
                  value={customCurrency}
                  onChange={(event) =>
                    setCustomCurrency(event.target.value.toUpperCase())
                  }
                />
                <span
                  id="currency-help"
                  className="settings-label text-xs font-normal text-muted"
                >
                  3-letter code, e.g. JPY.
                </span>
              </label>
            )}
            <label className="settings-field">
              <span className="settings-label">Starting Balance</span>
              <input
                className="field"
                type="text"
                inputMode="decimal"
                pattern="-?[0-9]+(\.[0-9]{1,2})?"
                placeholder="0.00"
                value={startingBalance}
                onChange={(event) => setStartingBalance(event.target.value)}
              />
            </label>
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
            <CategoryManager
              categories={categories.data ?? []}
              onChanged={categories.reload}
            />
          )}
        </section>
      </div>
    </>
  )
}
