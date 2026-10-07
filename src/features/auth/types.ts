import type { AuthUser } from '../../types/auth'

/** Se declara como `type` (no `interface`) para que sea compatible con `useForm`. */
export type LoginCredentials = {
  email: string
  password: string
}

/** Respuesta de POST /auth/login. */
export interface LoginResponse {
  access_token: string
  user: AuthUser
}
