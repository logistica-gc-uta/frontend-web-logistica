import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AuthUser } from '../../../types/auth'
import type { LoginCredentials } from '../../auth/types'
import { setCustomerExpiredHandler } from './customerApiClient'
import { CustomerContext, type CustomerContextValue } from './customerContext'
import { customerService } from './customerService'
import { customerStorage } from './customerStorage'

/** Sesión CLIENT del Shop, independiente de la sesión del panel (`AuthProvider`). */
export function CustomerProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<AuthUser | null>(customerStorage.getUser)
  const [sessionExpired, setSessionExpired] = useState(false)

  const logout = useCallback(() => {
    customerStorage.clear()
    setCustomer(null)
  }, [])

  const login = useCallback(async (credentials: LoginCredentials) => {
    const session = await customerService.login(credentials)
    customerStorage.save(session)
    setSessionExpired(false)
    setCustomer(session.user)
  }, [])

  useEffect(
    () =>
      setCustomerExpiredHandler(() => {
        logout()
        setSessionExpired(true)
      }),
    [logout],
  )

  const value = useMemo<CustomerContextValue>(
    () => ({ customer, sessionExpired, login, logout }),
    [customer, sessionExpired, login, logout],
  )

  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>
}
