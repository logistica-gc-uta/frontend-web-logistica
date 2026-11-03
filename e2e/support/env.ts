export type Role = 'ADMIN' | 'DRIVER' | 'CLIENT'

const ENV_FILE_HINT = 'Copia .env.integration.example a .env.integration.local y complétalo.'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Falta la variable de entorno ${name}. ${ENV_FILE_HINT}`)
  return value
}

/** URL de la API real (la misma que usa el frontend en desarrollo). */
export const API_URL = process.env.VITE_API_URL ?? 'http://localhost:3000/api/v1'

/** Credenciales de los usuarios del seed del backend, leídas del entorno (nunca del código). */
export const credentialsFor = (role: Role) => ({
  email: requireEnv(`IT_${role}_EMAIL`),
  password: requireEnv(`IT_${role}_PASSWORD`),
})

/** Sesión ADMIN que guarda `auth.setup.ts` (ignorada por git) para no repetir el login. */
export const ADMIN_STATE = 'e2e/.auth/admin.json'

/** Sufijo único para que cada ejecución cree registros nuevos sin chocar con los anteriores. */
export const uniqueSuffix = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase()
