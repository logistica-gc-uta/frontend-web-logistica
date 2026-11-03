import { describe, expect, it } from 'vitest'
import { formatTime } from './formatTime'

describe('formatTime', () => {
  it('muestra la hora con segundos en Guayaquil (UTC-5)', () => {
    expect(formatTime('2026-10-21T15:04:09Z')).toBe('10:04:09')
  })

  it('devuelve "—" si falta o no es válida', () => {
    expect(formatTime(undefined)).toBe('—')
    expect(formatTime('no-es-fecha')).toBe('—')
  })
})
