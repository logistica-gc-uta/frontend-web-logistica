import type { FieldErrors } from '../../hooks/useForm'
import { todayInGuayaquil } from '../../lib/time/guayaquil'
import type { DriverDayAvailability, DriverProfileInput } from './types'

/** Límites del backend (#43 y #44). */
const MIN_TEXT = 2
const MAX_TEXT = 120
export const MAX_REASON = 300
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DAY = /^\d{4}-\d{2}-\d{2}$/

function textError(value: string, label: string): string | undefined {
  const text = value.trim()
  if (text.length < MIN_TEXT) return `${label}: escribe al menos ${MIN_TEXT} caracteres`
  if (text.length > MAX_TEXT) return `${label}: máximo ${MAX_TEXT} caracteres`
  return undefined
}

export function validateProfile(values: DriverProfileInput): FieldErrors<DriverProfileInput> {
  const errors: FieldErrors<DriverProfileInput> = {}
  const name = textError(values.name, 'Nombre')
  if (name) errors.name = name
  if (!EMAIL.test(values.email.trim())) errors.email = 'Escribe un correo válido'
  const vehicle = textError(values.vehicle, 'Vehículo')
  if (vehicle) errors.vehicle = vehicle
  return errors
}

/** Solo los campos que cambiaron, recortados (el backend exige al menos uno). */
export function profileChanges(
  values: DriverProfileInput,
  current: DriverProfileInput,
): Partial<DriverProfileInput> {
  const changes: Partial<DriverProfileInput> = {}
  for (const key of ['name', 'email', 'vehicle'] as const) {
    const next = values[key].trim()
    if (next !== current[key]) changes[key] = next
  }
  return changes
}

export type AbsenceForm = { startDate: string; endDate: string; reason: string }

/** Hoy o futuro, rango en orden y motivo dentro del límite. El backend vuelve a validar. */
export function validateAbsence(
  values: AbsenceForm,
  today: string = todayInGuayaquil(),
): FieldErrors<AbsenceForm> {
  const errors: FieldErrors<AbsenceForm> = {}
  if (!DAY.test(values.startDate)) errors.startDate = 'Elige el primer día de la ausencia'
  else if (values.startDate < today) errors.startDate = 'Solo hoy o fechas futuras'
  if (!DAY.test(values.endDate)) errors.endDate = 'Elige el último día de la ausencia'
  else if (DAY.test(values.startDate) && values.endDate < values.startDate)
    errors.endDate = 'No puede ser anterior al primer día'
  if (values.reason.trim().length > MAX_REASON) errors.reason = `Máximo ${MAX_REASON} caracteres`
  return errors
}

/** Estado legible de un día, distinguiendo ausente de ocupado. */
export function availabilityLabel(day: DriverDayAvailability): {
  text: string
  tone: 'success' | 'danger' | 'warning'
} {
  if (day.absence) {
    return {
      text: `Ausente${day.absence.reason ? ` · ${day.absence.reason}` : ''}`,
      tone: 'danger',
    }
  }
  if (day.isAvailable) return { text: 'Disponible', tone: 'success' }
  if (day.hasPersistedHolds) return { text: 'Ocupado con una ruta', tone: 'warning' }
  return { text: 'Marcado como no disponible', tone: 'warning' }
}
