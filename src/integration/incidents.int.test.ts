import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { dispatchService } from '../features/dispatch/dispatchService'
import { driversService } from '../features/planning/driversService'
import { monitorService } from '../features/monitor/monitorService'
import { ordersService } from '../features/orders/ordersService'
import { planningService } from '../features/planning/planningService'
import { productsService } from '../features/products/productsService'
import { shopService } from '../features/shop/shopService'
import type { Zone } from '../features/zones/types'
import { apiClient } from '../lib/http/apiClient'
import { BUSINESS_TIME_ZONE, todayInGuayaquil } from '../lib/time/guayaquil'
import type { GeoPoint } from '../types/geo'
import { expectHttpError } from './support/assertions'
import { driverApi } from './support/driver'
import { credentialsFor } from './support/env'
import { loginAsAdmin, loginAsClient, uniqueSuffix } from './support/session'

/**
 * Ciclo completo de una entrega fallida contra la API real, con datos propios de la ejecución:
 * R1 (visita fallida) → contacto → reprogramación acordada para más tarde hoy → R2 (entregada).
 * Usa al chofer del seed y siempre termina con su regreso al depósito, así queda disponible.
 * Necesita varias horas libres en el día de Guayaquil; si no, se omite en lugar de fallar.
 */
const DEPOT: GeoPoint = { lat: -1.2539, lng: -78.6211 }

const hourFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const guayaquilTimeIn = (minutes: number) =>
  hourFormatter.format(new Date(Date.now() + minutes * 60_000))

const TODAY = todayInGuayaquil()
const FIRST_VISIT = guayaquilTimeIn(30)
const AGREED_FROM = guayaquilTimeIn(120)
const AGREED_TO = guayaquilTimeIn(180)
// Las tres horas deben caer hoy y en orden (cerca de la medianoche no se puede).
// Desde backend #42 el ADMIN también respeta el horario de reparto de la tienda: fuera de él, se omite.
const { deliverySchedule: HOURS } = await shopService.settings()
const withinHours = (time: string) => time >= HOURS.startTime && time <= HOURS.endTime
const HAS_TIME_TODAY =
  guayaquilTimeIn(0) < FIRST_VISIT &&
  FIRST_VISIT < AGREED_FROM &&
  AGREED_FROM < AGREED_TO &&
  withinHours(FIRST_VISIT) &&
  withinHours(AGREED_TO)

const at = (time: string) => `${TODAY}T${time}:00-05:00`

let zone: Zone
let productId: string
let deliveredId: string
let failedId: string
let r1: string
let r2: string | undefined
let driverId: string
let driver: Awaited<ReturnType<typeof driverApi>>
/** Rutas que el chofer debe cerrar al final para quedar disponible. */
const openRoutes = new Set<string>()

const createTodayOrder = async (k: number) =>
  (
    await ordersService.createPurchase(
      {
        buyer: { type: 'GUEST', name: `IT Fallida ${k}`, contactPhone: '0990000000' },
        zoneId: zone.id,
        deliveryAddress: `IT Fallida ${k} ${uniqueSuffix()}`,
        items: [{ productId, quantity: 1 }],
        scheduledDeliveryDate: at(FIRST_VISIT),
        deliveryLat: DEPOT.lat + 0.001 * k,
        deliveryLng: DEPOT.lng + 0.001 * k,
        payment: { method: 'CASH' },
      },
      crypto.randomUUID(),
    )
  ).id

/** Confirma como DRAFT la propuesta de hoy que contiene `orderId` y se la asigna al chofer. */
async function planAndAssign(orderId: string): Promise<string> {
  const { proposals } = await planningService.getProposals({ date: TODAY, zoneId: zone.id })
  const proposal = proposals.find((candidate) => candidate.orderIds.includes(orderId))
  if (!proposal) throw new Error('No hay propuesta para el pedido de prueba')
  const route = await planningService.confirmRoute({
    zoneId: zone.id,
    routeDate: proposal.routeDate,
    orderIds: proposal.orderIds,
  })
  await planningService.assignDriver(route.id, driverId)
  openRoutes.add(route.id)
  return route.id
}

const stopOf = async (routeId: string, orderId: string) =>
  (await monitorService.listRoutes())
    .find((route) => route.id === routeId)
    ?.stops.find((stop) => stop.orderId === orderId)

const failedDeliveryOf = async (orderId: string) =>
  (await dispatchService.inbox()).failedDeliveries.find((failed) => failed.orderId === orderId)

describe.skipIf(!HAS_TIME_TODAY)(`Integración real · entregas fallidas · hoy ${TODAY}`, () => {
  beforeAll(async () => {
    await loginAsAdmin()
    const suffix = uniqueSuffix()
    zone = (
      await apiClient.post<Zone>('/zones', {
        name: `IT Fallidas ${suffix}`,
        code: `ITF-${suffix}`,
        depotLat: DEPOT.lat,
        depotLng: DEPOT.lng,
      })
    ).data
    productId = (
      await productsService.create({ name: `IT Producto fallidas ${suffix}`, price: 4, stock: 10 })
    ).id
    const seedDriver = (
      await apiClient.get<{ id: string; user: { email: string } }[]>('/drivers')
    ).data.find(({ user }) => user.email === credentialsFor('DRIVER').email)
    if (!seedDriver) throw new Error('No se encontró al chofer del seed')
    driverId = seedDriver.id
    const available = (await driversService.list()).find(({ id }) => id === driverId)
    if (!available?.isAvailable) {
      throw new Error(
        'El chofer del seed no está disponible: confirma su regreso o recrea la base.',
      )
    }
    driver = await driverApi()

    // R1: una entrega exitosa y una visita fallida; el chofer termina y regresa.
    deliveredId = await createTodayOrder(1)
    failedId = await createTodayOrder(2)
    r1 = await planAndAssign(failedId)
    await driver.start(r1)
    await driver.deliver(deliveredId)
    await driver.fail(r1, (await stopOf(r1, failedId))!.id)
    await driver.complete(r1)
    await driver.returnToDepot(r1)
    openRoutes.delete(r1)
  })

  afterAll(async () => {
    // Pase lo que pase, el chofer cierra lo que quedó abierto para no quedar retenido.
    for (const routeId of openRoutes) {
      await driver?.complete(routeId).catch(() => undefined)
      await driver?.returnToDepot(routeId).catch(() => undefined)
    }
  })

  beforeEach(loginAsAdmin)

  it('el intento fallido aparece en la bandeja con su motivo; el pedido no queda entregado ni cancelado', async () => {
    const failed = await failedDeliveryOf(failedId)

    expect(failed?.attempts[0]).toEqual(
      expect.objectContaining({ failureReason: 'RECIPIENT_ABSENT', stopId: expect.any(String) }),
    )
    expect(JSON.stringify(failed)).not.toContain('nadie atendió')
    expect(['DELIVERED', 'CANCELLED']).not.toContain((await ordersService.get(failedId)).status)
    expect((await stopOf(r1, failedId))?.outcome).toBe('FAILED')
    expect(await failedDeliveryOf(deliveredId)).toBeUndefined()
  })

  it('sin un acuerdo de fecha no se puede reprogramar; una fecha pasada se rechaza', async () => {
    const attemptId = (await failedDeliveryOf(failedId))!.attempts[0].id

    const withoutAgreement = await dispatchService.recordContact({
      orderId: failedId,
      attemptId,
      agreement: null,
      reason: 'IT: no contestó',
    })
    expect(withoutAgreement.outcome).toBe('APPLIED')
    await expectHttpError(
      dispatchService.rescheduleWithAgreement(failedId, withoutAgreement.id, 'IT: sin acuerdo'),
      409,
    )
    await expectHttpError(
      dispatchService.recordContact({
        orderId: failedId,
        attemptId,
        reason: 'IT: fecha pasada',
        agreement: {
          scheduledDeliveryDate: '2001-01-01T09:00:00-05:00',
          deliveryWindowStart: '2001-01-01T09:00:00-05:00',
          deliveryWindowEnd: '2001-01-01T10:00:00-05:00',
        },
      }),
      400,
    )
    expect(await failedDeliveryOf(failedId)).toBeDefined()
  })

  it('un CLIENT no puede gestionar la entrega fallida y un DRIVER no ve la bandeja (403)', async () => {
    const attemptId = (await failedDeliveryOf(failedId))!.attempts[0].id
    await loginAsClient()

    await expectHttpError(
      dispatchService.recordContact({
        orderId: failedId,
        attemptId,
        agreement: null,
        reason: 'IT',
      }),
      403,
    )
    await expect(driver.inbox()).rejects.toMatchObject({ response: { status: 403 } })
  })

  it('con fecha acordada se reprograma y, tras entregarse en R2, conserva la visita fallida de R1', async () => {
    const attemptId = (await failedDeliveryOf(failedId))!.attempts[0].id
    const agreement = {
      scheduledDeliveryDate: at(AGREED_FROM),
      deliveryWindowStart: at(AGREED_FROM),
      deliveryWindowEnd: at(AGREED_TO),
    }

    const contact = await dispatchService.recordContact({
      orderId: failedId,
      attemptId,
      agreement,
      reason: 'IT: acordó más tarde',
    })
    const rescheduled = await dispatchService.rescheduleWithAgreement(
      failedId,
      contact.id,
      'IT: acordó más tarde',
    )

    expect(rescheduled).toEqual(
      expect.objectContaining({ action: 'RESCHEDULE', outcome: 'APPLIED' }),
    )
    expect(await failedDeliveryOf(failedId)).toBeUndefined()
    const order = await ordersService.get(failedId)
    expect(order.status).toBe('PENDING')
    expect(Date.parse(order.scheduledDeliveryDate ?? '')).toBe(
      Date.parse(agreement.scheduledDeliveryDate),
    )
    // El mismo acuerdo no se puede usar dos veces.
    await expectHttpError(
      dispatchService.rescheduleWithAgreement(failedId, contact.id, 'IT: repetido'),
      409,
    )

    // R2: segunda salida con el mismo pedido, esta vez entregado.
    r2 = await planAndAssign(failedId)
    await driver.start(r2)
    await driver.deliver(failedId)
    await driver.complete(r2)
    await driver.returnToDepot(r2)
    openRoutes.delete(r2)

    expect((await stopOf(r1, failedId))?.outcome).toBe('FAILED')
    expect((await stopOf(r2, failedId))?.outcome).toBe('SUCCESSFUL')
    expect((await ordersService.get(failedId)).status).toBe('DELIVERED')
    const drivers = await driversService.list()
    expect(drivers.find(({ id }) => id === driverId)?.isAvailable).toBe(true)
  })
})
