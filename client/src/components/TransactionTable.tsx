import type { Transaction } from '../types'
import { displayDate, money } from '../utils/format'
import { EmptyState } from './Feedback'
export function TransactionTable({
  items,
  currency,
  onEdit,
  onDelete,
  busy,
}: {
  items: Transaction[]
  currency: string
  onEdit?: (item: Transaction) => void
  onDelete?: (item: Transaction) => void
  busy?: boolean
}) {
  if (!items.length)
    return <EmptyState message="No transactions for these filters." />
  return (
    <ul className="divide-y divide-line">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center gap-3 py-4">
          <span
            aria-hidden="true"
            className={`rounded-lg px-3 py-2 ${item.type === 'INCOME' ? 'bg-sage' : 'bg-secondary'}`}
          >
            {item.type === 'INCOME' ? '↙' : '↗'}
          </span>
          <div className="min-w-0 flex-1 basis-24">
            <p className="break-words text-sm font-medium">
              {item.description || item.category.name}
            </p>
            <p className="mt-1 text-xs text-muted">
              {item.category.name} · {displayDate(item.date)}
            </p>
          </div>
          <p className="break-all text-sm font-semibold">
            <span className="sr-only">
              {item.type === 'INCOME' ? 'Income' : 'Expense'}{' '}
            </span>
            {item.type === 'INCOME' ? '+' : '−'}
            {money(item.amount, currency)}
          </p>
          {onEdit && onDelete && (
            <div className="flex w-full justify-end gap-4 text-sm sm:w-auto sm:pl-3">
              <button
                type="button"
                className="underline underline-offset-4"
                disabled={busy}
                onClick={() => onEdit(item)}
                aria-label={`Edit ${item.description || item.category.name}`}
              >
                Edit
              </button>
              <button
                type="button"
                className="text-[#98506a] underline underline-offset-4"
                disabled={busy}
                onClick={() => onDelete(item)}
                aria-label={`Delete ${item.description || item.category.name}`}
              >
                Delete
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
