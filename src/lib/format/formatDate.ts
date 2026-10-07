const dateFormatter = new Intl.DateTimeFormat('es-EC', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

/** Formatea una fecha ISO del backend como dd/mm/aaaa. Devuelve "—" si no es válida. */
export function formatDate(isoDate: string): string {
  const date = new Date(isoDate)
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date)
}
