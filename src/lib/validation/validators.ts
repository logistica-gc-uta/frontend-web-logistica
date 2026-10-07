const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const isBlank = (value: string): boolean => value.trim().length === 0

export const isValidEmail = (value: string): boolean => EMAIL_PATTERN.test(value.trim())

/** Convierte el texto de un campo numérico; devuelve NaN si está vacío o no es un número. */
export const toNumber = (value: string): number => (isBlank(value) ? Number.NaN : Number(value))

export const isPositiveNumber = (value: string): boolean => toNumber(value) > 0

export const isNonNegativeInteger = (value: string): boolean => {
  const number = toNumber(value)
  return Number.isInteger(number) && number >= 0
}
