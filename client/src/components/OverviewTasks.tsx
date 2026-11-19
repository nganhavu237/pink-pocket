import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useResource } from '../hooks/useResource'
import { api, send } from '../services/api'
import type { Task } from '../types'
import { ErrorMessage } from './Feedback'

export function OverviewTasks() {
  const { data, loading, error, reload } = useResource<Task[]>('/tasks')
  const [completed, setCompleted] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [saveError, setSaveError] = useState('')
  const [notice, setNotice] = useState('')
  const tasks =
    data?.filter((task) => !task.completed && !completed.includes(task.id)) ??
    []
  async function complete(task: Task) {
    setBusy(task.id)
    setSaveError('')
    setNotice('')
    try {
      await api<Task>(`/tasks/${task.id}`, send('PUT', { completed: true }))
      setCompleted((ids) => [...ids, task.id])
      setNotice(`${task.name} completed.`)
    } catch (error) {
      setSaveError((error as Error).message)
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="absolute inset-0 flex min-h-0 flex-col">
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
        tabIndex={0}
        aria-label="Incomplete tasks"
      >
        {loading ? (
          <p role="status" className="py-3 text-center text-xs text-muted">
            Loading…
          </p>
        ) : error ? (
          <ErrorMessage message={error} retry={reload} />
        ) : tasks.length ? (
          <ul className="divide-y divide-line">
            {tasks.map((task) => (
              <li key={task.id} className="my-space-task">
                <label className="flex cursor-pointer items-center gap-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 cursor-pointer accent-[#a64b68]"
                    checked={busy === task.id}
                    disabled={busy !== null}
                    onChange={() => void complete(task)}
                    aria-label={`Mark ${task.name} as completed`}
                  />
                  <span className="min-w-0 break-words">{task.name}</span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-3 text-center text-xs text-muted">
            No incomplete tasks.
          </p>
        )}
        {saveError && <ErrorMessage message={saveError} />}
      </div>
      <Link
        to="/planner"
        className="mt-2 shrink-0 self-start text-xs underline underline-offset-4"
      >
        View Planner
      </Link>
      <span role="status" className="sr-only">
        {notice}
      </span>
    </div>
  )
}
