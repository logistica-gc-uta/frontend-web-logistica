import { AxiosError, AxiosHeaders } from 'axios'
import { describe, expect, it } from 'vitest'
import { getErrorMessage } from './apiError'

const createHttpError = (status: number, data: unknown) =>
  new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
  })

describe('getErrorMessage', () => {
  it('devuelve el mensaje del backend cuando es un texto', () => {
    const error = createHttpError(401, { message: 'Credenciales inválidas' })

    expect(getErrorMessage(error)).toBe('Credenciales inválidas')
  })

  it('une los mensajes de validación cuando el backend devuelve un arreglo', () => {
    const error = createHttpError(400, {
      message: ['El nombre es requerido', 'El código es requerido'],
    })

    expect(getErrorMessage(error)).toBe('El nombre es requerido. El código es requerido')
  })

  it('usa el mensaje por defecto si la respuesta no trae mensaje', () => {
    expect(getErrorMessage(createHttpError(500, {}), 'Fallo del servidor')).toBe(
      'Fallo del servidor',
    )
  })

  it('indica falta de conexión cuando no hay respuesta del servidor', () => {
    expect(getErrorMessage(new AxiosError('Network Error'))).toBe(
      'No se pudo conectar con el servidor',
    )
  })

  it('usa el mensaje por defecto para errores que no son HTTP', () => {
    expect(getErrorMessage(new Error('inesperado'))).toBe('Ocurrió un error inesperado')
  })
})
