import { BUSINESS_TIME_ZONE } from '../time/guayaquil'

const dateTimeFormatter = new Intl.DateTimeFormat('es-EC', {
  timeZone: BUSINESS_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/**
 * Formatea un instante ISO del backend en hora de Guayaquil (dd/mm/aaaa hh:mm).
 * Devuelve "—" si el valor falta o no es una fecha válida.
 */
export function formatDateTime(isoDate: string | null | undefined): string {
  if (!isoDate) return '—'
  const date = new Date(isoDate)
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter.format(date)
}
