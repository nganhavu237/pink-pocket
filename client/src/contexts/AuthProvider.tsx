import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AuthContext } from './auth'
import { api, ApiError, send, setCsrfToken } from '../services/api'
import type { AuthResponse, User } from '../types'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const accept = (result: AuthResponse) => {
    setCsrfToken(result.csrfToken)
    setUser(result.user)
    setError('')
    setReady(true)
  }
  const refresh = useCallback(
    () =>
      api<AuthResponse>('/auth/me')
        .then((result) => {
          setCsrfToken(result.csrfToken)
          setUser(result.user)
          setError('')
        })
        .catch((error) => {
          if (error instanceof ApiError && error.status === 401) {
            setUser(null)
            setCsrfToken('')
            setError('')
          } else setError(error.message)
        })
        .finally(() => setReady(true)),
    [],
  )
  useEffect(() => {
    void refresh()
    const expire = () => {
      setUser(null)
      setCsrfToken('')
    }
    window.addEventListener('session-expired', expire)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('session-expired', expire)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])
  async function login(email: string, password: string) {
    accept(
      await api<AuthResponse>('/auth/login', send('POST', { email, password })),
    )
  }
  async function register(name: string, email: string, password: string) {
    accept(
      await api<AuthResponse>(
        '/auth/register',
        send('POST', { name, email, password }),
      ),
    )
  }
  async function logout() {
    await api('/auth/logout', send('POST'))
    setCsrfToken('')
    setUser(null)
  }
  return (
    <AuthContext.Provider
      value={{
        user,
        ready,
        error,
        refresh,
        login,
        register,
        logout,
        updateUser: setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
