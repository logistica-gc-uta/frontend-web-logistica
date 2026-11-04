import { createContext, useContext } from 'react'
import type { AuthUser } from '../../../types/auth'
import type { LoginCredentials } from '../../auth/types'

export interface CustomerContextValue {
  customer: AuthUser | null
  /** La sesión terminó porque el backend rechazó el token (vencido o inválido). */
  sessionExpired: boolean
  login: (credentials: LoginCredentials) => Promise<void>
  logout: () => void
}

export const CustomerContext = createContext<CustomerContextValue | null>(null)

export function useCustomer(): CustomerContextValue {
  const context = useContext(CustomerContext)
  if (!context) throw new Error('useCustomer debe usarse dentro de <CustomerProvider>')
  return context
}
