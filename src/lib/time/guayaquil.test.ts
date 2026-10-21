import { describe, expect, it } from 'vitest'
import { localDateTimeToIso, todayInGuayaquil } from './guayaquil'

describe('todayInGuayaquil', () => {
  it('devuelve el día en horario de Guayaquil (aaaa-mm-dd)', () => {
    expect(todayInGuayaquil(new Date('2030-02-14T15:00:00Z'))).toBe('2030-02-14')
  })

  it('aún es el día anterior en Guayaquil cuando en UTC ya cambió de día', () => {
    // 02:30 UTC del 15 es 21:30 del 14 en Guayaquil (UTC-5).
    expect(todayInGuayaquil(new Date('2030-02-15T02:30:00Z'))).toBe('2030-02-14')
  })

  it('ya es el día siguiente en Guayaquil a las 05:00 UTC', () => {
    expect(todayInGuayaquil(new Date('2030-02-15T05:00:00Z'))).toBe('2030-02-15')
  })

  it('sin argumentos usa la fecha actual', () => {
    expect(todayInGuayaquil()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('localDateTimeToIso', () => {
  it('interpreta la fecha y hora como hora de Guayaquil (UTC-5)', () => {
    const iso = localDateTimeToIso('2030-02-14T10:00')

    expect(iso).toBe('2030-02-14T10:00:00-05:00')
    expect(new Date(iso!).toISOString()).toBe('2030-02-14T15:00:00.000Z')
  })

  it.each([
    '',
    'mañana',
    '2030-02-14',
    '2030-02-14 10:00',
    '2030-02-14T10:00:30',
    '2030-13-40T10:00',
  ])('devuelve null para %j', (value) => {
    expect(localDateTimeToIso(value)).toBeNull()
  })
})
