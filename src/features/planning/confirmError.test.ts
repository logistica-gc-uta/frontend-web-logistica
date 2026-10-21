import { AxiosError } from 'axios'
import { describe, expect, it } from 'vitest'
import { createHttpError } from '../../test/http'
import { describeConfirmError } from './confirmError'

describe('describeConfirmError', () => {
  it('explica la falta de permisos (403)', () => {
    expect(describeConfirmError(createHttpError(403))).toBe(
      'No tienes permisos para confirmar rutas.',
    )
  })

  it('explica un conflicto (409) con el detalle del backend y qué hacer', () => {
    const error = createHttpError(409, { data: { message: 'El pedido ya está reservado' } })

    expect(describeConfirmError(error)).toBe(
      'Conflicto: El pedido ya está reservado. Vuelve a previsualizar para ver el estado actual de los pedidos.',
    )
  })

  it('muestra el mensaje del backend en otros errores', () => {
    const error = createHttpError(400, { data: { message: 'routeDate inválido' } })

    expect(describeConfirmError(error)).toBe('routeDate inválido')
  })

  it('distingue la falta de conexión', () => {
    expect(describeConfirmError(new AxiosError('Network Error'))).toBe(
      'No se pudo conectar con el servidor',
    )
  })

  it('distingue el tiempo de espera agotado', () => {
    expect(describeConfirmError(new AxiosError('timeout', 'ECONNABORTED'))).toBe(
      'El servidor tardó demasiado en responder',
    )
  })

  it('usa un mensaje genérico para errores desconocidos', () => {
    expect(describeConfirmError(new Error('x'))).toBe('No se pudo confirmar la ruta')
  })
})
