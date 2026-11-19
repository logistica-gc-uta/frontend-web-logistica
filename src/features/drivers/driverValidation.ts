import type { FieldErrors } from '../../hooks/useForm'
import { todayInGuayaquil } from '../../lib/time/guayaquil'
import {
  DEFAULT_VEHICLE_CAPACITY,
  MAX_VEHICLE_CAPACITY,
  type DriverDayAvailability,
  type DriverProfileFormValues,
  type DriverProfileInput,
} from './types'

/** Límites del backend (#43 y #44). */
const MIN_TEXT = 2
const MAX_TEXT = 120
export const MAX_REASON = 300
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DAY = /^\d{4}-\d{2}-\d{2}$/
const WHOLE_NUMBER = /^\d+$/

export function effectiveVehicleCapacity(value: number | null | undefined): number {
  return value ?? DEFAULT_VEHICLE_CAPACITY
}

export function formatVehicleCapacity(value: number | null | undefined): string {
  if (value == null) return `${DEFAULT_VEHICLE_CAPACITY} unidades (por defecto)`
  return value === 1 ? '1 unidad' : `${value} unidades`
}

export function parseVehicleCapacity(value?: string): number | null {
  const trimmed = value?.trim() ?? ''
  if (trimmed === '') return null
  return Number(trimmed)
}

function capacityError(value?: string): string | undefined {
  const trimmed = value?.trim() ?? ''
  if (trimmed === '') return undefined
  if (!WHOLE_NUMBER.test(trimmed)) {
    return `Capacidad: escribe un entero mayor a 0 (máximo ${MAX_VEHICLE_CAPACITY})`
  }
  const parsed = Number(trimmed)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_VEHICLE_CAPACITY) {
    return `Capacidad: escribe un entero mayor a 0 (máximo ${MAX_VEHICLE_CAPACITY})`
  }
  return undefined
}

function textError(value: string, label: string): string | undefined {
  const text = value.trim()
  if (text.length < MIN_TEXT) return `${label}: escribe al menos ${MIN_TEXT} caracteres`
  if (text.length > MAX_TEXT) return `${label}: máximo ${MAX_TEXT} caracteres`
  return undefined
}

export function validateProfile(
  values: DriverProfileFormValues,
): FieldErrors<DriverProfileFormValues> {
  const errors: FieldErrors<DriverProfileFormValues> = {}
  const name = textError(values.name, 'Nombre')
  if (name) errors.name = name
  if (!EMAIL.test(values.email.trim())) errors.email = 'Escribe un correo válido'
  const vehicle = textError(values.vehicle, 'Vehículo')
  if (vehicle) errors.vehicle = vehicle
  const capacity = capacityError(values.vehicleCapacity)
  if (capacity) errors.vehicleCapacity = capacity
  return errors
}

/** Solo los campos que cambiaron, recortados (el backend exige al menos uno). */
export function profileChanges(
  values: DriverProfileFormValues,
  current: DriverProfileFormValues,
): Partial<DriverProfileInput> {
  const changes: Partial<DriverProfileInput> = {}
  for (const key of ['name', 'email', 'vehicle'] as const) {
    const next = values[key].trim()
    if (next !== current[key]) changes[key] = next
  }
  const nextCapacity = parseVehicleCapacity(values.vehicleCapacity)
  const prevCapacity = parseVehicleCapacity(current.vehicleCapacity)
  if (nextCapacity !== prevCapacity) changes.vehicleCapacity = nextCapacity
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
