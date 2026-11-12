import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ordersService } from '../features/orders/ordersService'
import { customerService } from '../features/shop/account/customerService'
import { customerStorage } from '../features/shop/account/customerStorage'
import { checkoutService } from '../features/shop/checkout/checkoutService'
import type { CardInput } from '../features/shop/checkout/checkoutTypes'
import {
  customerOrdersService,
  ORDER_NOT_FOUND_MESSAGE,
} from '../features/shop/orders/customerOrdersService'
import { authStorage } from '../lib/auth/authStorage'
import { BUSINESS_TIME_ZONE } from '../lib/time/guayaquil'
import type { Session } from '../types/auth'
import type { GeoPoint } from '../types/geo'
import { coveragePoints } from './support/purchases'
import { loginAsAdmin, uniqueSuffix } from './support/session'
import { createShopCategory, createShopProduct } from './support/shopCatalog'

/**
 * #35 · Historial unificado contra la API real (backend #46): un cliente ve en una sola lista su
 * compra de la web y la que la tienda registró a su nombre, cada una con su origen; otro cliente
 * no ve ninguna, y una venta de invitado con el mismo teléfono no entra en su historial.
 */
const APPROVED: CardInput = {
  number: '9000 0000 0000 0001',
  holderName: 'PRUEBA APROBADA',
  expiresMonth: 12,
  expiresYear: 2030,
  cvv: '111',
}
const PHONE = '0991112233'

const TOMORROW = new Intl.DateTimeFormat('sv-SE', { timeZone: BUSINESS_TIME_ZONE }).format(
  new Date(Date.now() + 24 * 60 * 60 * 1000),
)
const at10 = `${TOMORROW}T10:00:00-05:00`

let inside: GeoPoint
let productId: string
let buyerA: Session
let buyerB: Session
let shopOrderId: string
let storeOrderId: string
let guestOrderId: string

async function newCustomer(label: string): Promise<Session> {
  const email = `it-historial-${label}-${uniqueSuffix().toLowerCase()}@regalia.test`
  await customerService.register({ name: `IT Historial ${label}`, email, password: 'Clave12345' })
  return customerService.login({ email, password: 'Clave12345' })
}

describe('Integración real · historial unificado (/shop/orders, #35)', () => {
  beforeAll(async () => {
    await loginAsAdmin()
    inside = (await coveragePoints()).inside
    const category = await createShopCategory('IT Historial')
    productId = (
      await createShopProduct({
        categoryId: category.id,
        name: 'IT Regalo historial',
        description: 'IT',
        priceCents: 100,
        stock: 20,
      })
    ).id
    authStorage.clear()
    buyerA = await newCustomer('a')
    buyerB = await newCustomer('b')

    // Compra de A en la web (tarjeta de demostración).
    customerStorage.save(buyerA)
    const items = [{ productId, quantity: 1 }]
    const delivery = {
      recipient: { name: 'IT Destinataria web', phone: PHONE },
      deliveryAddress: `IT Web ${uniqueSuffix()}`,
      deliveryLocation: inside,
      scheduledDeliveryDate: at10,
    }
    const quote = await checkoutService.quote(items, delivery)
    const paid = await checkoutService.pay(crypto.randomUUID(), {
      items,
      delivery,
      quoteToken: quote.quoteToken,
      paymentCard: APPROVED,
    })
    shopOrderId = paid.order.id

    // La tienda registra una venta a nombre de A (cliente con cuenta) y otra de invitado con el
    // mismo teléfono de A, que no debe vincularse a su cuenta.
    await loginAsAdmin()
    const sale = {
      payment: { method: 'CASH' as const },
      deliveryAddress: `IT Tienda ${uniqueSuffix()}`,
      items,
      scheduledDeliveryDate: at10,
      deliveryLat: inside.lat,
      deliveryLng: inside.lng,
    }
    storeOrderId = (
      await ordersService.createPurchase(
        {
          ...sale,
          buyer: { type: 'REGISTERED_CLIENT', clientId: buyerA.user.id, contactPhone: PHONE },
        },
        crypto.randomUUID(),
      )
    ).id
    guestOrderId = (
      await ordersService.createPurchase(
        { ...sale, buyer: { type: 'GUEST', name: 'IT Invitado', contactPhone: PHONE } },
        crypto.randomUUID(),
      )
    ).id
    authStorage.clear()
  }, 120_000)

  afterAll(() => {
    authStorage.clear()
    customerStorage.clear()
  })

  it('A ve en una sola lista su compra de la web y la registrada en tienda, con su origen', async () => {
    customerStorage.save(buyerA)

    const page = await customerOrdersService.list(1, 50)
    const mine = page.items.filter((order) => [shopOrderId, storeOrderId].includes(order.id))

    expect(mine).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: shopOrderId, source: 'SHOP', receiptAvailable: true }),
        expect.objectContaining({ id: storeOrderId, source: 'ADMIN', receiptAvailable: true }),
      ]),
    )
    // La venta de invitado con el mismo teléfono no se vincula a la cuenta de A.
    expect(page.items.map((order) => order.id)).not.toContain(guestOrderId)
    // Orden estable del servidor: la más reciente (la de tienda) primero.
    const ids = page.items.map((order) => order.id)
    expect(ids.indexOf(storeOrderId)).toBeLessThan(ids.indexOf(shopOrderId))
  })

  it('el detalle y el comprobante de la compra en tienda muestran el pago declarado, no una tarjeta', async () => {
    customerStorage.save(buyerA)

    const detail = await customerOrdersService.detail(storeOrderId)
    const receipt = await customerOrdersService.receipt(storeOrderId)

    expect(detail).toEqual(expect.objectContaining({ source: 'ADMIN', receiptAvailable: true }))
    expect(receipt.payment).toEqual(
      expect.objectContaining({
        kind: 'ADMIN_DECLARED_EXTERNAL',
        status: 'DECLARED',
        method: 'CASH',
      }),
    )
    expect(JSON.stringify(receipt)).not.toMatch(/cardLast4/)
  })

  it('B no ve ninguna de las compras de A ni puede abrirlas', async () => {
    customerStorage.save(buyerB)

    const page = await customerOrdersService.list(1, 50)

    expect(page.items.map((order) => order.id)).not.toContain(shopOrderId)
    expect(page.items.map((order) => order.id)).not.toContain(storeOrderId)
    await expect(customerOrdersService.detail(storeOrderId)).rejects.toThrow(
      ORDER_NOT_FOUND_MESSAGE,
    )
    await expect(customerOrdersService.receipt(shopOrderId)).rejects.toThrow(
      ORDER_NOT_FOUND_MESSAGE,
    )
  })
})
