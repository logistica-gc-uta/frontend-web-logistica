import type { AuthUser } from '../../types/auth'

export interface LoginCredentials {
  email: string
  password: string
}

/** Respuesta de POST /auth/login. */
export interface LoginResponse {
  access_token: string
  user: AuthUser
}
