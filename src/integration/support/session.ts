import { authService } from '../../features/auth/authService'
import { authStorage } from '../../lib/auth/authStorage'
import { apiClient } from '../../lib/http/apiClient'
import type { AuthUser } from '../../types/auth'
import { credentialsFor } from './env'

/**
 * Inicia sesión como ADMIN con el servicio real y guarda la sesión igual que AuthProvider,
 * para que `apiClient` envíe el token en las siguientes peticiones.
 */
export async function loginAsAdmin(): Promise<void> {
  const session = await authService.login(credentialsFor('ADMIN'))
  authStorage.save(session)
}

/**
 * Inicia sesión como CLIENT directamente contra la API (el panel no admite ese rol) para comprobar
 * que el backend le niega las operaciones administrativas.
 */
export async function loginAsClient(): Promise<void> {
  const { data } = await apiClient.post<{ access_token: string; user: AuthUser }>(
    '/auth/login',
    credentialsFor('CLIENT'),
  )
  authStorage.save({ token: data.access_token, user: data.user })
}

/** Simula una sesión con un token que el backend no reconoce (vencido o manipulado). */
export function saveInvalidToken(): void {
  authStorage.save({
    token: 'token-invalido',
    user: { id: 'x', name: 'Sesión inválida', email: 'invalida@example.com', role: 'ADMIN' },
  })
}

/** Sufijo único para que cada ejecución cree registros nuevos sin chocar con los anteriores. */
export const uniqueSuffix = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase()
