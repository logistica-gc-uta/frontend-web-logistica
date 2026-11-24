import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { dispatchService } from '../features/dispatch/dispatchService'
import { driversAdminService } from '../features/drivers/driversAdminService'
import { describeIncidentError } from '../features/incidents/incidentError'
import { monitorService } from '../features/monitor/monitorService'
import { ordersService } from '../features/orders/ordersService'
import { planningService } from '../features/planning/planningService'
import { productsService } from '../features/products/productsService'
import { customerService } from '../features/shop/account/customerService'
import { customerStorage } from '../features/shop/account/customerStorage'
import { customerOrdersService } from '../features/shop/orders/customerOrdersService'
import { trackingLabel } from '../features/shop/orders/orderStatus'
import { shopService } from '../features/shop/shopService'
import type { Zone } from '../features/zones/types'
import { authStorage } from '../lib/auth/authStorage'
import { apiClient } from '../lib/http/apiClient'
import { BUSINESS_TIME_ZONE, todayInGuayaquil } from '../lib/time/guayaquil'
import type { Session } from '../types/auth'
import type { GeoPoint } from '../types/geo'
import { expectHttpError } from './support/assertions'
import { driverApi } from './support/driver'
import { loginAsAdmin, loginAsClient, uniqueSuffix } from './support/session'

/**
 * #38 · Retiro en tienda contra la API real (backend #50). Con datos propios de la ejecución: una
 * zona, un repartidor creado por la prueba (nunca el del seed) y una clienta con cuenta. El
 * repartidor registra hoy una entrega fallida; luego el ADMIN acuerda el retiro y lo confirma.
 */
const DEPOT: GeoPoint = { lat: -1.2532, lng: -78.6203 }
const hourFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const TODAY = todayInGuayaquil()
const VISIT = hourFormatter.format(new Date(Date.now() + 30 * 60_000))
const { deliverySchedule: HOURS } = await shopService.settings()
const HAS_TIME_TODAY =
  VISIT > hourFormatter.format(new Date()) && VISIT >= HOURS.startTime && VISIT <= HOURS.endTime

let zone: Zone
let client: Session
let failedId: string
let attemptId: string

const asClient = async <T>(read: () => Promise<T>): Promise<T> => {
  authStorage.clear()
  customerStorage.save(client)
  try {
    return await read()
  } finally {
    customerStorage.clear()
    await loginAsAdmin()
  }
}

const incidentOf = async (orderId: string) =>
  (await dispatchService.inbox()).failedDeliveries.find((item) => item.orderId === orderId)

describe.skipIf(!HAS_TIME_TODAY)(`Integración real · retiro en tienda (#38) · hoy ${TODAY}`, () => {
  beforeAll(async () => {
    await loginAsAdmin()
    const suffix = uniqueSuffix()
    zone = (
      await apiClient.post<Zone>('/zones', {
        name: `IT Retiro ${suffix}`,
        code: `ITP-${suffix}`,
        depotLat: DEPOT.lat,
        depotLng: DEPOT.lng,
      })
    ).data
    const productId = (
      await productsService.create({ name: `IT Producto retiro ${suffix}`, price: 5, stock: 5 })
    ).id

    authStorage.clear()
    const email = `it-retiro-${suffix.toLowerCase()}@regalia.test`
    await customerService.register({ name: 'IT Clienta retiro', email, password: 'Clave12345' })
    client = await customerService.login({ email, password: 'Clave12345' })
    await loginAsAdmin()

    const own = await driversAdminService.create({
      name: `IT Repartidor retiro ${suffix}`,
      email: `it.retiro.${suffix.toLowerCase()}@example.com`,
      vehicle: 'Moto de pruebas',
    })
    const driver = await driverApi({ email: own.user.email, password: own.temporaryPassword })

    const sale = (k: number, buyerIsClient: boolean) =>
      ordersService.createPurchase(
        {
          buyer: buyerIsClient
            ? { type: 'REGISTERED_CLIENT', clientId: client.user.id, contactPhone: '0991112233' }
            : { type: 'GUEST', name: `IT Retiro ${k}`, contactPhone: '0990000000' },
          zoneId: zone.id,
          deliveryAddress: `IT Retiro ${k} ${suffix}`,
          items: [{ productId, quantity: 1 }],
          scheduledDeliveryDate: `${TODAY}T${VISIT}:00-05:00`,
          deliveryLat: DEPOT.lat + 0.001 * k,
          deliveryLng: DEPOT.lng + 0.001 * k,
          payment: { method: 'CASH' },
        } as Parameters<typeof ordersService.createPurchase>[0],
        crypto.randomUUID(),
      )
    const deliveredId = (await sale(1, false)).id
    failedId = (await sale(2, true)).id

    const route = await planningService.confirmRoute({
      zoneId: zone.id,
      routeDate: `${TODAY}T${VISIT}:00-05:00`,
      orderIds: [deliveredId, failedId],
    })
    await planningService.assignDriver(route.id, own.id)
    await driver.start(route.id)
    await driver.deliver(deliveredId)
    const stop = (await monitorService.listRoutes())
      .find((item) => item.id === route.id)!
      .stops.find((item) => item.orderId === failedId)!
    await driver.fail(route.id, stop.id)
    await driver.complete(route.id)
    await driver.returnToDepot(route.id)

    attemptId = (await incidentOf(failedId))!.attempts[0].id
  }, 120_000)

  beforeEach(loginAsAdmin)
  afterAll(() => {
    authStorage.clear()
    customerStorage.clear()
  })

  it('tras la entrega fallida el cliente ve «Entrega pendiente de gestión»', async () => {
    expect((await incidentOf(failedId))?.pickup).toBeNull()

    const order = await asClient(async () =>
      (await customerOrdersService.list(1, 50)).items.find((item) => item.id === failedId),
    )
    expect(order).toEqual(expect.objectContaining({ pendingManagement: true, pickup: null }))
    expect(trackingLabel(order!)).toBe('Entrega pendiente de gestión')
  })

  it('si el cliente no acepta retirar solo se registra: sigue pendiente de gestión', async () => {
    const audit = await dispatchService.declinePickup({
      orderId: failedId,
      attemptId,
      reason: 'IT: prefiere entrega',
    })

    expect(audit).toEqual(expect.objectContaining({ action: 'PICKUP_DECLINE', outcome: 'APPLIED' }))
    expect((await incidentOf(failedId))?.pickup).toBeNull()
  })

  it('el acuerdo deja el pedido pendiente de retiro, sin ruta nueva y sin entregarlo', async () => {
    await dispatchService.agreePickup({ orderId: failedId, attemptId, reason: 'IT: lo retira' })

    expect((await incidentOf(failedId))?.pickup).toEqual(
      expect.objectContaining({ state: 'PENDING_PICKUP', pickedUpAt: null }),
    )
    const { proposals } = await planningService.getProposals({ date: TODAY, zoneId: zone.id })
    expect(proposals.some((item) => item.orderIds.includes(failedId))).toBe(false)

    const detail = await asClient(() => customerOrdersService.detail(failedId))
    expect(detail.status).not.toBe('DELIVERED')
    expect(trackingLabel(detail)).toBe('Pendiente de retiro en tienda')
    expect(detail.timeline.map((entry) => entry.code)).toContain('PICKUP_AGREED')

    const again = await dispatchService
      .agreePickup({ orderId: failedId, attemptId, reason: 'IT: otra vez' })
      .catch((reason: unknown) => reason)
    expect(describeIncidentError(again)).toMatch(/ya tiene un retiro/)
  })

  it('un CLIENT no puede acordar ni confirmar retiros (403)', async () => {
    await loginAsClient()

    await expectHttpError(dispatchService.confirmPickup(failedId, 'IT'), 403)
  })

  it('confirmar el retiro físico entrega el pedido y no se puede repetir', async () => {
    await dispatchService.confirmPickup(failedId, 'IT: vino a la tienda')

    expect(await incidentOf(failedId)).toBeUndefined()
    const detail = await asClient(() => customerOrdersService.detail(failedId))
    expect(detail.status).toBe('DELIVERED')
    expect(trackingLabel(detail)).toBe('Entregado: retirado en tienda')
    expect(detail.timeline.map((entry) => entry.code)).toContain('PICKED_UP')

    const again = await dispatchService
      .confirmPickup(failedId, 'IT: otra vez')
      .catch((reason: unknown) => reason)
    expect(again).toBeInstanceOf(Error)
  })
})
