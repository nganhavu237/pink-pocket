import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Pencil,
  Trash2,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { OverviewTasks } from './OverviewTasks'
import { api, send } from '../services/api'
import { ErrorMessage } from './Feedback'
import './MySpacePhoto.css'

type PhotoInfo = { version: string; width: number; height: number }
const types = ['image/jpeg', 'image/png', 'image/webp']
const maxBytes = 5 * 1024 * 1024
export function MySpacePhoto() {
  const { user } = useAuth()
  const preferenceKey = `toki:overview-view:${user!.id}`
  const [view, setView] = useState<'photo' | 'tasks'>(() => {
    try {
      return localStorage.getItem(preferenceKey) === 'tasks' ? 'tasks' : 'photo'
    } catch {
      return 'photo'
    }
  })
  function switchView() {
    const next = view === 'photo' ? 'tasks' : 'photo'
    setView(next)
    try {
      localStorage.setItem(preferenceKey, next)
    } catch {
      // The carousel still works when browser storage is unavailable.
    }
  }
  const [photo, setPhoto] = useState<PhotoInfo | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [imageFailed, setImageFailed] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const controller = new AbortController()
    api<PhotoInfo | null>('/my-space', { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setPhoto(result)
          setImageFailed(false)
          setError('')
          setLoading(false)
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setError(error.message)
          setLoading(false)
        }
      })
    return () => controller.abort()
  }, [revision])
  function retry() {
    setLoading(true)
    setError('')
    setRevision((value) => value + 1)
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    setNotice('')
    if (!types.includes(file.type)) {
      setError('Use a JPEG, PNG or WebP photo.')
      return
    }
    if (file.size > maxBytes) {
      setError('Choose a photo up to 5 MB.')
      return
    }
    setBusy(true)
    try {
      const saved = await api<PhotoInfo>('/my-space/photo', {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      setPhoto(saved)
      setImageFailed(false)
      setNotice('Photo saved.')
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function remove() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api('/my-space/photo', send('DELETE'))
      setPhoto(null)
      setImageFailed(false)
      setNotice('Photo removed.')
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section
      className="my-space-photo card flex min-h-0 flex-1 flex-col p-5"
      aria-labelledby="my-space-title"
      aria-busy={view === 'photo' && (busy || loading)}
    >
      <div className="mb-4 flex h-8 shrink-0 items-center justify-between gap-2">
        <h2 id="my-space-title" className="font-semibold">
          {view === 'photo' ? 'My Space' : 'To-do'}
        </h2>
        <div className="flex items-center gap-1">
          {view === 'photo' && photo && (
            <div className="flex gap-1">
              <button
                className="my-space-action rounded-lg p-2 text-muted hover:bg-secondary hover:text-ink"
                type="button"
                aria-label="Replace photo"
                title="Replace photo"
                disabled={busy || loading}
                onClick={() => input.current?.click()}
              >
                <Pencil size={16} aria-hidden="true" />
              </button>
              <button
                className="my-space-action rounded-lg p-2 text-muted hover:bg-secondary hover:text-ink"
                type="button"
                aria-label="Remove photo"
                title="Remove photo"
                disabled={busy || loading}
                onClick={() => void remove()}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          )}
          <div
            className="flex items-center gap-1"
            role="group"
            aria-label="Card views"
          >
            <button
              type="button"
              className="my-space-action inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-secondary hover:text-ink"
              aria-label="Previous view"
              onClick={switchView}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="my-space-action inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-secondary hover:text-ink"
              aria-label="Next view"
              onClick={switchView}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      <input
        ref={input}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Choose photo"
        onChange={(event) => void upload(event)}
        disabled={busy || loading}
      />
      {view === 'tasks' ? (
        <div className="my-space-media my-space-panel">
          <OverviewTasks />
        </div>
      ) : loading ? (
        <div className="my-space-media flex items-center justify-center rounded-xl bg-surface">
          <p role="status" className="text-xs text-muted">
            Loading…
          </p>
        </div>
      ) : photo && !imageFailed ? (
        <div className="my-space-media overflow-hidden rounded-xl bg-surface">
          <img
            key={photo.version}
            src={`/api/my-space/photo?v=${photo.version}`}
            alt="My Space photo"
            className="my-space-image absolute inset-0 h-full w-full object-cover"
            onError={() => {
              setImageFailed(true)
              setError('Photo could not be loaded. Try again.')
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          className="my-space-placeholder my-space-media flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-surface text-muted hover:border-primary hover:text-ink"
          aria-label="Upload photo"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <ImagePlus size={22} strokeWidth={1.5} aria-hidden="true" />
          <span className="text-xs">
            {busy ? 'Uploading…' : 'Upload photo'}
          </span>
        </button>
      )}
      {busy && (
        <span role="status" className="sr-only">
          Saving photo…
        </span>
      )}
      {!busy && notice && (
        <span role="status" className="sr-only">
          {notice}
        </span>
      )}
      {view === 'photo' && error && (
        <ErrorMessage message={error} retry={retry} />
      )}
    </section>
  )
}
