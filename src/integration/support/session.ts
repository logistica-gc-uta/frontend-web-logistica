import { authService } from '../../features/auth/authService'
import { authStorage } from '../../lib/auth/authStorage'
import { credentialsFor } from './env'

/**
 * Inicia sesión como ADMIN con el servicio real y guarda la sesión igual que AuthProvider,
 * para que `apiClient` envíe el token en las siguientes peticiones.
 */
export async function loginAsAdmin(): Promise<void> {
  const session = await authService.login(credentialsFor('ADMIN'))
  authStorage.save(session)
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
