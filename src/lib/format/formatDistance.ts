const kmFormatter = new Intl.NumberFormat('es-EC', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const percentFormatter = new Intl.NumberFormat('es-EC', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})

/** Formatea kilómetros con dos decimales, ej. "25,59 km". */
export const formatKm = (km: number): string => `${kmFormatter.format(km)} km`

/**
 * Duración estimada redondeada al minuto, ej. "≈ 14 min" o "≈ 1 h 05 min". El signo ≈ recuerda que
 * es una estimación sin tráfico en vivo, no una hora de llegada.
 */
export const formatDuration = (seconds: number): string => {
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `≈ ${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `≈ ${hours} h ${String(minutes % 60).padStart(2, '0')} min`
}

/** Formatea un porcentaje con hasta un decimal, ej. "52,7 %". */
export const formatPercent = (percent: number): string => `${percentFormatter.format(percent)} %`
