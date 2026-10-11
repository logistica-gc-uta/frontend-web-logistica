import type { LoginCredentials } from '../../features/auth/types'
import type { Role } from '../../types/auth'

const ENV_FILE_HINT = 'Copia .env.integration.example a .env.integration.local y complétalo.'

function requireEnv(name: string): string {
  const value: unknown = import.meta.env[name]
  if (typeof value !== 'string' || value === '') {
    throw new Error(`Falta la variable de entorno ${name}. ${ENV_FILE_HINT}`)
  }
  return value
}

/** Credenciales de los usuarios del seed del backend, leídas del entorno (nunca del código). */
export function credentialsFor(role: Role): LoginCredentials {
  return {
    email: requireEnv(`IT_${role}_EMAIL`),
    password: requireEnv(`IT_${role}_PASSWORD`),
  }
}
