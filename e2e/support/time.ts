/** Fechas en el huso operativo (Guayaquil, UTC-5 sin horario de verano). */
const TIME_ZONE = 'America/Guayaquil'

const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE })
const hourFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** Hoy en Guayaquil (aaaa-mm-dd). */
export const todayInGuayaquil = (): string => dayFormatter.format(new Date())

/** Hora de Guayaquil (hh:mm) dentro de `minutes` minutos. */
export const guayaquilTimeIn = (minutes: number): string =>
  hourFormatter.format(new Date(Date.now() + minutes * 60_000))

/** Instante ISO con la zona de Guayaquil. */
export const at = (day: string, time: string): string => `${day}T${time}:00-05:00`

/**
 * Día propio de una ejecución: un miércoles al azar entre 2050 y 2079. Las rutas confirmadas quedan
 * guardadas, así que reutilizar un día dejaría sus pedidos reservados para la siguiente vez.
 */
export function randomFarDay(): string {
  const firstWednesday = Date.UTC(2050, 0, 5)
  const week = 7 * 24 * 60 * 60 * 1000
  return new Date(firstWednesday + Math.floor(Math.random() * 1500) * week)
    .toISOString()
    .slice(0, 10)
}
