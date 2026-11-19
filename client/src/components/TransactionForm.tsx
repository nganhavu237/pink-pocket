import { useState, type FormEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import './TransactionForm.css'
import type {
  Category,
  RecurringRule,
  Transaction,
  TransactionInput,
} from '../types'
import { today } from '../utils/format'
import { api, send } from '../services/api'
import { ErrorMessage } from './Feedback'

export function TransactionForm({
  categories,
  transaction,
  rule,
  onCategoryCreated,
  onSaved,
  onCancel,
}: {
  categories: Category[]
  transaction?: Transaction
  rule?: RecurringRule
  onCategoryCreated: (category: Category) => void
  onSaved: () => void
  onCancel: () => void
}) {
  const source = rule ?? transaction
  const [form, setForm] = useState<TransactionInput>({
    recurring: rule?.active ?? transaction?.recurring?.active ?? false,
    type: source?.type ?? 'EXPENSE',
    amount: source?.amount ?? '',
    categoryId:
      source?.categoryId ??
      categories.find((cat) => cat.type === 'EXPENSE' && !cat.isArchived)?.id ??
      '',
    date: rule?.nextDate ?? transaction?.date ?? today(),
    description: source?.description ?? '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [addingCategory, setAddingCategory] = useState(false),
    [categoryName, setCategoryName] = useState(''),
    [categoryError, setCategoryError] = useState(''),
    [creatingCategory, setCreatingCategory] = useState(false)
  async function addCategory() {
    if (!categoryName.trim()) {
      setCategoryError('Enter a category name')
      return
    }
    setCreatingCategory(true)
    setCategoryError('')
    try {
      const category = await api<Category>(
        '/categories',
        send('POST', { name: categoryName.trim(), type: form.type }),
      )
      onCategoryCreated(category)
      setForm((previous) =>
        previous.type === category.type
          ? { ...previous, categoryId: category.id }
          : previous,
      )
      setAddingCategory(false)
      setCategoryName('')
    } catch (error) {
      setCategoryError((error as Error).message)
    } finally {
      setCreatingCategory(false)
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api(
        rule
          ? `/recurring/${rule.id}`
          : `/transactions${transaction ? `/${transaction.id}` : ''}`,
        send(rule || transaction ? 'PUT' : 'POST', form),
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
        {rule
          ? 'Edit Monthly Repeat'
          : transaction
            ? 'Edit Transaction'
            : 'Add Transaction'}
      </h2>
      <form
        onSubmit={submit}
        className="transaction-form grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <label className="transaction-form-field">
          <span className="transaction-form-label">Type</span>
          <span className="relative block min-w-0">
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
                    categories.find(
                      (cat) => cat.type === type && !cat.isArchived,
                    )?.id ?? '',
                })
              }}
            >
              <option value="EXPENSE">Expense</option>
              <option value="INCOME">Income</option>
            </select>
            <ChevronDown
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted"
            />
          </span>
        </label>
        <label className="transaction-form-field">
          <span className="transaction-form-label">Amount</span>
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
        <label className="transaction-form-field">
          <span className="transaction-form-label">Category</span>
          <span className="relative block min-w-0">
            <select
              aria-label="Category"
              className="field"
              required
              value={form.categoryId}
              onChange={(event) => {
                if (event.target.value === '__add__') {
                  setAddingCategory(true)
                  setCategoryError('')
                  return
                }
                setForm({ ...form, categoryId: event.target.value })
              }}
            >
              <option value="" disabled>
                Select category
              </option>
              {categories
                .filter(
                  (cat) =>
                    cat.type === form.type &&
                    (!cat.isArchived || cat.id === source?.categoryId),
                )
                .map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              <option value="__add__">+ Add Category</option>
            </select>
            <ChevronDown
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted"
            />
          </span>
        </label>
        {addingCategory && (
          <div className="rounded-xl border border-line bg-surface p-4 sm:col-span-2 lg:col-span-3">
            <label className="transaction-form-field">
              <span className="transaction-form-label">Category name</span>
              <input
                aria-label="Category name"
                className="field"
                autoFocus
                maxLength={100}
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    if (!creatingCategory) void addCategory()
                  }
                }}
              />
            </label>
            {categoryError && <ErrorMessage message={categoryError} />}
            <div className="mt-3 flex gap-3">
              <button
                className="button-primary"
                type="button"
                disabled={creatingCategory}
                onClick={() => void addCategory()}
              >
                {creatingCategory ? 'Adding…' : 'Add Category'}
              </button>
              <button
                className="button-secondary"
                type="button"
                disabled={creatingCategory}
                onClick={() => setAddingCategory(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <label className="transaction-form-field">
          <span className="transaction-form-label">
            {rule ? 'Next date' : 'Date'}
          </span>
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
        <label className="transaction-form-field lg:col-span-2">
          <span className="transaction-form-label">
            Description <span className="text-muted">(optional)</span>
          </span>
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
          <label className="mb-3 flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={form.recurring}
              onChange={(event) =>
                setForm({ ...form, recurring: event.target.checked })
              }
            />
            Repeat monthly
          </label>
          {form.recurring && (
            <p className="mb-4 text-xs text-muted">
              {rule
                ? 'Updates future repeats only.'
                : transaction?.recurring
                  ? 'Updates this entry and future repeats.'
                  : 'Repeats on this day each month; shorter months use the last day.'}
            </p>
          )}
          {error && <ErrorMessage message={error} />}
          <div className="flex gap-3">
            <button
              disabled={saving || addingCategory || creatingCategory}
              className="button-primary"
              type="submit"
            >
              {saving ? 'Saving…' : rule ? 'Save Repeat' : 'Save Transaction'}
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
