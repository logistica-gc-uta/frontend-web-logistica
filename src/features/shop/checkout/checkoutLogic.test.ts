import { AxiosError } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkoutDraft, delivery, quote } from '../../../test/checkoutFixtures'
import { createHttpError, createHttpResponse } from '../../../test/http'
import { customerApiClient } from '../account/customerApiClient'
import { validateCard, EMPTY_CARD } from './cardValidation'
import { describeCheckoutError, problemForCode } from './checkoutErrors'
import { checkoutService, PAYMENT_TIMEOUT_MS } from './checkoutService'
import { checkoutStorage, sameItems } from './checkoutStorage'

const shopError = (status: number, code: string) =>
  createHttpError(status, { data: { error: { code, message: 'texto del backend' } } })

afterEach(() => sessionStorage.clear())

describe('describeCheckoutError (por código, no por texto)', () => {
  it.each([
    ['DELIVERY_OUTSIDE_HOURS', 'fix'],
    ['QUANTITY_LIMIT_EXCEEDED', 'cart'],
    ['STOCK_UNAVAILABLE', 'cart'],
    ['PRODUCT_UNPUBLISHED', 'cart'],
    ['PRICE_CHANGED', 'requote'],
    ['SHOP_SETTINGS_CHANGED', 'requote'],
    ['QUOTE_EXPIRED', 'requote'],
    ['INSUFFICIENT_DEMO_FUNDS', 'card'],
    ['CARD_INVALID', 'card'],
    ['CARD_EXPIRED', 'card'],
    ['IDEMPOTENCY_KEY_REUSED', 'verify'],
  ])('%s → %s', (code, action) => {
    expect(describeCheckoutError(shopError(409, code)).action).toBe(action)
  })

  it('en un pago sin respuesta o con error del servidor se verifica; en una cotización se reintenta', () => {
    const network = new AxiosError('Network Error', 'ERR_NETWORK')
    expect(describeCheckoutError(network, { isPayment: true }).action).toBe('verify')
    expect(describeCheckoutError(createHttpError(502), { isPayment: true }).action).toBe('verify')
    expect(describeCheckoutError(network).action).toBe('retry')
    expect(describeCheckoutError(createHttpError(500)).action).toBe('retry')
  })

  it('un código desconocido no se interpreta', () => {
    expect(problemForCode('OTRO')).toBeNull()
    expect(problemForCode(null)).toBeNull()
  })
})

describe('checkoutService', () => {
  it('cotiza con items y entrega, y paga con la clave de idempotencia en la cabecera', async () => {
    const post = vi.spyOn(customerApiClient, 'post').mockResolvedValue(createHttpResponse(quote()))
    const items = [{ productId: 'p1', quantity: 2 }]

    await checkoutService.quote(items, delivery)
    expect(post).toHaveBeenCalledWith('/shop/checkout/quote', { items, delivery })

    const card = {
      number: '9000 0000 0000 0001',
      holderName: 'X',
      expiresMonth: 12,
      expiresYear: 2030,
      cvv: '111',
    }
    await checkoutService.pay('clave-1', { items, delivery, quoteToken: 'qtk', paymentCard: card })
    expect(post).toHaveBeenLastCalledWith(
      '/shop/checkout',
      { items, delivery, quoteToken: 'qtk', paymentCard: card },
      { headers: { 'Idempotency-Key': 'clave-1' }, timeout: PAYMENT_TIMEOUT_MS },
    )
  })

  it('consulta el intento por su clave original', async () => {
    const get = vi.spyOn(customerApiClient, 'get').mockResolvedValue(
      createHttpResponse({
        status: 'PROCESSING',
        orderId: null,
        errorCode: null,
        checkoutAttemptId: 'a',
      }),
    )
    expect(await checkoutService.attempt('clave 1')).toEqual({
      status: 'PROCESSING',
      orderId: null,
      errorCode: null,
    })
    expect(get).toHaveBeenCalledWith('/shop/checkout-attempts/clave%201')
  })
})

describe('checkoutStorage', () => {
  it('guarda el flujo solo para su dueño y nunca datos de tarjeta', () => {
    checkoutStorage.save(checkoutDraft({ pendingKey: 'k' }))
    expect(checkoutStorage.load('cliente-1')?.pendingKey).toBe('k')
    expect(checkoutStorage.load('otra-cuenta')).toBeNull()
    expect(sessionStorage.getItem('regalia.checkout')).not.toMatch(/cvv|number/i)
  })

  it('compara el carrito con lo cotizado', () => {
    const a = [{ productId: 'p1', quantity: 2 }]
    expect(sameItems(a, [{ productId: 'p1', quantity: 2 }])).toBe(true)
    expect(sameItems(a, [{ productId: 'p1', quantity: 3 }])).toBe(false)
    expect(sameItems(a, [])).toBe(false)
  })
})

describe('validateCard', () => {
  const NOW = new Date('2026-11-03T12:00:00Z')

  it('acepta una tarjeta de demostración bien escrita', () => {
    expect(
      validateCard(
        {
          number: '9000 0000 0000 0001',
          holderName: 'PRUEBA',
          expiresMonth: '12',
          expiresYear: '2030',
          cvv: '111',
        },
        NOW,
      ),
    ).toEqual({})
  })

  it('rechaza número, nombre, mes, año y CVV inválidos', () => {
    expect(
      Object.keys(
        validateCard(
          { ...EMPTY_CARD, number: '1234', expiresMonth: '13', expiresYear: '2020', cvv: '1a1' },
          NOW,
        ),
      ).sort(),
    ).toEqual(['cvv', 'expiresMonth', 'expiresYear', 'holderName', 'number'])
  })
})
