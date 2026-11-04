import { formatCurrency } from '../../lib/format/formatCurrency'

/** Precio en dólares a partir de centavos enteros, ej. 1999 → "$19,99". */
export const formatCents = (cents: number): string => formatCurrency(cents / 100)

/** Dólares con hasta 2 decimales, con punto o coma (ej. "12", "12.5", "12,50"). */
const DOLLARS = /^(\d{1,9})(?:[.,](\d{1,2}))?$/

/**
 * Convierte un monto escrito en dólares a centavos enteros sin pasar por números con decimales
 * (evita errores como 0.1 + 0.2). Devuelve `null` si el texto no es un monto válido.
 */
export function dollarsToCents(text: string): number | null {
  const match = DOLLARS.exec(text.trim())
  if (!match) return null
  const [, whole, fraction = ''] = match
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}
