import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useResource } from '../hooks/useResource'
import { useAuth } from '../hooks/useAuth'
import { api, send } from '../services/api'
import { currentMonth, periodQuery } from '../utils/format'
import type { Budget } from '../types'
import { PageHeader, MonthPicker } from '../components/PageHeader'
import { BudgetProgress } from '../components/BudgetProgress'
import { ErrorMessage, LoadingState } from '../components/Feedback'
export function BudgetsPage() {
  const [params] = useSearchParams()
  const [month, setMonth] = useState(() =>
    /^\d{4}-\d{2}$/.test(params.get('month') || '')
      ? params.get('month')!
      : currentMonth(),
  )
  const { user } = useAuth()
  const result = useResource<Budget>(`/budgets?${periodQuery(month)}`)
  return (
    <>
      <PageHeader title="Budgets">
        <MonthPicker value={month} onChange={setMonth} />
      </PageHeader>
      <section className="card max-w-2xl p-6">
        <h2 className="font-semibold">Monthly Spending Budget</h2>
        {result.loading ? (
          <LoadingState />
        ) : result.error ? (
          <ErrorMessage message={result.error} retry={result.reload} />
        ) : (
          result.data && (
            <>
              <BudgetProgress budget={result.data} currency={user!.currency} />
              <BudgetForm
                key={`${month}-${result.data.amount}`}
                month={month}
                budget={result.data}
                onSaved={result.reload}
              />
            </>
          )
        )}
      </section>
    </>
  )
}
function BudgetForm({
  month,
  budget,
  onSaved,
}: {
  month: string
  budget: Budget
  onSaved: () => void
}) {
  const [amount, setAmount] = useState(budget.amount ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const [year, value] = month.split('-')
      await api(
        '/budgets',
        send('PUT', { amount, month: Number(value), year: Number(year) }),
      )
      onSaved()
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="border-t border-line pt-5">
      <label className="block max-w-xs">
        Budget amount
        <input
          className="field"
          required
          type="text"
          inputMode="decimal"
          pattern="[0-9]+(\.[0-9]{1,2})?"
          placeholder="0.00"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>
      {error && <ErrorMessage message={error} />}
      <button className="button-primary mt-4" type="submit" disabled={busy}>
        {busy ? 'Saving…' : budget.amount ? 'Update Budget' : 'Set Budget'}
      </button>
    </form>
  )
}
