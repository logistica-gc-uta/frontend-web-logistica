/** Huso horario operativo del negocio (Ambato, Ecuador). */
export const BUSINESS_TIME_ZONE = 'America/Guayaquil'

/** Ecuador continental está en UTC-5 todo el año (no usa horario de verano). */
const BUSINESS_UTC_OFFSET = '-05:00'

/** Formato del valor de `<input type="datetime-local">`: aaaa-mm-ddThh:mm. */
const LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/**
 * Convierte la fecha y hora escritas por el operador (hora de Guayaquil) a un instante ISO 8601
 * con desfase explícito, que es lo que exige el backend. Devuelve `null` si el valor no es válido.
 */
export function localDateTimeToIso(local: string): string | null {
  if (!LOCAL_DATE_TIME_PATTERN.test(local)) return null
  const iso = `${local}:00${BUSINESS_UTC_OFFSET}`
  return Number.isNaN(Date.parse(iso)) ? null : iso
}
