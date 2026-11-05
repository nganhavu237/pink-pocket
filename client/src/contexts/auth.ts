import { createContext } from 'react'
import type { User } from '../types'
export type AuthState = {
  user: User | null
  ready: boolean
  error: string
  refresh: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  updateUser: (user: User) => void
}
export const AuthContext = createContext<AuthState | null>(null)
