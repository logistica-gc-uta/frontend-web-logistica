import { describe, expect, it } from 'vitest'
import { AppError } from '../../lib/errors/AppError'
import { products } from '../../test/fixtures'
import { estimateOrderTotal, toCreateAdminOrderInput, validateOrder } from './orderValidation'
import type { OrderFormValues } from './types'

/** 1 de enero de 2030, 12:00 en Guayaquil. */
const NOW = Date.parse('2030-01-01T12:00:00-05:00')

const validValues: OrderFormValues = {
  recipientName: 'María Pérez',
  recipientPhone: '0991234567',
  zoneId: 'zone-1',
  deliveryAddress: 'Av. Los Chasquis y Río Guayllabamba',
  scheduledAt: '2030-01-02T10:00',
  items: [{ productId: 'product-1', quantity: '2' }],
  location: { lat: -1.25, lng: -78.63 },
  locationConfirmed: true,
}

const validate = (patch: Partial<OrderFormValues> = {}) =>
  validateOrder({ ...validValues, ...patch }, products, NOW)

describe('validateOrder', () => {
  it('no devuelve errores con datos válidos', () => {
    expect(validate()).toEqual({})
  })

  it('exige los datos del destinatario, la zona y la dirección', () => {
    expect(
      validate({ recipientName: ' ', recipientPhone: '', zoneId: '', deliveryAddress: '  ' }),
    ).toEqual({
      recipientName: 'El nombre del destinatario es obligatorio',
      recipientPhone: 'El teléfono de contacto es obligatorio',
      zoneId: 'Selecciona una zona',
      deliveryAddress: 'La dirección de entrega es obligatoria',
    })
  })

  it('respeta los largos máximos del backend para nombre y teléfono', () => {
    expect(validate({ recipientName: 'a'.repeat(121), recipientPhone: '1'.repeat(41) })).toEqual({
      recipientName: 'El nombre no puede superar 120 caracteres',
      recipientPhone: 'El teléfono no puede superar 40 caracteres',
    })
    expect(validate({ recipientName: 'a'.repeat(120), recipientPhone: '1'.repeat(40) })).toEqual({})
  })

  describe('fecha y hora de entrega', () => {
    it('es obligatoria', () => {
      expect(validate({ scheduledAt: '' }).scheduledAt).toBe(
        'La fecha y hora de entrega son obligatorias',
      )
    })

    it('debe tener un formato válido', () => {
      expect(validate({ scheduledAt: 'mañana' }).scheduledAt).toBe(
        'La fecha y hora de entrega no son válidas',
      )
    })

    it.each(['2029-12-31T10:00', '2030-01-01T12:00'])(
      'rechaza %s por no ser futura',
      (scheduledAt) => {
        expect(validate({ scheduledAt }).scheduledAt).toBe(
          'La entrega debe programarse para una fecha y hora futuras',
        )
      },
    )

    it('acepta una hora de hoy que todavía no pasó', () => {
      expect(validate({ scheduledAt: '2030-01-01T12:01' }).scheduledAt).toBeUndefined()
    })
  })

  describe('productos', () => {
    it('exige al menos una línea', () => {
      expect(validate({ items: [] }).items).toBe('Agrega al menos un producto')
    })

    it('exige elegir el producto', () => {
      expect(validate({ items: [{ productId: '', quantity: '1' }] }).items).toBe(
        'Producto 1: selecciona un producto',
      )
    })

    it.each(['0', '-1', '1.5', ''])('rechaza la cantidad %j', (quantity) => {
      expect(validate({ items: [{ productId: 'product-1', quantity }] }).items).toBe(
        'Producto 1: la cantidad debe ser un entero mayor a 0',
      )
    })

    it('indica la posición de la línea con problemas', () => {
      const items = [
        { productId: 'product-1', quantity: '1' },
        { productId: '', quantity: '0' },
      ]

      expect(validate({ items }).items).toBe(
        'Producto 2: selecciona un producto. Producto 2: la cantidad debe ser un entero mayor a 0',
      )
    })

    it('rechaza una cantidad mayor al stock disponible', () => {
      expect(validate({ items: [{ productId: 'product-1', quantity: '16' }] }).items).toBe(
        'Laptop HP Pavilion 15: solo hay 15 en stock',
      )
    })

    it('suma las líneas repetidas del mismo producto al comparar con el stock', () => {
      const items = [
        { productId: 'product-1', quantity: '10' },
        { productId: 'product-1', quantity: '10' },
      ]

      expect(validate({ items }).items).toBe('Laptop HP Pavilion 15: solo hay 15 en stock')
    })

    it('acepta exactamente el stock disponible', () => {
      expect(
        validate({ items: [{ productId: 'product-1', quantity: '15' }] }).items,
      ).toBeUndefined()
    })

    it('no compara con el stock un producto que ya no está en el catálogo', () => {
      expect(validate({ items: [{ productId: 'borrado', quantity: '99' }] }).items).toBeUndefined()
    })
  })

  describe('ubicación', () => {
    it('exige colocar el marcador', () => {
      expect(validate({ location: null, locationConfirmed: false }).location).toBe(
        'Coloca el marcador en el mapa',
      )
    })

    it('exige confirmar el punto elegido', () => {
      expect(validate({ locationConfirmed: false }).location).toBe(
        'Confirma la ubicación en el mapa',
      )
    })
  })
})

describe('toCreateAdminOrderInput', () => {
  it('arma el cuerpo de POST /orders/admin con la hora de Guayaquil y las coordenadas', () => {
    const input = toCreateAdminOrderInput({
      ...validValues,
      recipientName: '  María Pérez ',
      recipientPhone: ' 0991234567 ',
      deliveryAddress: ' Av. Los Chasquis ',
      items: [
        { productId: 'product-1', quantity: '2' },
        { productId: 'product-2', quantity: '3' },
      ],
    })

    expect(input).toEqual({
      recipient: { type: 'GUEST', name: 'María Pérez', contactPhone: '0991234567' },
      zoneId: 'zone-1',
      deliveryAddress: 'Av. Los Chasquis',
      items: [
        { productId: 'product-1', quantity: 2 },
        { productId: 'product-2', quantity: 3 },
      ],
      scheduledDeliveryDate: '2030-01-02T10:00:00-05:00',
      deliveryLat: -1.25,
      deliveryLng: -78.63,
    })
  })

  it('falla si faltan la ubicación o la fecha (no debería ocurrir tras validar)', () => {
    expect(() => toCreateAdminOrderInput({ ...validValues, location: null })).toThrow(AppError)
    expect(() => toCreateAdminOrderInput({ ...validValues, scheduledAt: '' })).toThrow(AppError)
  })
})

describe('estimateOrderTotal', () => {
  it('suma precio por cantidad de cada línea', () => {
    const items = [
      { productId: 'product-1', quantity: '2' },
      { productId: 'product-2', quantity: '3' },
    ]

    expect(estimateOrderTotal(items, products)).toBe(1576.5)
  })

  it('ignora las líneas incompletas o con cantidad inválida', () => {
    const items = [
      { productId: '', quantity: '2' },
      { productId: 'product-1', quantity: 'x' },
      { productId: 'desconocido', quantity: '1' },
      { productId: 'product-2', quantity: '1' },
    ]

    expect(estimateOrderTotal(items, products)).toBe(25.5)
  })
})
