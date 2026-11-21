import type { DeliverySchedule } from '../shop/types'

/** Prefijo telefónico de Ecuador: se muestra fijo junto al campo y se antepone al enviar. */
export const PHONE_PREFIX = '+593'
/** Un celular ecuatoriano son 9 dígitos y empieza con 9 (sin el 0 inicial ni el +593). */
export const PHONE_DIGITS = 9
const MOBILE = /^9\d{8}$/

/** Solo letras (con tildes y ñ), espacios, apóstrofo, punto y guion: un nombre no lleva números. */
export const sanitizeName = (value: string): string =>
  value.replace(/[^\p{L}\s'.-]/gu, '').replace(/\s{2,}/g, ' ')

/** Solo dígitos, sin el 0 inicial (se escribe 0991234567 o 991234567 y queda 991234567). */
export function sanitizePhone(value: string): string {
  const digits = value.replace(/\D/g, '').replace(/^0+/, '')
  return digits.slice(0, PHONE_DIGITS)
}

export const isEcuadorianMobile = (value: string): boolean => MOBILE.test(value)

/** Teléfono completo para el servidor: +593 y los 9 dígitos. */
export const toInternationalPhone = (digits: string): string => `${PHONE_PREFIX}${digits}`

/** «991 234 567» para mostrar en el resumen. */
export const formatPhone = (digits: string): string =>
  digits === '' ? '' : `${PHONE_PREFIX} ${digits.replace(/(\d{3})(?=\d)/g, '$1 ')}`

/** Separa «2030-01-02T10:30» en día y hora (vacíos si aún no hay valor). */
export function splitScheduledAt(value: string): { date: string; time: string } {
  const [date = '', time = ''] = value.split('T')
  return { date, time }
}

export const joinScheduledAt = (date: string, time: string): string =>
  date === '' && time === '' ? '' : `${date}T${time}`

/** «14:30» → «2:30 p. m.»: la hora se lee sin tener que convertir de 24 horas. */
export function formatTimeLabel(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return time
  const suffix = hours < 12 ? 'a. m.' : 'p. m.'
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`
}

const toMinutes = (time: string): number => {
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/** Horas ofrecidas cada 30 minutos dentro del horario de entrega (extremos incluidos). */
export function buildTimeSlots(schedule: DeliverySchedule, stepMinutes = 30): string[] {
  const slots: string[] = []
  for (
    let at = toMinutes(schedule.startTime);
    at <= toMinutes(schedule.endTime);
    at += stepMinutes
  ) {
    slots.push(
      `${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`,
    )
  }
  return slots
}

/** Horario habitual (7:00 a 17:00, hora de Ecuador) mientras no se conoce el de la tienda. */
export const DEFAULT_DELIVERY_SCHEDULE: DeliverySchedule = {
  timeZone: 'America/Guayaquil',
  startTime: '07:00',
  endTime: '17:00',
}

/**
 * Opciones del selector de hora del panel (`SelectMenu`): cada 30 minutos dentro del horario de
 * entrega y escritas con a. m./p. m. Es el único patrón para elegir una hora de entrega o una franja.
 */
export const timeSlotOptions = (schedule: DeliverySchedule) =>
  buildTimeSlots(schedule).map((slot) => ({ value: slot, label: formatTimeLabel(slot) }))
