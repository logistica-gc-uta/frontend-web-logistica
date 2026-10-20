import { describe, expect, it } from 'vitest'
import { formatKm, formatPercent } from './formatDistance'

describe('formatKm', () => {
  it('muestra dos decimales con coma y la unidad', () => {
    expect(formatKm(25.585)).toMatch(/^25,5[89] km$/)
    expect(formatKm(2.09)).toBe('2,09 km')
  })

  it('completa los decimales faltantes', () => {
    expect(formatKm(3)).toBe('3,00 km')
    expect(formatKm(0)).toBe('0,00 km')
  })
})

describe('formatPercent', () => {
  it('muestra hasta un decimal', () => {
    expect(formatPercent(52.65)).toMatch(/^52,[67] %$/)
    expect(formatPercent(47.8)).toBe('47,8 %')
  })

  it('omite el decimal cuando es exacto', () => {
    expect(formatPercent(50)).toBe('50 %')
    expect(formatPercent(0)).toBe('0 %')
  })
})
