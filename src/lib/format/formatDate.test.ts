import { describe, expect, it } from 'vitest'
import { formatDate } from './formatDate'

describe('formatDate', () => {
  it('formatea una fecha ISO como dd/mm/aaaa', () => {
    expect(formatDate('2026-10-07T12:00:00Z')).toBe('07/10/2026')
  })

  it('devuelve un guion para fechas inválidas', () => {
    expect(formatDate('no-es-fecha')).toBe('—')
  })
})
