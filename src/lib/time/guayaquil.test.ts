import { describe, expect, it } from 'vitest'
import { localDateTimeToIso } from './guayaquil'

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
