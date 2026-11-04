import type { FieldErrors } from '../../../hooks/useForm'
import type { CardInput } from './checkoutTypes'

export type CardForm = {
  number: string
  holderName: string
  expiresMonth: string
  expiresYear: string
  cvv: string
}

export const EMPTY_CARD: CardForm = {
  number: '',
  holderName: '',
  expiresMonth: '',
  expiresYear: '',
  cvv: '',
}

/** Tarjetas de demostración del contrato (CI-SHOP-001 §9): solo existen en este simulador. */
export const DEMO_CARDS = [
  {
    label: 'Aprobada (saldo $500)',
    number: '9000 0000 0000 0001',
    holder: 'PRUEBA APROBADA',
    cvv: '111',
  },
  {
    label: 'Saldo limitado ($20)',
    number: '9000 0000 0000 0002',
    holder: 'PRUEBA LIMITADA',
    cvv: '222',
  },
  { label: 'Sin saldo', number: '9000 0000 0000 0003', holder: 'PRUEBA SIN SALDO', cvv: '333' },
] as const

/** Formato del backend (`CardInputDto`): 16 a 19 dígitos o espacios, CVV de 3 dígitos. */
export function validateCard(values: CardForm, now: Date = new Date()): FieldErrors<CardForm> {
  const errors: FieldErrors<CardForm> = {}
  const digits = values.number.replace(/ /g, '')
  const month = Number(values.expiresMonth)
  const year = Number(values.expiresYear)

  if (!/^[0-9 ]{16,19}$/.test(values.number.trim()) || digits.length !== 16) {
    errors.number = 'Escribe los 16 dígitos de la tarjeta de demostración'
  }
  const holder = values.holderName.trim()
  if (holder.length < 2 || holder.length > 100)
    errors.holderName = 'Escribe el nombre como figura en la tarjeta'
  if (!Number.isInteger(month) || month < 1 || month > 12) errors.expiresMonth = 'Mes de 1 a 12'
  if (!/^\d{4}$/.test(values.expiresYear) || year < now.getFullYear()) {
    errors.expiresYear = 'Año de 4 dígitos, actual o posterior'
  }
  if (!/^\d{3}$/.test(values.cvv)) errors.cvv = 'CVV de 3 dígitos'
  return errors
}

export const toCardInput = (values: CardForm): CardInput => ({
  number: values.number.trim(),
  holderName: values.holderName.trim(),
  expiresMonth: Number(values.expiresMonth),
  expiresYear: Number(values.expiresYear),
  cvv: values.cvv,
})
