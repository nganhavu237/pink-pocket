import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, Plus } from 'lucide-react'
import { useResource } from '../hooks/useResource'
import { useAuth } from '../hooks/useAuth'
import { api, send } from '../services/api'
import { currentMonth, displayDate, money, periodQuery } from '../utils/format'
import type {
  Category,
  RecurringRule,
  Transaction,
  TransactionList,
} from '../types'
import { PageHeader } from '../components/PageHeader'
import './TransactionsPage.css'
import { ErrorMessage, LoadingState } from '../components/Feedback'
import { TransactionForm } from '../components/TransactionForm'
import { TransactionTable } from '../components/TransactionTable'
export function TransactionsPage() {
  const [params, setParams] = useSearchParams()
  const [month, setMonth] = useState(() =>
    /^\d{4}-\d{2}$/.test(params.get('month') || '')
      ? params.get('month')!
      : currentMonth(),
  )
  const [type, setType] = useState('')
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Transaction | undefined>()
  const [editingRule, setEditingRule] = useState<RecurringRule | undefined>()
  const repeats = useResource<RecurringRule[]>('/recurring')
  const [adding, setAdding] = useState(() => params.get('add') === '1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const categories = useResource<Category[]>('/categories')
  const [newCategories, setNewCategories] = useState<Category[]>([])
  const availableCategories = Array.from(
    new Map(
      [...(categories.data ?? []), ...newCategories].map((category) => [
        category.id,
        category,
      ]),
    ).values(),
  )
  const currency = useAuth().user!.currency
  const query = new URLSearchParams({
    page: String(page),
    pageSize: '20',
    ...(type ? { type } : {}),
    ...(category ? { categoryId: category } : {}),
    ...(search ? { search } : {}),
  })
  const rows = useResource<TransactionList>(
    `/transactions?${query}&${periodQuery(month)}`,
  )
  function close() {
    setAdding(false)
    setEditingRule(undefined)
    setEditing(undefined)
    if (params.has('add')) {
      params.delete('add')
      setParams(params, { replace: true })
    }
  }
  function saved() {
    close()
    rows.reload()
    repeats.reload()
    setNotice('Transaction saved.')
    setError('')
  }
  async function remove(item: Transaction) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api(`/transactions/${item.id}`, send('DELETE'))
      if (editing?.id === item.id) close()
      if (rows.data?.items.length === 1 && page > 1) setPage(page - 1)
      else rows.reload()
      setNotice(
        item.recurring?.active
          ? 'Transaction deleted. Monthly repeat continues.'
          : 'Transaction deleted.',
      )
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function stopRepeat(rule: RecurringRule) {
    setBusy(true)
    setError('')
    try {
      await api(`/recurring/${rule.id}`, send('DELETE'))
      if (editingRule?.id === rule.id) close()
      repeats.reload()
      rows.reload()
      setNotice('Monthly repeat stopped.')
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <PageHeader title="Transactions">
        <button
          type="button"
          className="button-primary"
          disabled={!categories.data}
          onClick={() => {
            setEditing(undefined)
            setEditingRule(undefined)
            setAdding(true)
            setNotice('')
          }}
        >
          <Plus size={17} aria-hidden="true" />
          Add Transaction
        </button>
      </PageHeader>
      {(adding || editing || editingRule) && categories.data && (
        <TransactionForm
          key={editingRule ? `rule-${editingRule.id}` : (editing?.id ?? 'new')}
          categories={availableCategories}
          onCategoryCreated={(category) =>
            setNewCategories((items) => [...items, category])
          }
          transaction={editing}
          rule={editingRule}
          onSaved={saved}
          onCancel={close}
        />
      )}
      {repeats.error && (
        <ErrorMessage message={repeats.error} retry={repeats.reload} />
      )}
      {Boolean(repeats.data?.length) && (
        <details className="card mb-5 p-5">
          <summary className="cursor-pointer text-sm font-medium">
            Monthly repeats ({repeats.data!.length})
          </summary>
          <ul className="mt-3 divide-y divide-line">
            {repeats.data!.map((rule) => (
              <li
                key={rule.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {rule.description || rule.category.name} ·{' '}
                    {money(rule.amount, currency)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Next {displayDate(rule.nextDate)} · Monthly on day{' '}
                    {rule.day}
                  </p>
                </div>
                <div className="flex gap-4">
                  <button
                    className="underline underline-offset-4"
                    type="button"
                    disabled={busy}
                    aria-label={`Edit repeat ${rule.description || rule.category.name}`}
                    onClick={() => {
                      setEditing(undefined)
                      setAdding(false)
                      setEditingRule(rule)
                      window.scrollTo({ top: 0, behavior: 'instant' })
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="text-[#98506a] underline underline-offset-4"
                    type="button"
                    disabled={busy}
                    aria-label={`Stop repeat ${rule.description || rule.category.name}`}
                    onClick={() => stopRepeat(rule)}
                  >
                    Stop repeat
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
      <section
        aria-label="Transaction filters"
        className="transaction-filters mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.15fr_1.5fr]"
      >
        <label className="grid min-w-0 gap-1.5">
          <span>Month</span>
          <input
            className="transaction-filter-control"
            type="month"
            aria-label="Month"
            min="0001-01"
            max="9999-12"
            required
            value={month}
            onChange={(event) => {
              if (/^\d{4}-\d{2}$/.test(event.target.value)) {
                setMonth(event.target.value)
                setPage(1)
              }
            }}
          />
        </label>
        <label className="grid min-w-0 gap-1.5">
          <span>Type</span>
          <span className="relative min-w-0">
            <select
              aria-label="Type"
              className="transaction-filter-control transaction-filter-select"
              value={type}
              onChange={(event) => {
                setType(event.target.value)
                setCategory('')
                setPage(1)
              }}
            >
              <option value="">All types</option>
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
        <label className="grid min-w-0 gap-1.5">
          <span>Category</span>
          <span className="relative min-w-0">
            <select
              aria-label="Category"
              className="transaction-filter-control transaction-filter-select"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value)
                setPage(1)
              }}
            >
              <option value="">All categories</option>
              {availableCategories
                .filter((cat) => !type || cat.type === type)
                .map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
            </select>
            <ChevronDown
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted"
            />
          </span>
        </label>
        <label className="grid min-w-0 gap-1.5">
          <span>Search</span>
          <input
            className="transaction-filter-control"
            type="search"
            maxLength={100}
            placeholder="Description"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
        </label>
      </section>
      {notice && (
        <p role="status" className="mb-4 text-sm">
          {notice}
        </p>
      )}
      {error && <ErrorMessage message={error} />}{' '}
      {categories.error && (
        <ErrorMessage message={categories.error} retry={categories.reload} />
      )}
      <section className="card px-5">
        {rows.loading ? (
          <LoadingState />
        ) : rows.error ? (
          <ErrorMessage message={rows.error} retry={rows.reload} />
        ) : (
          rows.data && (
            <>
              <TransactionTable
                items={rows.data.items}
                currency={currency}
                onEdit={(item) => {
                  setAdding(false)
                  setEditingRule(undefined)
                  setEditing(item)
                  setNotice('')
                  window.scrollTo({ top: 0, behavior: 'instant' })
                }}
                onDelete={remove}
                busy={busy}
              />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-4 text-sm">
                <p className="text-muted">{rows.data.total} transactions</p>
                <div className="flex items-center gap-3">
                  <button
                    className="button-secondary"
                    disabled={page === 1 || busy}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </button>
                  <span>
                    {page} / {Math.max(1, rows.data.totalPages)}
                  </span>
                  <button
                    className="button-secondary"
                    disabled={page >= rows.data.totalPages || busy}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )
        )}
      </section>
    </>
  )
}
