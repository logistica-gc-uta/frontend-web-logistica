import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ordersService } from '../features/orders/ordersService'
import type { CreateAdminOrderInput } from '../features/orders/types'
import { productsService } from '../features/products/productsService'
import type { Product } from '../features/products/types'
import { zonesService } from '../features/zones/zonesService'
import { localDateTimeToIso, BUSINESS_TIME_ZONE } from '../lib/time/guayaquil'
import type { GeoPoint } from '../types/geo'
import { expectHttpError } from './support/assertions'
import { loginAsAdmin, loginAsClient, uniqueSuffix } from './support/session'

/** Día lejano y fijo para los pedidos "futuros": no se mezcla con los pedidos de demo. */
const FUTURE_DAY = '2031-03-15'
const FUTURE_LOCAL = `${FUTURE_DAY}T10:00`
const PAST_INSTANT = '2001-01-01T10:00:00-05:00'

const localFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** Fecha y hora de Guayaquil dentro de `minutes` minutos, como las escribiría el operador. */
function guayaquilLocalIn(minutes: number): string {
  return localFormatter.format(new Date(Date.now() + minutes * 60_000)).replace(' ', 'T')
}

const toIso = (local: string): string => localDateTimeToIso(local) ?? ''

let depot: GeoPoint
let zoneId: string
let product: Product

const buildInput = (patch: Partial<CreateAdminOrderInput> = {}): CreateAdminOrderInput => ({
  recipient: {
    type: 'GUEST',
    name: `IT Destinatario ${uniqueSuffix()}`,
    contactPhone: '0990000000',
  },
  zoneId,
  deliveryAddress: `IT Pedido ${uniqueSuffix()}`,
  items: [{ productId: product.id, quantity: 1 }],
  scheduledDeliveryDate: toIso(FUTURE_LOCAL),
  deliveryLat: depot.lat + 0.001,
  deliveryLng: depot.lng + 0.001,
  ...patch,
})

/** El listado de productos solo incluye los que tienen stock; sin stock se considera 0. */
const stockOf = async (productId: string): Promise<number> =>
  (await productsService.list()).find((candidate) => candidate.id === productId)?.stock ?? 0

const stockOfTestProduct = (): Promise<number> => stockOf(product.id)

describe('Integración real · pedidos (/orders)', () => {
  beforeAll(async () => {
    await loginAsAdmin()
    const zones = await zonesService.list()
    const zoneWithDepot = zones.find((zone) => zone.depotLocation !== null)
    if (!zoneWithDepot?.depotLocation) {
      throw new Error('Ninguna zona tiene depósito: ejecuta `pnpm run seed` en el backend.')
    }
    zoneId = zoneWithDepot.id
    depot = zoneWithDepot.depotLocation
    // Producto propio de la ejecución: los pedidos de prueba no consumen el stock del seed.
    product = await productsService.create({
      name: `IT Producto pedidos ${uniqueSuffix()}`,
      price: 10,
      stock: 10,
    })
  })

  beforeEach(loginAsAdmin)

  it('lista los pedidos paginados con el formato que usa la interfaz', async () => {
    const page = await ordersService.list({ page: 1, pageSize: 5 })

    expect(page.page).toBe(1)
    expect(page.pageSize).toBe(5)
    expect(page.items.length).toBeGreaterThan(0)
    expect(page.items.length).toBeLessThanOrEqual(5)
    expect(page.total).toBeGreaterThanOrEqual(page.items.length)
    expect(page.items[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        deliveryAddress: expect.any(String),
        status: expect.any(String),
        total: expect.any(Number),
        zone: expect.objectContaining({ code: expect.any(String) }),
        planningEligibility: expect.objectContaining({ eligible: expect.any(Boolean) }),
        items: expect.any(Array),
      }),
    )
  })

  it('registra un pedido futuro a nombre de un invitado, descuenta el stock y aparece en el listado del día', async () => {
    const stockBefore = await stockOfTestProduct()
    const input = buildInput({ items: [{ productId: product.id, quantity: 2 }] })

    const created = await ordersService.createAsAdmin(input)
    const listed = await ordersService.list({ page: 1, pageSize: 100, date: FUTURE_DAY })

    expect(created).toEqual(
      expect.objectContaining({
        status: 'PENDING',
        recipientType: 'GUEST',
        recipientName: input.recipient.name,
        deliveryAddress: input.deliveryAddress,
        total: 20,
        deliveryLat: input.deliveryLat,
        deliveryLng: input.deliveryLng,
      }),
    )
    expect(Date.parse(created.scheduledDeliveryDate ?? '')).toBe(
      Date.parse(input.scheduledDeliveryDate),
    )
    // La respuesta de creación es un resumen; productos, zona y aptitud llegan en el listado.
    const listedOrder = listed.items.find((order) => order.id === created.id)
    expect(listedOrder?.planningEligibility).toEqual({ eligible: true, reasons: [] })
    expect(listedOrder?.items).toEqual([
      expect.objectContaining({ productId: product.id, quantity: 2, price: 10 }),
    ])
    expect(await stockOfTestProduct()).toBe(stockBefore - 2)
  })

  it('CP-PED-006 · registra un pedido con dos productos distintos: líneas, total y stock de ambos', async () => {
    // Segundo producto propio de la prueba, con otro precio, para distinguir las líneas.
    const second = await productsService.create({
      name: `IT Producto pedidos B ${uniqueSuffix()}`,
      price: 25.5,
      stock: 5,
    })
    const firstStockBefore = await stockOfTestProduct()
    const secondStockBefore = await stockOf(second.id)
    const input = buildInput({
      items: [
        { productId: product.id, quantity: 3 },
        { productId: second.id, quantity: 2 },
      ],
    })

    const created = await ordersService.createAsAdmin(input)
    const listed = await ordersService.list({ page: 1, pageSize: 100, date: FUTURE_DAY })

    // 3 × 10 + 2 × 25,50 = 81
    expect(created).toEqual(
      expect.objectContaining({ status: 'PENDING', recipientType: 'GUEST', total: 81 }),
    )
    const listedOrder = listed.items.find((order) => order.id === created.id)
    expect(listedOrder?.total).toBe(81)
    expect(listedOrder?.items).toHaveLength(2)
    expect(listedOrder?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productId: product.id, quantity: 3, price: 10 }),
        expect.objectContaining({ productId: second.id, quantity: 2, price: 25.5 }),
      ]),
    )
    expect(await stockOfTestProduct()).toBe(firstStockBefore - 3)
    expect(await stockOf(second.id)).toBe(secondStockBefore - 2)
  })

  it('registra un pedido de hoy cuando la hora de entrega todavía no pasó', async () => {
    const local = guayaquilLocalIn(10)
    const day = local.slice(0, 10)

    const created = await ordersService.createAsAdmin(
      buildInput({ scheduledDeliveryDate: toIso(local) }),
    )
    const listed = await ordersService.list({ page: 1, pageSize: 100, date: day })

    expect(created.status).toBe('PENDING')
    expect(listed.items.map((order) => order.id)).toContain(created.id)
  })

  it('rechaza una fecha pasada con 400 y no descuenta stock', async () => {
    const stockBefore = await stockOfTestProduct()

    await expectHttpError(
      ordersService.createAsAdmin(buildInput({ scheduledDeliveryDate: PAST_INSTANT })),
      400,
    )

    expect(await stockOfTestProduct()).toBe(stockBefore)
  })

  it('rechaza el stock insuficiente con 400 y no deja un pedido a medias', async () => {
    const stockBefore = await stockOfTestProduct()

    const message = await expectHttpError(
      ordersService.createAsAdmin(
        buildInput({ items: [{ productId: product.id, quantity: 1000 }] }),
      ),
      400,
    )

    expect(message).toContain('Stock insuficiente')
    expect(await stockOfTestProduct()).toBe(stockBefore)
  })

  it('no acepta un pedido sin coordenadas confirmadas', async () => {
    const { deliveryLat, deliveryLng, ...withoutCoordinates } = buildInput()
    expect([deliveryLat, deliveryLng]).toHaveLength(2)

    await expectHttpError(
      ordersService.createAsAdmin(withoutCoordinates as unknown as CreateAdminOrderInput),
      400,
    )
  })

  it('rechaza una zona sin depósito configurado con 400', async () => {
    const suffix = uniqueSuffix()
    const zoneWithoutDepot = await zonesService.create({
      name: `IT Sin depósito ${suffix}`,
      code: `ITD-${suffix}`,
    })

    await expectHttpError(
      ordersService.createAsAdmin(buildInput({ zoneId: zoneWithoutDepot.id })),
      400,
    )
  })

  it('un CLIENT no puede usar el registro administrativo de pedidos (403)', async () => {
    await loginAsClient()

    await expectHttpError(ordersService.createAsAdmin(buildInput()), 403)
  })
})
