import { describe, expect, it } from 'vitest'
import { validateLogin } from './loginValidation'

describe('validateLogin', () => {
  it('no devuelve errores con datos válidos', () => {
    expect(validateLogin({ email: 'admin@delivery.com', password: 'admin123' })).toEqual({})
  })

  it('exige correo y contraseña', () => {
    expect(validateLogin({ email: ' ', password: '' })).toEqual({
      email: 'El correo electrónico es obligatorio',
      password: 'La contraseña es obligatoria',
    })
  })

  it('valida el formato del correo', () => {
    expect(validateLogin({ email: 'admin', password: 'x' })).toEqual({
      email: 'El correo electrónico no es válido',
    })
  })
})
