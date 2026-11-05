import { useState, type FormEvent } from 'react'
import type { Category, Transaction, TransactionInput } from '../types'
import { today } from '../utils/format'
import { api, send } from '../services/api'
import { ErrorMessage } from './Feedback'

export function TransactionForm({
  categories,
  transaction,
  onSaved,
  onCancel,
}: {
  categories: Category[]
  transaction?: Transaction
  onSaved: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<TransactionInput>({
    type: transaction?.type ?? 'EXPENSE',
    amount: transaction?.amount ?? '',
    categoryId:
      transaction?.categoryId ??
      categories.find((cat) => cat.type === 'EXPENSE')?.id ??
      '',
    date: transaction?.date ?? today(),
    description: transaction?.description ?? '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api(
        `/transactions${transaction ? `/${transaction.id}` : ''}`,
        send(transaction ? 'PUT' : 'POST', form),
      )
      onSaved()
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <section className="card mb-6 p-5" aria-labelledby="transaction-form-title">
      <h2 id="transaction-form-title" className="mb-5 font-semibold">
        {transaction ? 'Edit Transaction' : 'Add Transaction'}
      </h2>
      <form
        onSubmit={submit}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <label>
          Type
          <select
            aria-label="Type"
            className="field"
            value={form.type}
            onChange={(event) => {
              const type = event.target.value as TransactionInput['type']
              setForm({
                ...form,
                type,
                categoryId:
                  categories.find((cat) => cat.type === type)?.id ?? '',
              })
            }}
          >
            <option value="EXPENSE">Expense</option>
            <option value="INCOME">Income</option>
          </select>
        </label>
        <label>
          Amount
          <input
            className="field"
            autoFocus
            required
            type="text"
            inputMode="decimal"
            pattern="[0-9]+(\.[0-9]{1,2})?"
            placeholder="0.00"
            value={form.amount}
            onChange={(event) =>
              setForm({ ...form, amount: event.target.value })
            }
          />
        </label>
        <label>
          Category
          <select
            aria-label="Category"
            className="field"
            required
            value={form.categoryId}
            onChange={(event) =>
              setForm({ ...form, categoryId: event.target.value })
            }
          >
            <option value="" disabled>
              Select category
            </option>
            {categories
              .filter((cat) => cat.type === form.type)
              .map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Date
          <input
            className="field"
            required
            type="date"
            min="0001-01-01"
            max="9999-12-31"
            value={form.date}
            onChange={(event) => setForm({ ...form, date: event.target.value })}
          />
        </label>
        <label className="lg:col-span-2">
          Description <span className="text-muted">(optional)</span>
          <input
            className="field"
            maxLength={500}
            value={form.description}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
          />
        </label>
        <div className="sm:col-span-2 lg:col-span-3">
          {error && <ErrorMessage message={error} />}
          <div className="flex gap-3">
            <button disabled={saving} className="button-primary" type="submit">
              {saving ? 'Saving…' : 'Save Transaction'}
            </button>
            <button
              disabled={saving}
              className="button-secondary"
              type="button"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      </form>
    </section>
  )
}
