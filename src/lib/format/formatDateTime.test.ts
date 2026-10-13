import { describe, expect, it } from 'vitest'
import { formatDateTime } from './formatDateTime'

describe('formatDateTime', () => {
  it('muestra el instante en hora de Guayaquil, sin importar el huso del equipo', () => {
    expect(formatDateTime('2030-02-14T15:00:00Z')).toMatch(/14\/02\/2030.*10:00/)
  })

  it('usa formato de 24 horas', () => {
    expect(formatDateTime('2030-02-14T22:30:00Z')).toMatch(/17:30/)
  })

  it.each([null, undefined, '', 'no-es-fecha'])('devuelve un guion para %j', (value) => {
    expect(formatDateTime(value)).toBe('—')
  })
})
