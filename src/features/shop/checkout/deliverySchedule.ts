import { localDateTimeToIso, todayInGuayaquil } from '../../../lib/time/guayaquil'
import type { DeliverySchedule } from '../types'

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Guayaquil',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** Hora actual de Guayaquil (hh:mm), sin importar el huso horario del navegador. */
export const nowInGuayaquil = (now: Date = new Date()): string => timeFormatter.format(now)

export type ScheduleErrors = Partial<Record<'date' | 'time', string>>

/**
 * Valida el día y la hora de entrega en horario de Ecuador: día no pasado y hora dentro de la
 * ventana vigente, con los extremos incluidos (inicialmente 07:00–17:00). El backend vuelve a
 * validar con su propio reloj.
 */
export function validateDeliverySchedule(
  date: string,
  time: string,
  schedule: DeliverySchedule,
  now: Date = new Date(),
): ScheduleErrors {
  const errors: ScheduleErrors = {}
  const today = todayInGuayaquil(now)

  if (!DATE.test(date)) errors.date = 'Elige el día de entrega'
  else if (date < today) errors.date = 'El día de entrega ya pasó'

  if (!TIME.test(time)) errors.time = 'Elige la hora de entrega'
  else if (time < schedule.startTime || time > schedule.endTime) {
    errors.time = `La entrega debe ser entre ${schedule.startTime} y ${schedule.endTime} (hora de Ecuador)`
  } else if (date === today && time <= nowInGuayaquil(now)) {
    errors.time = 'Esa hora de hoy ya pasó: elige una hora posterior'
  }

  return errors
}

/** Instante ISO 8601 con el desfase explícito de Ecuador (`-05:00`), como lo exige el backend. */
export const deliveryInstant = (date: string, time: string): string | null =>
  localDateTimeToIso(`${date}T${time}`)
