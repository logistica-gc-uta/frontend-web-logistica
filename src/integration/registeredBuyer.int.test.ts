import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { adminClientsService } from '../features/orders/adminClientsService'
import { ordersService } from '../features/orders/ordersService'
import { describePurchaseError } from '../features/orders/purchaseErrors'
import { customerService } from '../features/shop/account/customerService'
import { customerStorage } from '../features/shop/account/customerStorage'
import { customerOrdersService } from '../features/shop/orders/customerOrdersService'
import { authStorage } from '../lib/auth/authStorage'
import { BUSINESS_TIME_ZONE } from '../lib/time/guayaquil'
import type { Session } from '../types/auth'
import type { GeoPoint } from '../types/geo'
import { expectHttpError } from './support/assertions'
import { coveragePoints } from './support/purchases'
import { loginAsAdmin, loginAsClient, uniqueSuffix } from './support/session'
import { createShopCategory, createShopProduct } from './support/shopCatalog'

/**
 * #34 · Venta ADMIN a un cliente con cuenta contra la API real: el ADMIN lo busca con
 * `GET /admin/clients` (backend #64) y registra la venta con su `clientId`. Cada ejecución crea su
 * propio cliente con un nombre único, así que la búsqueda no depende de otros datos.
 */
const PHONE = '0993334455'
const TOMORROW = new Intl.DateTimeFormat('sv-SE', { timeZone: BUSINESS_TIME_ZONE }).format(
  new Date(Date.now() + 24 * 60 * 60 * 1000),
)

let inside: GeoPoint
let productId: string
let buyer: Session
let label: string

const sale = () => ({
  payment: { method: 'TRANSFER' as const },
  deliveryAddress: `IT Cuenta ${uniqueSuffix()}`,
  items: [{ productId, quantity: 1 }],
  scheduledDeliveryDate: `${TOMORROW}T11:00:00-05:00`,
  deliveryLat: inside.lat,
  deliveryLng: inside.lng,
})

describe('Integración real · venta ADMIN a cliente con cuenta (/admin/clients, #34)', () => {
  beforeAll(async () => {
    await loginAsAdmin()
    inside = (await coveragePoints()).inside
    const category = await createShopCategory('IT Cuenta')
    productId = (
      await createShopProduct({
        categoryId: category.id,
        name: 'IT Regalo cuenta',
        description: 'IT',
        priceCents: 250,
        stock: 10,
      })
    ).id

    label = `IT Comprador ${uniqueSuffix()}`
    const email = `it-cuenta-${uniqueSuffix().toLowerCase()}@regalia.test`
    authStorage.clear()
    await customerService.register({ name: label, email, password: 'Clave12345' })
    buyer = await customerService.login({ email, password: 'Clave12345' })
  }, 120_000)

  beforeEach(loginAsAdmin)

  afterAll(() => {
    authStorage.clear()
    customerStorage.clear()
  })

  it('el buscador encuentra la cuenta por nombre o correo y solo expone id, nombre y correo', async () => {
    const byName = await adminClientsService.search(label.toLowerCase())
    const byEmail = await adminClientsService.search(buyer.user.email.toUpperCase())

    expect(byName.items).toEqual([{ id: buyer.user.id, name: label, email: buyer.user.email }])
    expect(byName.total).toBe(1)
    expect(byEmail.items.map((client) => client.id)).toEqual([buyer.user.id])
    // Nunca devuelve ADMIN ni DRIVER, aunque coincidan con el texto.
    const admins = await adminClientsService.search('admin@delivery')
    expect(admins.items).toEqual([])
  })

  it('pagina de 20 en 20', async () => {
    const page = await adminClientsService.search('', 1)

    expect(page.pageSize).toBe(20)
    expect(page.items.length).toBeLessThanOrEqual(20)
    expect(page.total).toBeGreaterThanOrEqual(1)
  })

  it('registra la venta con la cuenta elegida y queda en su historial con su nombre y correo', async () => {
    const [client] = (await adminClientsService.search(label)).items

    const result = await ordersService.createPurchase(
      { ...sale(), buyer: { type: 'REGISTERED_CLIENT', clientId: client.id, contactPhone: PHONE } },
      crypto.randomUUID(),
    )

    const receipt = await ordersService.receipt(result.id)
    expect(receipt.buyer).toEqual(
      expect.objectContaining({ name: label, email: buyer.user.email, phone: PHONE }),
    )
    // Sin destinatario aparte, recibe el mismo comprador con el teléfono de esta venta.
    expect(receipt.recipient).toEqual({ name: label, phone: PHONE })

    authStorage.clear()
    customerStorage.save(buyer)
    const history = await customerOrdersService.list(1, 50)
    expect(history.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: result.id, source: 'ADMIN' })]),
    )
    customerStorage.clear()
  })

  it('con regalo para otra persona la cuenta del comprador y el destinatario quedan separados', async () => {
    const result = await ordersService.createPurchase(
      {
        ...sale(),
        buyer: { type: 'REGISTERED_CLIENT', clientId: buyer.user.id, contactPhone: PHONE },
        giftRecipient: { name: 'IT Destinatario', contactPhone: '0995556677' },
      },
      crypto.randomUUID(),
    )

    const receipt = await ordersService.receipt(result.id)
    expect(receipt.buyer).toEqual(expect.objectContaining({ name: label, phone: PHONE }))
    expect(receipt.recipient).toEqual({ name: 'IT Destinatario', phone: '0995556677' })
  })

  it('una cuenta que no existe se rechaza con un mensaje claro y sin registrar nada', async () => {
    const error = await ordersService
      .createPurchase(
        {
          ...sale(),
          buyer: {
            type: 'REGISTERED_CLIENT',
            clientId: crypto.randomUUID(),
            contactPhone: PHONE,
          },
        },
        crypto.randomUUID(),
      )
      .catch((reason: unknown) => reason)

    expect(describePurchaseError(error)).toEqual({
      action: 'fix',
      message: 'No se registró la venta: la cuenta del cliente ya no existe. Búscala de nuevo.',
    })
  })

  it('un CLIENT no puede buscar clientes (403)', async () => {
    await loginAsClient()

    await expectHttpError(adminClientsService.search('an'), 403)
  })
})
