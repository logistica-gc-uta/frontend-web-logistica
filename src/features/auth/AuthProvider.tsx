import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { authStorage } from '../../lib/auth/authStorage'
import { setUnauthorizedHandler } from '../../lib/http/apiClient'
import { AuthContext, type AuthContextValue } from './AuthContext'
import { authService, canAccessPanel } from './authService'
import type { AuthUser } from '../../types/auth'
import type { LoginCredentials } from './types'

/**
 * Restaura la sesión guardada solo si su rol puede usar el panel. Una sesión con otro rol (por
 * ejemplo, editada a mano en localStorage) se descarta y se borra. La autorización real la sigue
 * haciendo el backend; esto evita mostrar el panel a quien no corresponde.
 */
function restoreUser(): AuthUser | null {
  const user = authStorage.getSession()?.user ?? null
  if (user && canAccessPanel(user.role)) return user
  authStorage.clear()
  return null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(restoreUser)

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
