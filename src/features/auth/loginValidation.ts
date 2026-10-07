import { isBlank, isValidEmail } from '../../lib/validation/validators'
import type { LoginCredentials } from './types'

export type LoginErrors = Partial<Record<keyof LoginCredentials, string>>

/** Valida el formulario de login con los mismos criterios que el LoginDto del backend. */
export function validateLogin({ email, password }: LoginCredentials): LoginErrors {
  const errors: LoginErrors = {}

  if (isBlank(email)) errors.email = 'El correo electrónico es obligatorio'
  else if (!isValidEmail(email)) errors.email = 'El correo electrónico no es válido'

  if (isBlank(password)) errors.password = 'La contraseña es obligatoria'

  return errors
}
