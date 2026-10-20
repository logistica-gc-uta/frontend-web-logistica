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

/** Formatea un porcentaje con hasta un decimal, ej. "52,7 %". */
export const formatPercent = (percent: number): string => `${percentFormatter.format(percent)} %`
