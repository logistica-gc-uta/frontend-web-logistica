import type { FieldErrors } from '../../hooks/useForm'
import { isBlank } from '../../lib/validation/validators'
import type { CreateZoneInput } from './types'

/** Valida el formulario de zona con los mismos criterios que el CreateZoneDto del backend. */
export function validateZone({ name, code }: CreateZoneInput): FieldErrors<CreateZoneInput> {
  const errors: FieldErrors<CreateZoneInput> = {}

  if (isBlank(name)) errors.name = 'El nombre de la zona es obligatorio'
  if (isBlank(code)) errors.code = 'El código de la zona es obligatorio'

  return errors
}

/** Limpia los espacios sobrantes antes de enviar al backend. */
export const normalizeZone = ({ name, code }: CreateZoneInput): CreateZoneInput => ({
  name: name.trim(),
  code: code.trim(),
})
