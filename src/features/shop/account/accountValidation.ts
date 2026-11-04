import type { FieldErrors } from '../../../hooks/useForm'
import { isBlank, isValidEmail } from '../../../lib/validation/validators'

/** Mismos límites que el `RegisterDto` del backend. */
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128
export const NAME_MIN = 2
export const NAME_MAX = 120

export type RegisterForm = {
  name: string
  email: string
  password: string
  confirmation: string
}

export function validateRegister({
  name,
  email,
  password,
  confirmation,
}: RegisterForm): FieldErrors<RegisterForm> {
  const errors: FieldErrors<RegisterForm> = {}
  const trimmedName = name.trim()

  if (trimmedName === '') errors.name = 'Escribe tu nombre completo'
  else if (trimmedName.length < NAME_MIN || trimmedName.length > NAME_MAX) {
    errors.name = `El nombre debe tener entre ${NAME_MIN} y ${NAME_MAX} caracteres`
  }

  if (isBlank(email)) errors.email = 'El correo electrónico es obligatorio'
  else if (!isValidEmail(email)) errors.email = 'El correo electrónico no es válido'

  if (password === '') errors.password = 'La contraseña es obligatoria'
  else if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    errors.password = `La contraseña debe tener entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres`
  }

  if (confirmation === '') errors.confirmation = 'Repite la contraseña'
  else if (confirmation !== password) errors.confirmation = 'Las contraseñas no coinciden'

  return errors
}
