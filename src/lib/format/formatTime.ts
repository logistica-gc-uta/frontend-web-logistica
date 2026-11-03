import { BUSINESS_TIME_ZONE } from '../time/guayaquil'

const timeFormatter = new Intl.DateTimeFormat('es-EC', {
  timeZone: BUSINESS_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/** Hora con segundos en Guayaquil (hh:mm:ss), por ejemplo para "última actualización". */
export function formatTime(isoDate: string | null | undefined): string {
  if (!isoDate) return '—'
  const date = new Date(isoDate)
  return Number.isNaN(date.getTime()) ? '—' : timeFormatter.format(date)
}
