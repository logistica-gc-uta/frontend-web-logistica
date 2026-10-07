import { describe, expect, it } from 'vitest'
import {
  isBlank,
  isNonNegativeInteger,
  isPositiveNumber,
  isValidEmail,
  toNumber,
} from './validators'

describe('isBlank', () => {
  it.each(['', '   ', '\t'])('considera vacío %j', (value) => {
    expect(isBlank(value)).toBe(true)
  })

  it('considera no vacío un texto con contenido', () => {
    expect(isBlank(' a ')).toBe(false)
  })
})

describe('isValidEmail', () => {
  it.each(['admin@delivery.com', ' user.name@uta.edu.ec '])('acepta %j', (value) => {
    expect(isValidEmail(value)).toBe(true)
  })

  it.each(['admin', 'admin@', '@delivery.com', 'admin@delivery', 'a b@c.com'])(
    'rechaza %j',
    (value) => {
      expect(isValidEmail(value)).toBe(false)
    },
  )
})

describe('toNumber', () => {
  it('convierte textos numéricos', () => {
    expect(toNumber(' 25.5 ')).toBe(25.5)
  })

  it.each(['', '  ', 'abc'])('devuelve NaN para %j', (value) => {
    expect(toNumber(value)).toBeNaN()
  })
})

describe('isPositiveNumber', () => {
  it.each(['0.01', '750', '25.5'])('acepta %j', (value) => {
    expect(isPositiveNumber(value)).toBe(true)
  })

  it.each(['0', '-1', '', 'abc'])('rechaza %j', (value) => {
    expect(isPositiveNumber(value)).toBe(false)
  })
})

describe('isNonNegativeInteger', () => {
  it.each(['0', '15'])('acepta %j', (value) => {
    expect(isNonNegativeInteger(value)).toBe(true)
  })

  it.each(['-1', '1.5', '', 'abc'])('rechaza %j', (value) => {
    expect(isNonNegativeInteger(value)).toBe(false)
  })
})
