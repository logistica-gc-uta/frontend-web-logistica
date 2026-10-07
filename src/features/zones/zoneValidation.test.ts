import { describe, expect, it } from 'vitest'
import { normalizeZone, validateZone } from './zoneValidation'

describe('validateZone', () => {
  it('no devuelve errores con datos válidos', () => {
    expect(validateZone({ name: 'Ficoa', code: 'FIC-02' })).toEqual({})
  })

  it('exige nombre y código', () => {
    expect(validateZone({ name: '  ', code: '' })).toEqual({
      name: 'El nombre de la zona es obligatorio',
      code: 'El código de la zona es obligatorio',
    })
  })
})

describe('normalizeZone', () => {
  it('elimina los espacios sobrantes', () => {
    expect(normalizeZone({ name: '  Ficoa ', code: ' FIC-02 ' })).toEqual({
      name: 'Ficoa',
      code: 'FIC-02',
    })
  })
})
