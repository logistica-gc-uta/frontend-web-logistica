import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { authStorage } from '../../lib/auth/authStorage'
import { setUnauthorizedHandler } from '../../lib/http/apiClient'
import { AuthContext, type AuthContextValue } from './AuthContext'
import { authService } from './authService'
import type { AuthUser } from '../../types/auth'
import type { LoginCredentials } from './types'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => authStorage.getSession()?.user ?? null)

  const logout = useCallback(() => {
    authStorage.clear()
    setUser(null)
  }, [])

  const login = useCallback(async (credentials: LoginCredentials) => {
    const session = await authService.login(credentials)
    authStorage.save(session)
    setUser(session.user)
  }, [])

  useEffect(() => setUnauthorizedHandler(logout), [logout])

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, login, logout }),
    [user, login, logout],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
