import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { api, send } from '../services/api'
import type { Task } from '../types'
import { PageHeader } from '../components/PageHeader'
import { EmptyState, ErrorMessage, LoadingState } from '../components/Feedback'
import { displayDate } from '../utils/format'
import './PlannerPage.css'

function compareTasks(a: Task, b: Task) {
  return (
    Number(a.completed) - Number(b.completed) ||
    (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99') ||
    (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99') ||
    b.createdAt.localeCompare(a.createdAt) ||
    a.id.localeCompare(b.id)
  )
}
function displayTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(`2000-01-01T${value}:00`))
}
export function PlannerPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(''),
    [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState<Task | null | undefined>()
  const [busyId, setBusyId] = useState<string | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const addButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const controller = new AbortController()
    api<Task[]>('/tasks', { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) {
          setTasks(data)
          setLoadError('')
          setLoading(false)
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setLoadError(error.message)
          setLoading(false)
        }
      })
    return () => controller.abort()
  }, [revision])
  function retry() {
    setLoading(true)
    setLoadError('')
    setRevision((value) => value + 1)
  }
  function close() {
    setEditing(undefined)
    addButton.current?.focus()
  }
  function saved(task: Task) {
    setTasks((items) =>
      items.some((item) => item.id === task.id)
        ? items.map((item) => (item.id === task.id ? task : item))
        : [...items, task],
    )
    setNotice('Task saved.')
    setError('')
    close()
  }
  async function toggle(task: Task) {
    setBusyId(task.id)
    setError('')
    setNotice('')
    setTasks((items) =>
      items.map((item) =>
        item.id === task.id ? { ...item, completed: !task.completed } : item,
      ),
    )
    try {
      const updated = await api<Task>(
        `/tasks/${task.id}`,
        send('PUT', { completed: !task.completed }),
      )
      setTasks((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      )
      setNotice(updated.completed ? 'Task completed.' : 'Task reopened.')
    } catch (error) {
      setTasks((items) =>
        items.map((item) =>
          item.id === task.id ? { ...item, completed: task.completed } : item,
        ),
      )
      setError((error as Error).message)
    } finally {
      setBusyId(null)
    }
  }
  async function remove(task: Task) {
    setBusyId(task.id)
    setError('')
    try {
      await api(`/tasks/${task.id}`, send('DELETE'))
      setTasks((items) => items.filter((item) => item.id !== task.id))
      if (editing?.id === task.id) close()
      setNotice('Task deleted.')
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusyId(null)
    }
  }
  return (
    <>
      <PageHeader title="Planner">
        <button
          ref={addButton}
          type="button"
          className="button-primary"
          disabled={loading || Boolean(loadError) || busyId !== null}
          onClick={() => {
            setEditing(null)
            setNotice('')
            setError('')
          }}
        >
          <Plus size={17} aria-hidden="true" />
          Add Task
        </button>
      </PageHeader>
      {editing !== undefined && (
        <TaskForm
          key={editing?.id ?? 'new'}
          task={editing}
          onSaved={saved}
          onCancel={close}
        />
      )}
      {error && <ErrorMessage message={error} />}
      {notice && (
        <p role="status" className="mb-4 text-sm text-muted">
          {notice}
        </p>
      )}
      <section className="card px-5" aria-label="Tasks">
        {loading ? (
          <LoadingState />
        ) : loadError ? (
          <ErrorMessage message={loadError} retry={retry} />
        ) : !tasks.length ? (
          <EmptyState message="No tasks yet." />
        ) : (
          <ul className="divide-y divide-line">
            {[...tasks].sort(compareTasks).map((task) => (
              <li
                key={task.id}
                className={`planner-task flex flex-wrap items-center gap-3 rounded-lg py-4 ${task.completed ? 'bg-surface' : ''}`}
              >
                <input
                  className="planner-checkbox h-5 w-5 shrink-0 cursor-pointer accent-[#a64b68]"
                  type="checkbox"
                  checked={task.completed}
                  disabled={busyId !== null}
                  onChange={() => void toggle(task)}
                  aria-label={`Mark ${task.name} as ${task.completed ? 'incomplete' : 'completed'}`}
                />
                <div className="min-w-0 flex-1 basis-32">
                  <p
                    className={`planner-task-name break-words text-sm font-medium ${task.completed ? 'text-muted line-through' : 'text-ink'}`}
                  >
                    {task.name}
                  </p>
                  {(task.dueDate || task.dueTime) && (
                    <p className="mt-1 text-xs text-muted">
                      {task.dueDate && (
                        <time dateTime={task.dueDate}>
                          {displayDate(task.dueDate)}
                        </time>
                      )}
                      {task.dueDate && task.dueTime && ' · '}
                      {task.dueTime && (
                        <time dateTime={task.dueTime}>
                          {displayTime(task.dueTime)}
                        </time>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex gap-4 text-sm">
                  <button
                    className="underline underline-offset-4"
                    type="button"
                    disabled={busyId !== null}
                    aria-label={`Edit ${task.name}`}
                    onClick={() => {
                      setEditing(task)
                      setNotice('')
                      setError('')
                      window.scrollTo({ top: 0, behavior: 'instant' })
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="text-[#98506a] underline underline-offset-4"
                    type="button"
                    disabled={busyId !== null}
                    aria-label={`Delete ${task.name}`}
                    onClick={() => void remove(task)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
function TaskForm({
  task,
  onSaved,
  onCancel,
}: {
  task: Task | null
  onSaved: (task: Task) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(task?.name ?? ''),
    [dueDate, setDueDate] = useState(task?.dueDate ?? ''),
    [dueTime, setDueTime] = useState(task?.dueTime ?? '')
  const [saving, setSaving] = useState(false),
    [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const saved = await api<Task>(
        task ? `/tasks/${task.id}` : '/tasks',
        send(task ? 'PUT' : 'POST', {
          name,
          dueDate: dueDate || null,
          dueTime: dueTime || null,
        }),
      )
      onSaved(saved)
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <section className="card mb-5 p-5" aria-labelledby="task-form-title">
      <h2 id="task-form-title" className="mb-4 font-semibold">
        {task ? 'Edit Task' : 'Add Task'}
      </h2>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2">
          Task name
          <input
            className="field"
            autoFocus
            required
            maxLength={200}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Due date <span className="text-muted">(optional)</span>
          <input
            aria-label="Due date"
            className="field"
            type="date"
            min="0001-01-01"
            max="9999-12-31"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </label>
        <label>
          Due time <span className="text-muted">(optional)</span>
          <input
            aria-label="Due time"
            className="field"
            type="time"
            value={dueTime}
            onChange={(event) => setDueTime(event.target.value)}
          />
        </label>
        <div className="sm:col-span-2">
          {error && <ErrorMessage message={error} />}
          <div className="flex gap-3">
            <button className="button-primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save Task'}
            </button>
            <button
              className="button-secondary"
              type="button"
              disabled={saving}
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
