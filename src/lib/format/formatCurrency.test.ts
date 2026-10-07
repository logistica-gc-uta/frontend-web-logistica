import { describe, expect, it } from 'vitest'
import { formatCurrency } from './formatCurrency'

/** Intl usa espacios no separables según el entorno; se normalizan para comparar. */
const normalizeSpaces = (text: string) => text.replace(/\s/g, ' ')

describe('formatCurrency', () => {
  it('formatea en dólares con dos decimales', () => {
    expect(normalizeSpaces(formatCurrency(25.5))).toMatch(/\$\s?25,50/)
  })

  it('separa los miles', () => {
    expect(normalizeSpaces(formatCurrency(1500))).toMatch(/1\.500,00/)
  })
})
