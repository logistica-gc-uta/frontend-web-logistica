import { AppError } from '../../lib/errors/AppError'
import { apiClient } from '../../lib/http/apiClient'
import type { Role, Session } from '../../types/auth'
import type { LoginCredentials, LoginResponse } from './types'

/** Roles que pueden ingresar al panel web administrativo. */
export const ALLOWED_ROLES: readonly Role[] = ['ADMIN']

export const FORBIDDEN_ROLE_MESSAGE =
  'Tu usuario no tiene permisos para acceder al panel administrativo'

export const authService = {
  /** Autentica contra el backend y valida que el rol tenga acceso al panel web. */
  async login(credentials: LoginCredentials): Promise<Session> {
    const { data } = await apiClient.post<LoginResponse>('/auth/login', credentials)

    if (!ALLOWED_ROLES.includes(data.user.role)) {
      throw new AppError(FORBIDDEN_ROLE_MESSAGE)
    }

    return { token: data.access_token, user: data.user }
  },
}
