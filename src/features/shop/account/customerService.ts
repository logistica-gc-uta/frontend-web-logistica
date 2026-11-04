import { AppError } from '../../../lib/errors/AppError'
import type { Session } from '../../../types/auth'
import type { LoginCredentials, LoginResponse } from '../../auth/types'
import { shopErrorInfo } from '../shopError'
import { customerApiClient } from './customerApiClient'

export type RegisterInput = {
  name: string
  email: string
  password: string
}

export const NOT_A_CUSTOMER_MESSAGE =
  'Esta cuenta no es de cliente. El personal ingresa por el panel administrativo.'

/** Mensajes por código: no se decide comparando el texto del backend. */
function translate(error: unknown, fallback: string): never {
  const { status, code } = shopErrorInfo(error)
  if (code === 'EMAIL_ALREADY_EXISTS') {
    throw new AppError('Ya existe una cuenta con este correo. Inicia sesión.')
  }
  if (code === 'INVALID_CREDENTIALS' || status === 401) {
    throw new AppError('Correo o contraseña incorrectos.')
  }
  if (status === 400) throw new AppError(fallback)
  throw error
}

/**
 * Login y registro usan el cliente del Shop (sin el token del panel): así un 401 por contraseña
 * incorrecta nunca cierra la sesión ADMIN abierta en el mismo navegador.
 */
export const customerService = {
  /** Inicia sesión en el Shop. Solo se acepta el rol CLIENT: ADMIN y DRIVER usan el panel. */
  async login(credentials: LoginCredentials): Promise<Session> {
    const { data } = await customerApiClient
      .post<LoginResponse>('/auth/login', credentials)
      .catch((error: unknown) => translate(error, 'Revisa el correo y la contraseña.'))
    if (data.user.role !== 'CLIENT') throw new AppError(NOT_A_CUSTOMER_MESSAGE)
    return { token: data.access_token, user: data.user }
  },

  /** Registro público: solo nombre, correo y contraseña. El backend asigna el rol CLIENT. */
  async register({ name, email, password }: RegisterInput): Promise<void> {
    await customerApiClient
      .post('/auth/register', { name, email, password })
      .catch((error: unknown) => translate(error, 'Revisa los datos del registro.'))
  },
}
