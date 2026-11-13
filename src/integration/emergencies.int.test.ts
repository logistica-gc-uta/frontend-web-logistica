import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { dispatchService } from '../features/dispatch/dispatchService'
import { driversAdminService } from '../features/drivers/driversAdminService'
import { describeEmergencyError } from '../features/emergencies/emergencyErrors'
import { describeLossError } from '../features/losses/lossErrors'
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
import { loginAsAdmin, loginAsClient, uniqueSuffix } from './support/session'

/**
 * #39 parte 2 · Emergencia en ruta contra la API real (backend #51). Datos propios: una zona, un
 * producto, un repartidor creado por la prueba (nunca el del seed) y tres pedidos de hoy. El
 * repartidor inicia la ruta y entrega uno; después el ADMIN declara la emergencia.
 */
const DEPOT: GeoPoint = { lat: -1.2547, lng: -78.6219 }
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

let routeId: string
let deliveredId: string
let orderA: string
let orderB: string
let itemB: string
let emergencyId: string

const codeOf = async (promise: Promise<unknown>) =>
  (
    (await promise.then(
      () => null,
      (reason: unknown) => reason,
    )) as { response?: { data?: { code?: string } } } | null
  )?.response?.data?.code

const unitOf = async (orderId: string) =>
  (await dispatchService.routeEmergency(routeId)).units.find((unit) => unit.orderId === orderId)!

describe.skipIf(!HAS_TIME_TODAY)(
  `Integración real · emergencia en ruta (#39) · hoy ${TODAY}`,
  () => {
    beforeAll(async () => {
      await loginAsAdmin()
      const suffix = uniqueSuffix()
      const zone = (
        await apiClient.post<Zone>('/zones', {
          name: `IT Emergencia ${suffix}`,
          code: `ITE-${suffix}`,
          depotLat: DEPOT.lat,
          depotLng: DEPOT.lng,
        })
      ).data
      const productId = (
        await productsService.create({
          name: `IT Producto emergencia ${suffix}`,
          price: 6,
          stock: 5,
        })
      ).id
      const own = await driversAdminService.create({
        name: `IT Repartidor emergencia ${suffix}`,
        email: `it.emergencia.${suffix.toLowerCase()}@example.com`,
        vehicle: 'Moto de pruebas',
      })
      const driver = await driverApi({ email: own.user.email, password: own.temporaryPassword })

      const sale = async (k: number) =>
        (
          await ordersService.createPurchase(
            {
              buyer: { type: 'GUEST', name: `IT Emergencia ${k}`, contactPhone: '0990000000' },
              zoneId: zone.id,
              deliveryAddress: `IT Emergencia ${k} ${suffix}`,
              items: [{ productId, quantity: 1 }],
              scheduledDeliveryDate: `${TODAY}T${VISIT}:00-05:00`,
              deliveryLat: DEPOT.lat + 0.001 * k,
              deliveryLng: DEPOT.lng + 0.001 * k,
              payment: { method: 'CASH' },
            } as Parameters<typeof ordersService.createPurchase>[0],
            crypto.randomUUID(),
          )
        ).id
      deliveredId = await sale(1)
      orderA = await sale(2)
      orderB = await sale(3)
      itemB = (await ordersService.get(orderB)).items[0].id

      routeId = (
        await planningService.confirmRoute({
          zoneId: zone.id,
          routeDate: `${TODAY}T${VISIT}:00-05:00`,
          orderIds: [deliveredId, orderA, orderB],
        })
      ).id
      await planningService.assignDriver(routeId, own.id)
      await driver.start(routeId)
      await driver.deliver(deliveredId)
    }, 120_000)

    beforeEach(loginAsAdmin)

    it('la emergencia interrumpe la ruta, conserva lo entregado y deja en custodia lo pendiente', async () => {
      await dispatchService.declareEmergency(routeId, 'IT: choque leve')

      const route = (await monitorService.listRoutes()).find((item) => item.id === routeId)!
      expect(route.status).toBe('INTERRUPTED')
      expect(route.stops.find((stop) => stop.orderId === deliveredId)?.outcome).toBe('SUCCESSFUL')

      const detail = await dispatchService.routeEmergency(routeId)
      emergencyId = detail.id
      expect(detail.units.map((unit) => [unit.orderId, unit.status]).sort()).toEqual(
        [
          [orderA, 'PENDING'],
          [orderB, 'PENDING'],
        ].sort(),
      )
      expect(detail.returnedAt).toBeNull()
      expect(await codeOf(dispatchService.declareEmergency(routeId, 'IT: otra vez'))).toBe(
        'EMERGENCY_ALREADY_DECLARED',
      )
    })

    it('un pedido con unidades pendientes no se puede habilitar (RECOVERY_PENDING)', async () => {
      const error = await dispatchService
        .requeueOrder(orderA, emergencyId, 'IT: todavía no')
        .catch((reason: unknown) => reason)

      expect(describeEmergencyError(error, 'f')).toMatch(/resuélvelas antes/)
    })

    it('confirmar el retorno de A no desbloquea B', async () => {
      await dispatchService.confirmUnitRecovery((await unitOf(orderA)).id, 'IT: volvió A')

      expect((await unitOf(orderA)).status).toBe('RECOVERED')
      expect((await unitOf(orderB)).status).toBe('PENDING')
      await dispatchService.requeueOrder(orderA, emergencyId, 'IT: A listo')
      expect(await codeOf(dispatchService.requeueOrder(orderB, emergencyId, 'IT: B no'))).toBe(
        'RECOVERY_PENDING',
      )
      expect(
        await codeOf(
          dispatchService.confirmUnitRecovery((await unitOf(orderA)).id, 'IT: otra vez'),
        ),
      ).toBe('UNIT_ALREADY_RECOVERED')
    })

    it('B se resuelve con una pérdida y su reemplazo; anularla devuelve la unidad al stock', async () => {
      await dispatchService.declareLoss({
        orderId: orderB,
        orderItemId: itemB,
        reason: 'IT: se rompió',
      })
      expect((await unitOf(orderB)).status).toBe('LOST_PREPARED')
      expect(
        await codeOf(dispatchService.confirmUnitRecovery((await unitOf(orderB)).id, 'IT: no')),
      ).toBe('UNIT_HAS_ACTIVE_LOSS')

      const [loss] = await dispatchService.losses(orderB)
      await dispatchService.cancelLoss(loss.id, 'IT: fue un error')

      const [cancelled] = await dispatchService.losses(orderB)
      expect(cancelled.cancelledAt).not.toBeNull()
      expect(cancelled.movements.map((movement) => movement.kind)).toEqual([
        'REPLACEMENT_OUT',
        'REPLACEMENT_CANCEL_IN',
      ])
      expect((await unitOf(orderB)).status).toBe('PENDING')
      const again = await dispatchService
        .cancelLoss(loss.id, 'IT: otra vez')
        .catch((reason: unknown) => reason)
      expect(describeLossError(again, 'f')).toMatch(/ya estaba anulada/)
    })

    it('el retorno del repartidor y el cierre son aparte; las pendientes siguen a la vista', async () => {
      await dispatchService.releaseEmergencyDriver(routeId, 'IT: llegó al depósito')
      expect((await dispatchService.routeEmergency(routeId)).returnedAt).not.toBeNull()
      expect(await codeOf(dispatchService.releaseEmergencyDriver(routeId, 'IT: otra vez'))).toBe(
        'DRIVER_ALREADY_RELEASED',
      )

      await dispatchService.closeEmergency(routeId, 'IT: fin del día')

      const closed = (await dispatchService.emergencies()).find((item) => item.routeId === routeId)!
      expect(closed.closedAt).not.toBeNull()
      expect(closed.pendingUnits.map((unit) => unit.orderId)).toEqual([orderB])
      expect(await codeOf(dispatchService.closeEmergency(routeId, 'IT: otra vez'))).toBe(
        'EMERGENCY_ALREADY_CLOSED',
      )
    })

    it('un CLIENT no puede ver ni gestionar emergencias (403)', async () => {
      await loginAsClient()

      await expectHttpError(dispatchService.emergencies(), 403)
      await expectHttpError(dispatchService.declareEmergency(routeId, 'IT'), 403)
    })
  },
)
