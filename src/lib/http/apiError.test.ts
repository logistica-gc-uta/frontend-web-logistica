import { AxiosError } from 'axios'
import { describe, expect, it } from 'vitest'
import { createHttpError } from '../../test/httpErrors'
import { AppError } from '../errors/AppError'
import { getErrorMessage } from './apiError'

describe('getErrorMessage', () => {
  it('devuelve el mensaje del backend cuando es un texto', () => {
    const error = createHttpError(401, { data: { message: 'Credenciales inválidas' } })

    expect(getErrorMessage(error)).toBe('Credenciales inválidas')
  })

  it('une los mensajes de validación cuando el backend devuelve un arreglo', () => {
    const error = createHttpError(400, {
      data: { message: ['El nombre es requerido', 'El código es requerido'] },
    })

    expect(getErrorMessage(error)).toBe('El nombre es requerido. El código es requerido')
  })

  it('usa el mensaje por defecto si la respuesta no trae mensaje', () => {
    expect(getErrorMessage(createHttpError(500), 'Fallo del servidor')).toBe('Fallo del servidor')
  })

  it('indica falta de conexión cuando no hay respuesta del servidor', () => {
    expect(getErrorMessage(new AxiosError('Network Error'))).toBe(
      'No se pudo conectar con el servidor',
    )
  })

  it('devuelve el mensaje de un AppError tal cual', () => {
    expect(getErrorMessage(new AppError('Sin permisos'))).toBe('Sin permisos')
  })

  it('usa el mensaje por defecto para errores que no son HTTP', () => {
    expect(getErrorMessage(new Error('inesperado'))).toBe('Ocurrió un error inesperado')
  })
})
