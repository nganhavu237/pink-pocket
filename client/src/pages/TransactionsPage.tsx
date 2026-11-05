import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useResource } from '../hooks/useResource'
import { useAuth } from '../hooks/useAuth'
import { api, send } from '../services/api'
import { currentMonth, periodQuery } from '../utils/format'
import type { Category, Transaction, TransactionList } from '../types'
import { PageHeader, MonthPicker } from '../components/PageHeader'
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
  const [allDates, setAllDates] = useState(false)
  const [type, setType] = useState('')
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Transaction | undefined>()
  const [adding, setAdding] = useState(() => params.get('add') === '1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const categories = useResource<Category[]>('/categories')
  const currency = useAuth().user!.currency
  const query = new URLSearchParams({
    page: String(page),
    pageSize: '20',
    ...(type ? { type } : {}),
    ...(category ? { categoryId: category } : {}),
    ...(search ? { search } : {}),
  })
  const rows = useResource<TransactionList>(
    `/transactions?${query}${allDates ? '' : `&${periodQuery(month)}`}`,
  )
  function close() {
    setAdding(false)
    setEditing(undefined)
    if (params.has('add')) {
      params.delete('add')
      setParams(params, { replace: true })
    }
  }
  function saved() {
    close()
    rows.reload()
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
      setNotice('Transaction deleted.')
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
            setAdding(true)
            setNotice('')
          }}
        >
          <Plus size={17} aria-hidden="true" />
          Add Transaction
        </button>
      </PageHeader>
      {(adding || editing) && categories.data && (
        <TransactionForm
          key={editing?.id ?? 'new'}
          categories={categories.data}
          transaction={editing}
          onSaved={saved}
          onCancel={close}
        />
      )}
      <section
        aria-label="Transaction filters"
        className="mb-5 flex flex-wrap items-end gap-3"
      >
        <div>
          <span className="mb-1 block text-sm">Month</span>
          <MonthPicker
            value={month}
            onChange={(value) => {
              setMonth(value)
              setAllDates(false)
              setPage(1)
            }}
          />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allDates}
            onChange={(event) => {
              setAllDates(event.target.checked)
              setPage(1)
            }}
          />
          All dates
        </label>
        <label>
          Type
          <select
            aria-label="Type"
            className="field w-auto"
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
        </label>
        <label>
          Category
          <select
            aria-label="Category"
            className="field w-auto"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value)
              setPage(1)
            }}
          >
            <option value="">All categories</option>
            {categories.data
              ?.filter((cat) => !type || cat.type === type)
              .map((cat) => (
                <option value={cat.id} key={cat.id}>
                  {cat.name}
                </option>
              ))}
          </select>
        </label>
        <label className="min-w-40 flex-1">
          Search
          <input
            className="field"
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
