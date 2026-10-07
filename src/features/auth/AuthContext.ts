import { createContext } from 'react'
import type { AuthUser } from '../../types/auth'
import type { LoginCredentials } from './types'

export interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  login: (credentials: LoginCredentials) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
