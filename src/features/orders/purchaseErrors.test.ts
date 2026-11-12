import { AxiosError } from 'axios'
import { describe, expect, it } from 'vitest'
import { createHttpError } from '../../test/http'
import { describePurchaseError } from './purchaseErrors'

const coded = (status: number, code: string) =>
  createHttpError(status, { data: { error: { code, message: 'x', details: {} } } })

describe('describePurchaseError', () => {
  it('un rechazo definitivo pide corregir; nunca se presenta como éxito', () => {
    expect(describePurchaseError(coded(422, 'DELIVERY_OUTSIDE_COVERAGE')).action).toBe('fix')
    expect(describePurchaseError(coded(409, 'STORE_NOT_CONFIGURED')).message).toMatch(
      /Tienda y cobertura/,
    )
    expect(describePurchaseError(createHttpError(403)).message).toBe(
      'Solo un ADMIN puede registrar ventas.',
    )
  })

  it('sin respuesta, error del servidor o venta en proceso: se verifica, no se reenvía', () => {
    expect(describePurchaseError(new AxiosError('Network Error')).action).toBe('verify')
    expect(describePurchaseError(createHttpError(503)).action).toBe('verify')
    expect(describePurchaseError(coded(409, 'ADMIN_PURCHASE_IN_PROGRESS')).action).toBe('verify')
  })

  it('una clave usada con otros datos pide reenviar con una clave nueva', () => {
    expect(describePurchaseError(coded(409, 'IDEMPOTENCY_KEY_REUSED')).action).toBe('newKey')
  })

  it('traduce el rechazo de un producto antiguo sin precio en centavos', () => {
    const error = createHttpError(400, {
      data: { message: "Product 'Laptop HP Pavilion 15' has no valid price in cents configured" },
    })

    expect(describePurchaseError(error)).toEqual({
      action: 'fix',
      message:
        'No se registró la venta: «Laptop HP Pavilion 15» no tiene un precio en centavos configurado. Corrige su precio en Productos o elige otro producto.',
    })
  })
})
