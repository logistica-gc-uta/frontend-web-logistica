import { describe, expect, it } from 'vitest'
import { isBlank, isValidEmail } from './validators'

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
