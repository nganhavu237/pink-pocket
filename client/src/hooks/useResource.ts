import { useCallback, useEffect, useState } from 'react'
import { api } from '../services/api'
export function useResource<T>(path: string) {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<{
    path: string
    revision: number
    data: T | null
    error: string
  }>({ path: '', revision: -1, data: null, error: '' })
  const reload = useCallback(() => setRevision((value) => value + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    api<T>(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ path, revision, data, error: '' })
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({ path, revision, data: null, error: error.message })
      })
    return () => controller.abort()
  }, [path, revision])
  const loading = state.path !== path || state.revision !== revision
  return {
    data: loading ? null : state.data,
    error: loading ? '' : state.error,
    loading,
    reload,
  }
}
