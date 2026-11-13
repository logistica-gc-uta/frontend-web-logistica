import type { Socket } from 'socket.io-client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { dispatchService } from '../features/dispatch/dispatchService'
import { monitorService } from '../features/monitor/monitorService'
import { ordersService } from '../features/orders/ordersService'
import { planningService } from '../features/planning/planningService'
import { productsService } from '../features/products/productsService'
import { shopService } from '../features/shop/shopService'
import type { Zone } from '../features/zones/types'
import { authStorage } from '../lib/auth/authStorage'
import { apiClient } from '../lib/http/apiClient'
import { BUSINESS_TIME_ZONE, todayInGuayaquil } from '../lib/time/guayaquil'
import {
  createRealtimeSocket,
  type RealtimeSubscription,
  type SubscribeAck,
} from '../lib/realtime/realtimeClient'
import type { GeoPoint } from '../types/geo'
import { loginAsAdmin, loginAsClient, uniqueSuffix } from './support/session'

/**
 * Conexión real al Socket.IO del backend. Usa una zona propia de la ejecución: crea una ruta DRAFT
 * de HOY (desde backend #49 solo se confirman rutas del día de entrega) y la reordena para provocar
 * un evento real; al final la libera. Nunca asigna choferes. Fuera del horario de reparto se omite.
 */
const DEPOT: GeoPoint = { lat: -1.2391, lng: -78.6271 }
const hourFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const DAY = todayInGuayaquil()
const LATER_TODAY = hourFormatter.format(new Date(Date.now() + 30 * 60_000))
const { deliverySchedule: HOURS } = await shopService.settings()
const HAS_TIME_LEFT_TODAY =
  LATER_TODAY > hourFormatter.format(new Date()) &&
  LATER_TODAY >= HOURS.startTime &&
  LATER_TODAY <= HOURS.endTime
const WAIT_MS = 8_000

const sockets: Socket[] = []

/** Abre una conexión con la sesión guardada y espera a que conecte o falle. */
async function connect(): Promise<{ socket: Socket; error?: Error }> {
  const socket = createRealtimeSocket()
  sockets.push(socket)
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ socket, error: new Error('timeout') }), WAIT_MS)
    socket.once('connect', () => {
      clearTimeout(timer)
      resolve({ socket })
    })
    socket.once('connect_error', (error) => {
      clearTimeout(timer)
      resolve({ socket, error })
    })
    socket.connect()
  })
}

const subscribe = (socket: Socket, subscription: RealtimeSubscription) =>
  socket.timeout(WAIT_MS).emitWithAck('resource.subscribe', subscription) as Promise<SubscribeAck>

const nextEvent = <T>(socket: Socket, event: string) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No llegó ${event}`)), WAIT_MS)
    socket.once(event, (payload: T) => {
      clearTimeout(timer)
      resolve(payload)
    })
  })

let routeId: string
let orderIds: string[]

describe.skipIf(!HAS_TIME_LEFT_TODAY)(
  'Integración real · tiempo real (Socket.IO /realtime)',
  () => {
    beforeAll(async () => {
      await loginAsAdmin()
      const suffix = uniqueSuffix()
      const { data: zone } = await apiClient.post<Zone>('/zones', {
        name: `IT Tiempo real ${suffix}`,
        code: `ITR-${suffix}`,
        depotLat: DEPOT.lat,
        depotLng: DEPOT.lng,
      })
      const product = await productsService.create({
        name: `IT Producto tiempo real ${suffix}`,
        price: 3,
        stock: 5,
      })
      orderIds = []
      for (const k of [1, 2]) {
        const order = await ordersService.createPurchase(
          {
            buyer: { type: 'GUEST', name: `IT Tiempo real ${k}`, contactPhone: '0990000000' },
            zoneId: zone.id,
            deliveryAddress: `IT Tiempo real ${k} ${suffix}`,
            items: [{ productId: product.id, quantity: 1 }],
            scheduledDeliveryDate: `${DAY}T${LATER_TODAY}:00-05:00`,
            deliveryLat: DEPOT.lat + 0.001 * k,
            deliveryLng: DEPOT.lng + 0.001 * k,
            payment: { method: 'CASH' },
          },
          crypto.randomUUID(),
        )
        orderIds.push(order.id)
      }
      const [proposal] = (await planningService.getProposals({ date: DAY, zoneId: zone.id }))
        .proposals
      routeId = (
        await planningService.confirmRoute({
          zoneId: zone.id,
          routeDate: proposal.routeDate,
          orderIds: proposal.orderIds,
        })
      ).id
    })

    afterEach(() => {
      sockets.splice(0).forEach((socket) => socket.disconnect())
    })

    // El borrador propio se libera: no queda un pedido de hoy reservado para otras pruebas.
    afterAll(async () => {
      await loginAsAdmin()
      await dispatchService.releaseDraft(routeId, 'IT: limpieza de la prueba').catch(() => {})
    })

    it('un ADMIN se conecta con su token y puede seguir rutas, pedidos e incidencias', async () => {
      await loginAsAdmin()
      const { socket, error } = await connect()

      expect(error).toBeUndefined()
      expect(await subscribe(socket, { resource: 'route', id: routeId })).toEqual({ ok: true })
      expect(await subscribe(socket, { resource: 'order', id: orderIds[0] })).toEqual({ ok: true })
      expect(await subscribe(socket, { resource: 'incidents' })).toEqual({ ok: true })
    })

    it('un cambio real en la ruta llega como aviso sin datos sensibles; el estado se lee por GET', async () => {
      await loginAsAdmin()
      const { socket } = await connect()
      await subscribe(socket, { resource: 'route', id: routeId })
      const current = (await monitorService.listRoutes()).find((route) => route.id === routeId)
      const reversed = [...(current?.stops ?? [])].reverse().map((stop) => stop.orderId)
      const event = nextEvent<{
        version: number
        eventId: string
        occurredAt: string
        data: object
      }>(socket, 'route.updated')

      await dispatchService.reorderStops({ routeId, orderIds: reversed, reason: 'IT: tiempo real' })

      const envelope = await event
      expect(envelope).toEqual({
        version: 1,
        eventId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        occurredAt: expect.any(String),
        data: expect.objectContaining({ routeId }),
      })
      expect(Object.keys(envelope.data).sort()).toEqual(expect.arrayContaining(['routeId']))
      expect(JSON.stringify(envelope)).not.toMatch(/deliveryAddress|recipient|password|0990000000/)
      // El aviso no trae el nuevo orden: hay que consultarlo.
      const after = (await monitorService.listRoutes()).find((route) => route.id === routeId)
      expect(after?.stops.map((stop) => stop.orderId)).toEqual(reversed)
    })

    it('un recurso que no existe se rechaza sin unirse', async () => {
      await loginAsAdmin()
      const { socket } = await connect()

      const ack = await subscribe(socket, { resource: 'route', id: crypto.randomUUID() })

      expect(ack.ok).toBe(false)
    })

    it('un CLIENT no puede seguir rutas ajenas ni las incidencias', async () => {
      await loginAsClient()
      const { socket, error } = await connect()
      expect(error).toBeUndefined()

      expect(await subscribe(socket, { resource: 'route', id: routeId })).toEqual({
        ok: false,
        error: expect.any(String),
      })
      expect((await subscribe(socket, { resource: 'incidents' })).ok).toBe(false)
    })

    it('un token inválido no logra conectarse', async () => {
      authStorage.save({
        token: 'token-invalido',
        user: { id: 'x', name: 'Sesión inválida', email: 'x@example.com', role: 'ADMIN' },
      })

      const { error } = await connect()

      expect(error).toBeInstanceOf(Error)
    })
  },
)
