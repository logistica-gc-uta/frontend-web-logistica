import { describe, expect, it } from 'vitest'
import { AppError } from '../../lib/errors/AppError'
import { products } from '../../test/fixtures'
import { shopSettings } from '../../test/shopFixtures'
import {
  estimateOrderTotal,
  INITIAL_ORDER_FORM,
  REGISTERED_BUYER_PENDING,
  toCreateAdminPurchaseInput,
  validateOrder,
} from './orderValidation'
import type { OrderFormValues } from './types'

/** 1 de enero de 2030, 12:00 en Guayaquil. */
const NOW = new Date('2030-01-01T12:00:00-05:00')
/** Horario de la tienda: 07:00–17:00 (extremos incluidos). */
const SCHEDULE = shopSettings().deliverySchedule

const validValues: OrderFormValues = {
  ...INITIAL_ORDER_FORM,
  buyerName: 'María Pérez',
  buyerPhone: '0991234567',
  paymentMethod: 'CASH',
  deliveryAddress: 'Av. Los Chasquis y Río Guayllabamba',
  scheduledAt: '2030-01-02T10:00',
  items: [{ productId: 'product-1', quantity: '2' }],
  location: { lat: -1.25, lng: -78.63 },
  locationConfirmed: true,
}

const validate = (patch: Partial<OrderFormValues> = {}, coverageError?: string) =>
  validateOrder({ ...validValues, ...patch }, products, SCHEDULE, coverageError, NOW)

describe('validateOrder · venta ADMIN', () => {
  it('no devuelve errores con datos válidos', () => {
    expect(validate()).toEqual({})
  })

  it('exige nombre y teléfono del comprador, cómo pagó y la dirección', () => {
    expect(
      validate({ buyerName: ' ', buyerPhone: '', paymentMethod: '', deliveryAddress: '  ' }),
    ).toEqual({
      buyerName: 'Escribe el nombre del comprador',
      buyerPhone: 'El teléfono del comprador es obligatorio',
      paymentMethod: 'Elige cómo pagó: efectivo o transferencia',
      deliveryAddress: 'La dirección de entrega es obligatoria',
    })
  })

  it('respeta los largos máximos del backend', () => {
    expect(
      validate({
        buyerName: 'a'.repeat(121),
        buyerPhone: '1'.repeat(41),
        paymentNote: 'n'.repeat(201),
      }),
    ).toEqual({
      buyerName: 'Máximo 120 caracteres',
      buyerPhone: 'Máximo 40 caracteres',
      paymentNote: 'Máximo 200 caracteres',
    })
    expect(
      validate({
        buyerName: 'a'.repeat(120),
        buyerPhone: '1'.repeat(40),
        paymentNote: 'n'.repeat(200),
      }),
    ).toEqual({})
  })

  it('si el regalo lo recibe otra persona exige su nombre y teléfono', () => {
    expect(validate({ giftToOther: true })).toEqual({
      recipientName: 'Escribe el nombre de quien recibe',
      recipientPhone: 'El teléfono de quien recibe es obligatorio',
    })
    expect(
      validate({ giftToOther: true, recipientName: 'Ana', recipientPhone: '0987654321' }),
    ).toEqual({})
  })

  it('un cliente con cuenta todavía no se puede elegir (falta el buscador en el backend)', () => {
    expect(validate({ buyerType: 'REGISTERED_CLIENT' }).buyerType).toBe(REGISTERED_BUYER_PENDING)
  })

  describe('fecha y hora aproximada', () => {
    it('es obligatoria', () => {
      expect(validate({ scheduledAt: '' }).scheduledAt).toBe(
        'La fecha y la hora aproximada de entrega son obligatorias',
      )
    })

    it('respeta el horario de la tienda, con los extremos incluidos', () => {
      expect(validate({ scheduledAt: '2030-01-02T06:59' }).scheduledAt).toMatch(/07:00 y 17:00/)
      expect(validate({ scheduledAt: '2030-01-02T17:01' }).scheduledAt).toMatch(/07:00 y 17:00/)
      expect(validate({ scheduledAt: '2030-01-02T07:00' }).scheduledAt).toBeUndefined()
      expect(validate({ scheduledAt: '2030-01-02T17:00' }).scheduledAt).toBeUndefined()
    })

    it('no acepta un día pasado ni una hora de hoy que ya pasó', () => {
      expect(validate({ scheduledAt: '2029-12-31T10:00' }).scheduledAt).toBe(
        'El día de entrega ya pasó',
      )
      expect(validate({ scheduledAt: '2030-01-01T11:00' }).scheduledAt).toMatch(/ya pasó/)
      expect(validate({ scheduledAt: '2030-01-01T12:30' }).scheduledAt).toBeUndefined()
    })
  })

  describe('productos', () => {
    it('exige al menos una línea y un producto elegido', () => {
      expect(validate({ items: [] }).items).toBe('Agrega al menos un producto')
      expect(validate({ items: [{ productId: '', quantity: '1' }] }).items).toBe(
        'Producto 1: selecciona un producto',
      )
    })

    it.each(['0', '-1', '1.5', ''])('rechaza la cantidad %j', (quantity) => {
      expect(validate({ items: [{ productId: 'product-1', quantity }] }).items).toBe(
        'Producto 1: la cantidad debe ser un entero mayor a 0',
      )
    })

    it('suma las líneas repetidas del mismo producto al comparar con el stock', () => {
      const items = [
        { productId: 'product-1', quantity: '10' },
        { productId: 'product-1', quantity: '10' },
      ]

      expect(validate({ items }).items).toBe('Laptop HP Pavilion 15: solo hay 15 en stock')
      expect(
        validate({ items: [{ productId: 'product-1', quantity: '15' }] }).items,
      ).toBeUndefined()
    })
  })

  describe('ubicación', () => {
    it('exige colocar el marcador y confirmarlo', () => {
      expect(validate({ location: null, locationConfirmed: false }).location).toBe(
        'Coloca el marcador en el mapa',
      )
      expect(validate({ locationConfirmed: false }).location).toBe(
        'Confirma la ubicación en el mapa',
      )
    })

    it('un punto que el servidor dejó fuera de la cobertura no pasa', () => {
      expect(validate({}, 'Ese punto está fuera de la zona de entrega.').location).toBe(
        'Ese punto está fuera de la zona de entrega.',
      )
    })
  })
})

describe('toCreateAdminPurchaseInput', () => {
  it('arma el cuerpo de POST /orders/admin para un invitado: sin zona y con pago declarado', () => {
    const input = toCreateAdminPurchaseInput({
      ...validValues,
      buyerName: '  María Pérez ',
      buyerPhone: ' 0991234567 ',
      deliveryAddress: ' Av. Los Chasquis ',
      paymentMethod: 'TRANSFER',
      paymentNote: '  Transferencia Banco Pichincha ',
      items: [
        { productId: 'product-1', quantity: '2' },
        { productId: 'product-2', quantity: '3' },
      ],
    })

    expect(input).toEqual({
      buyer: { type: 'GUEST', name: 'María Pérez', contactPhone: '0991234567' },
      payment: { method: 'TRANSFER', note: 'Transferencia Banco Pichincha' },
      deliveryAddress: 'Av. Los Chasquis',
      items: [
        { productId: 'product-1', quantity: 2 },
        { productId: 'product-2', quantity: 3 },
      ],
      scheduledDeliveryDate: '2030-01-02T10:00:00-05:00',
      deliveryLat: -1.25,
      deliveryLng: -78.63,
    })
    expect(input).not.toHaveProperty('zoneId')
    expect(input).not.toHaveProperty('giftRecipient')
  })

  it('con regalo para otra persona envía su contacto aparte del comprador; sin nota no la envía', () => {
    const input = toCreateAdminPurchaseInput({
      ...validValues,
      giftToOther: true,
      recipientName: ' Ana Regalo ',
      recipientPhone: ' 0987654321 ',
    })

    expect(input.buyer).toEqual({ type: 'GUEST', name: 'María Pérez', contactPhone: '0991234567' })
    expect(input.giftRecipient).toEqual({ name: 'Ana Regalo', contactPhone: '0987654321' })
    expect(input.payment).toEqual({ method: 'CASH' })
  })

  it('falla si faltan datos (no debería ocurrir tras validar)', () => {
    expect(() => toCreateAdminPurchaseInput({ ...validValues, location: null })).toThrow(AppError)
    expect(() => toCreateAdminPurchaseInput({ ...validValues, scheduledAt: '' })).toThrow(AppError)
    expect(() => toCreateAdminPurchaseInput({ ...validValues, paymentMethod: '' })).toThrow(
      AppError,
    )
  })
})

describe('estimateOrderTotal', () => {
  it('suma precio por cantidad e ignora las líneas incompletas', () => {
    const items = [
      { productId: 'product-1', quantity: '2' },
      { productId: 'product-2', quantity: '3' },
      { productId: '', quantity: '2' },
      { productId: 'product-1', quantity: 'x' },
    ]

    expect(estimateOrderTotal(items, products)).toBe(1576.5)
  })
})
