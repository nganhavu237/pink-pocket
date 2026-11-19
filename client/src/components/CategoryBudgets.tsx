import { useState, type FormEvent } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { useResource } from '../hooks/useResource'
import { api, send } from '../services/api'
import { money, periodQuery } from '../utils/format'
import type { Category, CategoryBudget } from '../types'
import { ErrorMessage, LoadingState } from './Feedback'

export function CategoryBudgets({
  month,
  currency,
}: {
  month: string
  currency: string
}) {
  const result = useResource<CategoryBudget[]>(
    `/category-budgets?${periodQuery(month)}`,
  )
  const categories = useResource<Category[]>('/categories')
  const [editing, setEditing] = useState<CategoryBudget | null | undefined>()
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const available =
    categories.data?.filter(
      (category) =>
        category.type === 'EXPENSE' &&
        !category.isArchived &&
        !result.data?.some((budget) => budget.categoryId === category.id),
    ) ?? []
  async function remove(budget: CategoryBudget) {
    setBusy(true)
    setError('')
    try {
      await api(`/category-budgets/${budget.id}`, send('DELETE'))
      if (editing?.id === budget.id) setEditing(undefined)
      result.reload()
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="mt-6" aria-labelledby="category-budgets-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2
          id="category-budgets-title"
          className="text-3xl font-semibold tracking-tight"
        >
          Category Budgets
        </h2>
        <button
          type="button"
          className="button-secondary"
          disabled={
            busy ||
            result.loading ||
            categories.loading ||
            Boolean(result.error || categories.error) ||
            available.length === 0
          }
          onClick={() => {
            setEditing(null)
            setError('')
          }}
        >
          <Plus size={17} aria-hidden="true" />
          Add Category Budget
        </button>
      </div>
      {error && <ErrorMessage message={error} />}
      {categories.error && (
        <ErrorMessage message={categories.error} retry={categories.reload} />
      )}
      {editing !== undefined && (
        <CategoryBudgetForm
          key={editing?.id ?? 'new'}
          month={month}
          budget={editing}
          categories={available}
          onCancel={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined)
            result.reload()
          }}
        />
      )}
      {result.loading ? (
        <LoadingState />
      ) : result.error ? (
        <ErrorMessage message={result.error} retry={result.reload} />
      ) : result.data?.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {result.data.map((budget) => (
            <article
              key={budget.id}
              className="card min-w-0 p-5"
              aria-label={`${budget.category.name} budget`}
            >
              <h3 className="break-words font-semibold">
                {budget.category.name}
              </h3>
              <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
                <span>{money(budget.spent, currency)} spent</span>
                <span className="text-muted">
                  of {money(budget.amount, currency)}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={`${budget.category.name} budget usage`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(100, budget.percentage)}
                aria-valuetext={`${budget.percentage}% spent${budget.exceeded ? ', over budget' : ''}`}
                className="my-3 h-2 overflow-hidden rounded-full bg-secondary"
              >
                <div
                  style={{ width: `${Math.min(100, budget.percentage)}%` }}
                  className={`h-full rounded-full ${budget.exceeded ? 'bg-[#a64b68]' : 'bg-primary'}`}
                />
              </div>
              <p
                className={`text-sm ${budget.exceeded ? 'font-semibold text-[#98506a]' : 'text-muted'}`}
              >
                {budget.exceeded
                  ? `${money(budget.remaining.replace('-', ''), currency)} over budget`
                  : `${money(budget.remaining, currency)} remaining`}
              </p>
              <div className="mt-4 flex gap-4 text-sm">
                <button
                  type="button"
                  className="underline underline-offset-4"
                  disabled={busy}
                  onClick={() => {
                    setEditing(budget)
                    setError('')
                  }}
                  aria-label={`Edit ${budget.category.name} budget`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="text-[#98506a] underline underline-offset-4"
                  disabled={busy}
                  onClick={() => void remove(budget)}
                  aria-label={`Remove ${budget.category.name} budget`}
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">No category budgets this month.</p>
      )}
    </section>
  )
}

function CategoryBudgetForm({
  month,
  budget,
  categories,
  onCancel,
  onSaved,
}: {
  month: string
  budget: CategoryBudget | null
  categories: Category[]
  onCancel: () => void
  onSaved: () => void
}) {
  const [categoryId, setCategoryId] = useState(
    budget?.categoryId ?? categories[0]?.id ?? '',
  )
  const [amount, setAmount] = useState(budget?.amount ?? '')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const [year, value] = month.split('-')
      await api(
        '/category-budgets',
        send('PUT', {
          categoryId,
          amount,
          month: Number(value),
          year: Number(year),
        }),
      )
      onSaved()
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      onSubmit={submit}
      className="card mb-4 grid gap-4 p-5 sm:grid-cols-2"
      aria-label={budget ? 'Edit category budget' : 'Add category budget'}
    >
      <label className="block">
        <span id="category-budget-category-label" className="pl-[13px]">
          Category
        </span>
        <span className="relative mt-1 block">
          <select
            aria-labelledby="category-budget-category-label"
            className="field mt-0 h-11 appearance-none pr-10 font-normal"
            value={categoryId}
            required
            disabled={Boolean(budget) || busy}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            {budget ? (
              <option value={budget.categoryId}>{budget.category.name}</option>
            ) : (
              categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))
            )}
          </select>
          <ChevronDown
            size={16}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
        </span>
      </label>
      <label className="block">
        <span className="pl-[13px]">Budget amount</span>
        <input
          className="field"
          required
          type="text"
          inputMode="decimal"
          pattern="[0-9]+(\.[0-9]{1,2})?"
          placeholder="0.00"
          value={amount}
          disabled={busy}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>
      <div className="sm:col-span-2">
        {error && <ErrorMessage message={error} />}
        <div className="flex gap-3">
          <button className="button-primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save Budget'}
          </button>
          <button
            className="button-secondary"
            type="button"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  )
}
