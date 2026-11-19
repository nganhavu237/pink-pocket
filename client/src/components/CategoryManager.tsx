import { useState } from 'react'
import type { Category } from '../types'
import { api, send } from '../services/api'
import { ErrorMessage } from './Feedback'

export function CategoryManager({
  categories,
  onChanged,
}: {
  categories: Category[]
  onChanged: () => void
}) {
  const [editing, setEditing] = useState<string | null>(null),
    [name, setName] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  async function rename(category: Category) {
    setBusy(true)
    setError('')
    try {
      await api(`/categories/${category.id}`, send('PUT', { name }))
      setEditing(null)
      onChanged()
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function remove(category: Category) {
    setBusy(true)
    setError('')
    try {
      await api(`/categories/${category.id}`, send('DELETE'))
      onChanged()
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      {error && <ErrorMessage message={error} />}{' '}
      {(['EXPENSE', 'INCOME'] as const).map((type) => {
        const visible = categories.filter(
          (category) => category.type === type && !category.isArchived,
        )
        return (
          <div key={type} className="mb-5">
            <h3 className="mb-3 text-sm text-muted">
              {type === 'EXPENSE' ? 'Expense' : 'Income'}
            </h3>
            <div className="flex flex-wrap gap-2">
              {visible
                .filter((category) => category.isDefault)
                .map((category) => (
                  <span
                    className={`rounded-lg px-3 py-2 text-sm ${type === 'EXPENSE' ? 'bg-secondary' : 'bg-sage'}`}
                    key={category.id}
                  >
                    {category.name}
                  </span>
                ))}
            </div>
            <ul className="mt-2 space-y-2">
              {visible
                .filter((category) => !category.isDefault)
                .map((category) => (
                  <li
                    key={category.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2 text-sm"
                  >
                    {editing === category.id ? (
                      <>
                        <label className="min-w-32 flex-1">
                          <span className="sr-only">Category name</span>
                          <input
                            aria-label="Category name"
                            autoFocus
                            className="field"
                            maxLength={100}
                            required
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                void rename(category)
                              }
                              if (event.key === 'Escape') setEditing(null)
                            }}
                          />
                        </label>
                        <div className="flex gap-3">
                          <button
                            className="underline underline-offset-4"
                            type="button"
                            disabled={busy || !name.trim()}
                            onClick={() => void rename(category)}
                          >
                            Save
                          </button>
                          <button
                            className="underline underline-offset-4"
                            type="button"
                            disabled={busy}
                            onClick={() => setEditing(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 break-words">
                          {category.name}
                        </span>
                        <div className="flex gap-3">
                          <button
                            className="underline underline-offset-4"
                            type="button"
                            disabled={busy}
                            aria-label={`Rename ${category.name}`}
                            onClick={() => {
                              setEditing(category.id)
                              setName(category.name)
                              setError('')
                            }}
                          >
                            Rename
                          </button>
                          <button
                            className="text-[#98506a] underline underline-offset-4"
                            type="button"
                            disabled={busy}
                            aria-label={`Delete category ${category.name}`}
                            onClick={() => void remove(category)}
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        )
      })}
    </>
  )
}
