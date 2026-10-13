import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ordersService } from '../features/orders/ordersService'
import { driversService } from '../features/planning/driversService'
import { planningService } from '../features/planning/planningService'
import type { RouteProposalsResponse } from '../features/planning/types'
import { productsService } from '../features/products/productsService'
import { zonesService } from '../features/zones/zonesService'
import { authStorage } from '../lib/auth/authStorage'
import { apiClient } from '../lib/http/apiClient'
import { dayInGuayaquil } from '../lib/time/guayaquil'
import type { GeoPoint } from '../types/geo'
import { expectHttpError } from './support/assertions'
import { credentialsFor } from './support/env'
import { loginAsAdmin, uniqueSuffix } from './support/session'

/**
 * Día propio de cada ejecución: un miércoles al azar entre 2050 y 2079. Las rutas confirmadas
 * quedan guardadas, así que reutilizar un día dejaría sus pedidos reservados para la siguiente vez.
 * Estas pruebas nunca asignan choferes: una asignación real los deja ocupados hasta recrear la base.
 */
const FIRST_WEDNESDAY = Date.UTC(2050, 0, 5)
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const DAY = new Date(FIRST_WEDNESDAY + Math.floor(Math.random() * 1500) * WEEK_MS)
  .toISOString()
  .slice(0, 10)

/** Con capacidad 4 por ruta, 5 pedidos cercanos al depósito dan 2 rutas (4 + 1). */
const ORDERS_IN_DAY = 5

let zoneId: string
let depot: GeoPoint
let orderIds: string[]

const previewDay = (): Promise<RouteProposalsResponse> =>
  planningService.getProposals({ date: DAY, zoneId })

const loginAsClient = async (): Promise<void> => {
  const { data } = await apiClient.post<{
    access_token: string
    user: { id: string; name: string; email: string; role: 'CLIENT' }
  }>('/auth/login', credentialsFor('CLIENT'))
  authStorage.save({ token: data.access_token, user: data.user })
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

    const product = await productsService.create({
      name: `IT Producto planificación ${uniqueSuffix()}`,
      price: 10,
      stock: ORDERS_IN_DAY,
    })
    orderIds = []
    for (let k = 1; k <= ORDERS_IN_DAY; k += 1) {
      const order = await ordersService.createAsAdmin({
        recipient: { type: 'GUEST', name: `IT Plan ${k}`, contactPhone: '0990000000' },
        zoneId,
        deliveryAddress: `IT Parada ${k} ${uniqueSuffix()}`,
        items: [{ productId: product.id, quantity: 1 }],
        scheduledDeliveryDate: `${DAY}T10:00:00-05:00`,
        deliveryLat: depot.lat + 0.0012 * k,
        deliveryLng: depot.lng + 0.0009 * ((k % 3) + 1),
      })
      orderIds.push(order.id)
    }
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
      expect(proposal.depot).toEqual(depot)
      expect(proposal.stops.map((stop) => stop.sequence)).toEqual(
        proposal.stops.map((_, index) => index + 1),
      )
      expect(proposal.totalDistanceKm).toBeLessThanOrEqual(proposal.baselineKm)
      expect(dayInGuayaquil(new Date(proposal.routeDate))).toBe(DAY)
    }
    expect(result.summary.plannedKm).toBeLessThanOrEqual(result.summary.baselineKm)
  })

  it('previsualizar dos veces no guarda nada: da el mismo resultado y no crea rutas', async () => {
    const routesBefore = (await planningService.listRoutes()).length

    const first = await previewDay()
    const second = await previewDay()

    expect(second.proposals).toEqual(first.proposals)
    expect(await planningService.listRoutes()).toHaveLength(routesBefore)
  })

  it('confirmar guarda un DRAFT sin chofer, sus pedidos quedan reservados y no se puede repetir', async () => {
    const [proposal] = (await previewDay()).proposals
    const input = {
      zoneId: proposal.zoneId,
      routeDate: proposal.routeDate,
      orderIds: proposal.orderIds,
    }

    const saved = await planningService.confirmRoute(input)

    expect(saved).toEqual(expect.objectContaining({ status: 'DRAFT', driverId: null, zoneId }))
    const listed = (await planningService.listRoutes()).find((route) => route.id === saved.id)
    expect(listed).toEqual(expect.objectContaining({ status: 'DRAFT', driverName: null }))
    expect(listed?.orders.map((order) => order.id).sort()).toEqual([...proposal.orderIds].sort())

    const after = await previewDay()
    expect(after.excluded.map((order) => order.orderId).sort()).toEqual(
      [...proposal.orderIds].sort(),
    )
    expect(after.excluded.every((order) => order.reasons.includes('ACTIVE_ROUTE_CLAIM'))).toBe(true)

    await expectHttpError(planningService.confirmRoute(input), 409)
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
    })
  })

  it('un CLIENT no puede ver propuestas ni confirmar rutas (403)', async () => {
    await loginAsClient()

    await expectHttpError(previewDay(), 403)
    await expectHttpError(
      planningService.confirmRoute({ zoneId, routeDate: `${DAY}T15:00:00Z`, orderIds }),
      403,
    )
  })
})
