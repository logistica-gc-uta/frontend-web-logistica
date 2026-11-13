import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ordersService } from '../features/orders/ordersService'
import { driversService } from '../features/planning/driversService'
import { dispatchService } from '../features/dispatch/dispatchService'
import { planningService } from '../features/planning/planningService'
import type { RouteProposalsResponse } from '../features/planning/types'
import { productsService } from '../features/products/productsService'
import { shopService } from '../features/shop/shopService'
import { zonesService } from '../features/zones/zonesService'
import { BUSINESS_TIME_ZONE, dayInGuayaquil, todayInGuayaquil } from '../lib/time/guayaquil'
import type { GeoPoint } from '../types/geo'
import { expectHttpError } from './support/assertions'
import { loginAsAdmin, loginAsClient, uniqueSuffix } from './support/session'

/**
 * La vista previa usa un día propio: un miércoles al azar entre 2050 y 2079 (solo lectura, nada se
 * guarda). Desde backend #49 las rutas solo se confirman el día de entrega, así que confirmar y
 * corregir se prueban HOY con pedidos propios de la ejecución, y sus borradores se liberan al final.
 * Estas pruebas nunca asignan choferes: una asignación real los deja ocupados hasta recrear la base.
 */
const FIRST_WEDNESDAY = Date.UTC(2050, 0, 5)
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const DAY = new Date(FIRST_WEDNESDAY + Math.floor(Math.random() * 1500) * WEEK_MS)
  .toISOString()
  .slice(0, 10)

/** Con capacidad 4 por ruta, 5 pedidos cercanos a la misma hora dan 2 rutas (4 + 1). */
const ORDERS_IN_DAY = 5

const hourFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const TODAY = todayInGuayaquil()
const LATER_TODAY = hourFormatter.format(new Date(Date.now() + 30 * 60_000))
const { deliverySchedule: HOURS } = await shopService.settings()
const HAS_TIME_LEFT_TODAY =
  LATER_TODAY > hourFormatter.format(new Date()) &&
  LATER_TODAY >= HOURS.startTime &&
  LATER_TODAY <= HOURS.endTime

let zoneId: string
/** Punto de salida esperado: la tienda si está configurada (#48), si no el depósito de la zona. */
let origin: GeoPoint
let depot: GeoPoint
let productId: string
let orderIds: string[]

const previewDay = (): Promise<RouteProposalsResponse> =>
  planningService.getProposals({ date: DAY, zoneId })

const createOrders = async (day: string, time: string, label: string) => {
  const ids: string[] = []
  for (let k = 1; k <= ORDERS_IN_DAY; k += 1) {
    const order = await ordersService.createPurchase(
      {
        buyer: { type: 'GUEST', name: `IT ${label} ${k}`, contactPhone: '0990000000' },
        zoneId,
        deliveryAddress: `IT ${label} ${k} ${uniqueSuffix()}`,
        items: [{ productId, quantity: 1 }],
        scheduledDeliveryDate: `${day}T${time}:00-05:00`,
        deliveryLat: depot.lat + 0.0012 * k,
        deliveryLng: depot.lng + 0.0009 * ((k % 3) + 1),
        payment: { method: 'CASH' },
      },
      crypto.randomUUID(),
    )
    ids.push(order.id)
  }
  return ids
}

describe(`Integración real · planificación (/route-proposals, /routes) · día ${DAY}`, () => {
  beforeAll(async () => {
    await loginAsAdmin()
    const zones = await zonesService.list()
    const zone = zones.find((candidate) => candidate.depotLocation !== null)
    if (!zone?.depotLocation) {
      throw new Error('Ninguna zona tiene depósito: ejecuta `pnpm run seed` en el backend.')
    }
    zoneId = zone.id
    depot = zone.depotLocation
    const coverage = await shopService.storeCoverage()
    origin = coverage.configured ? coverage.location : depot

    productId = (
      await productsService.create({
        name: `IT Producto planificación ${uniqueSuffix()}`,
        price: 10,
        stock: ORDERS_IN_DAY * 2,
      })
    ).id
    orderIds = await createOrders(DAY, '10:00', 'Plan')
  })

  beforeEach(loginAsAdmin)

  it('propone rutas para todos los pedidos del día, con métricas coherentes', async () => {
    const result = await previewDay()

    expect(result.summary).toEqual(
      expect.objectContaining({ candidateOrders: ORDERS_IN_DAY, plannedOrders: ORDERS_IN_DAY }),
    )
    expect(result.excluded).toEqual([])
    expect(result.proposals.map((proposal) => proposal.stops.length).sort()).toEqual([1, 4])
    expect(result.proposals.flatMap((proposal) => proposal.orderIds).sort()).toEqual(
      [...orderIds].sort(),
    )
    for (const proposal of result.proposals) {
      expect(proposal.depot).toEqual(origin)
      expect(proposal.stops.map((stop) => stop.sequence)).toEqual(
        proposal.stops.map((_, index) => index + 1),
      )
      expect(proposal.totalDistanceKm).toBeLessThanOrEqual(proposal.baselineKm)
      expect(dayInGuayaquil(new Date(proposal.routeDate))).toBe(DAY)
    }
    expect(result.summary.plannedKm).toBeLessThanOrEqual(result.summary.baselineKm)
    // Otro día: solo vista previa (#49).
    expect(result).toEqual(expect.objectContaining({ isToday: false, canConfirm: false }))
  })

  it('previsualizar dos veces no guarda nada: da el mismo resultado y no crea rutas', async () => {
    const routesBefore = (await planningService.listRoutes()).length

    const first = await previewDay()
    const second = await previewDay()

    expect(second.proposals).toEqual(first.proposals)
    expect(await planningService.listRoutes()).toHaveLength(routesBefore)
  })

  describe.skipIf(!HAS_TIME_LEFT_TODAY)(`hoy (${TODAY}): confirmar y corregir`, () => {
    let todayIds: string[]
    const drafts: string[] = []

    beforeAll(async () => {
      await loginAsAdmin()
      todayIds = await createOrders(TODAY, LATER_TODAY, 'Hoy')
    })

    // Los borradores propios se liberan: no quedan pedidos de hoy reservados para otras pruebas.
    afterAll(async () => {
      await loginAsAdmin()
      for (const routeId of drafts) {
        await dispatchService.releaseDraft(routeId, 'IT: limpieza de la prueba').catch(() => {})
      }
    })

    const draftsOfRun = async () =>
      (await planningService.listRoutes())
        .filter((route) => drafts.includes(route.id))
        .sort((a, b) => b.orders.length - a.orders.length)

    it('confirmar guarda un DRAFT sin chofer, sus pedidos quedan reservados y no se puede repetir', async () => {
      const input = {
        zoneId,
        routeDate: `${TODAY}T${LATER_TODAY}:00-05:00`,
        orderIds: todayIds.slice(0, 4),
      }

      const saved = await planningService.confirmRoute(input)
      drafts.push(saved.id)

      expect(saved).toEqual(expect.objectContaining({ status: 'DRAFT', driverId: null, zoneId }))
      const listed = (await planningService.listRoutes()).find((route) => route.id === saved.id)
      expect(listed).toEqual(expect.objectContaining({ status: 'DRAFT', driverName: null }))
      expect(listed?.orders.map((order) => order.id).sort()).toEqual([...input.orderIds].sort())

      const after = await planningService.getProposals({ date: TODAY, zoneId })
      const mine = after.excluded.filter((order) => input.orderIds.includes(order.orderId))
      expect(mine.map((order) => order.orderId).sort()).toEqual([...input.orderIds].sort())
      expect(mine.every((order) => order.reasons.includes('ACTIVE_ROUTE_CLAIM'))).toBe(true)

      await expectHttpError(planningService.confirmRoute(input), 409)
    })

    it('corrige rutas DRAFT con auditoría: reordena paradas y mueve un pedido a otra ruta del día', async () => {
      const small = await planningService.confirmRoute({
        zoneId,
        routeDate: `${TODAY}T${LATER_TODAY}:00-05:00`,
        orderIds: [todayIds[4]],
      })
      drafts.push(small.id)
      const [large, single] = await draftsOfRun()
      expect([large.orders.length, single.orders.length]).toEqual([4, 1])

      const reversed = large.orders.map((order) => order.id).reverse()
      const reorder = await dispatchService.reorderStops({
        routeId: large.id,
        orderIds: reversed,
        reason: 'IT: calle cerrada',
      })
      expect(reorder).toEqual(expect.objectContaining({ action: 'REORDER', outcome: 'APPLIED' }))
      const [afterReorder] = await draftsOfRun()
      expect(afterReorder.orders.map((order) => order.id)).toEqual(reversed)

      // Si las paradas enviadas no son exactamente las de la ruta, no se aplica nada.
      await expectHttpError(
        dispatchService.reorderStops({
          routeId: large.id,
          orderIds: reversed.slice(1),
          reason: 'IT: incompleto',
        }),
        409,
      )

      const moved = reversed[0]
      await dispatchService.moveOrder({
        routeId: large.id,
        orderId: moved,
        targetRouteId: single.id,
        reason: 'IT: equilibrar carga',
      })
      const [source, target] = await draftsOfRun()
      expect(source.orders.map((order) => order.id)).toEqual(reversed.slice(1))
      expect(target.id).toBe(single.id)
      expect(target.orders.map((order) => order.id)).toEqual([single.orders[0].id, moved])
    })
  })

  it('las rutas y los choferes no exponen el hash de contraseña dentro de la aplicación', async () => {
    const routes = JSON.stringify(await planningService.listRoutes())
    const drivers = await driversService.list()

    expect(routes).not.toContain('password')
    expect(JSON.stringify(drivers)).not.toContain('password')
    expect(drivers[0]).toEqual({
      id: expect.any(String),
      name: expect.any(String),
      vehicle: expect.any(String),
      isAvailable: expect.any(Boolean),
      unavailableReason: drivers[0].isAvailable
        ? null
        : expect.stringMatching(/ROUTE_HOLD|MARKED_UNAVAILABLE/),
    })
  })

  it('un CLIENT no puede ver propuestas, confirmar ni corregir rutas (403)', async () => {
    await loginAsClient()

    await expectHttpError(previewDay(), 403)
    await expectHttpError(
      planningService.confirmRoute({ zoneId, routeDate: `${DAY}T15:00:00Z`, orderIds }),
      403,
    )
    await expectHttpError(
      dispatchService.reorderStops({ routeId: crypto.randomUUID(), orderIds, reason: 'IT' }),
      403,
    )
  })
})
