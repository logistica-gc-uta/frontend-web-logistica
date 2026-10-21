import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { dispatchService } from '../features/dispatch/dispatchService'
import type { UrgencyProposal } from '../features/dispatch/types'
import { ordersService } from '../features/orders/ordersService'
import { planningService } from '../features/planning/planningService'
import { productsService } from '../features/products/productsService'
import type { Zone } from '../features/zones/types'
import { authStorage } from '../lib/auth/authStorage'
import { apiClient } from '../lib/http/apiClient'
import { BUSINESS_TIME_ZONE, todayInGuayaquil } from '../lib/time/guayaquil'
import type { GeoPoint } from '../types/geo'
import { expectHttpError } from './support/assertions'
import { loginAsAdmin, loginAsClient, uniqueSuffix } from './support/session'

/**
 * La bandeja solo muestra pedidos de HOY (Guayaquil), así que estas pruebas crean pedidos de hoy en
 * una zona propia de la ejecución (con su depósito): las urgencias de otras ejecuciones o de datos
 * reales no interfieren. Nunca asignan choferes: solo rechazan, priorizan, insertan en una ruta
 * DRAFT y reprograman.
 */
const DEPOT: GeoPoint = { lat: -1.2491, lng: -78.6168 }
const MINUTES_AHEAD = 30

const hourFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** Hora (hh:mm) de Guayaquil dentro de `minutes` minutos. */
const guayaquilTimeIn = (minutes: number) =>
  hourFormatter.format(new Date(Date.now() + minutes * 60_000))

const TODAY = todayInGuayaquil()
const LATER_TODAY = guayaquilTimeIn(MINUTES_AHEAD)
// Cerca de la medianoche ya no queda un "más tarde hoy": la suite se omite en lugar de fallar.
const HAS_TIME_LEFT_TODAY = LATER_TODAY > guayaquilTimeIn(0)

const TOMORROW = new Date(Date.parse(`${TODAY}T12:00:00Z`) + 24 * 60 * 60_000)
  .toISOString()
  .slice(0, 10)

let zone: Zone
let productId: string

const createTodayOrder = async (k: number) =>
  ordersService.createAsAdmin({
    recipient: { type: 'GUEST', name: `IT Urgencia ${k}`, contactPhone: '0990000000' },
    zoneId: zone.id,
    deliveryAddress: `IT Urgencia ${k} ${uniqueSuffix()}`,
    items: [{ productId, quantity: 1 }],
    scheduledDeliveryDate: `${TODAY}T${LATER_TODAY}:00-05:00`,
    deliveryLat: DEPOT.lat + 0.001 * k,
    deliveryLng: DEPOT.lng + 0.001 * k,
  })

const urgencyOf = async (orderId: string): Promise<UrgencyProposal | undefined> =>
  (await dispatchService.inbox()).urgencies.find((urgency) => urgency.orderId === orderId)

const routeOrderIds = async (routeId: string) =>
  ((await planningService.listRoutes()).find((route) => route.id === routeId)?.orders ?? []).map(
    (order) => order.id,
  )

describe.skipIf(!HAS_TIME_LEFT_TODAY)(
  `Integración real · urgencias (/dispatch) · hoy ${TODAY}`,
  () => {
    let routeId: string
    const decided: string[] = []

    beforeAll(async () => {
      await loginAsAdmin()
      const suffix = uniqueSuffix()
      const { data } = await apiClient.post<Zone>('/zones', {
        name: `IT Urgencias ${suffix}`,
        code: `ITU-${suffix}`,
        depotLat: DEPOT.lat,
        depotLng: DEPOT.lng,
      })
      zone = data
      productId = (
        await productsService.create({
          name: `IT Producto urgencias ${suffix}`,
          price: 5,
          stock: 10,
        })
      ).id
    })

    beforeEach(loginAsAdmin)

    it('un pedido de hoy sin rutas disponibles aparece PENDING con su propuesta y motivos', async () => {
      const order = await createTodayOrder(1)

      const urgency = await urgencyOf(order.id)

      expect(urgency).toBeDefined()
      expect(['NEW_ROUTE', 'BLOCKED']).toContain(urgency?.kind)
      expect(urgency?.fingerprint).toMatch(/^[a-f0-9]{64}$/)
      const [listed] = await ordersService.listAll({ date: TODAY, zoneId: zone.id })
      expect(listed.status).toBe('PENDING')

      // Se guarda como ruta DRAFT para que el siguiente pedido pueda insertarse en ella.
      const proposal = (await planningService.getProposals({ date: TODAY, zoneId: zone.id }))
        .proposals[0]
      routeId = (
        await planningService.confirmRoute({
          zoneId: zone.id,
          routeDate: proposal.routeDate,
          orderIds: proposal.orderIds,
        })
      ).id
      expect(await routeOrderIds(routeId)).toEqual([order.id])
    })

    it('rechazar y priorizar quedan auditados sin cambiar el pedido ni la ruta; una propuesta vieja da 409', async () => {
      const order = await createTodayOrder(2)
      decided.push(order.id)
      const urgency = await urgencyOf(order.id)
      expect(urgency).toEqual(expect.objectContaining({ kind: 'INSERT', routeId }))

      await expectHttpError(
        dispatchService.confirm({ ...urgency!, fingerprint: 'f'.repeat(64) }, 'IT: huella vieja'),
        409,
      )

      const rejection = await dispatchService.reject(urgency!, 'IT: esperar al cliente')
      expect(rejection.outcome).toBe('REJECTED')
      expect(await urgencyOf(order.id)).toEqual(expect.objectContaining({ kind: 'INSERT' }))
      expect(await routeOrderIds(routeId)).toHaveLength(1)

      await dispatchService.prioritize(order.id, 'IT: cliente prioritario')
      expect((await dispatchService.inbox()).urgencies[0].orderId).toBe(order.id)
    })

    it('insertar una urgencia con la propuesta vigente la agrega a la ruta DRAFT', async () => {
      const [orderId] = decided
      const urgency = await urgencyOf(orderId)

      const audit = await dispatchService.confirm(urgency!, 'IT: cabe en la ruta')

      expect(audit).toEqual(expect.objectContaining({ action: 'CONFIRM', outcome: 'APPLIED' }))
      expect(await routeOrderIds(routeId)).toContain(orderId)
      expect((await urgencyOf(orderId))?.kind).not.toBe('INSERT')
    })

    it('reprogramar mueve el pedido a la fecha y franja acordadas y deja la bandeja de hoy', async () => {
      const order = await createTodayOrder(3)
      decided.push(order.id)

      const audit = await dispatchService.reschedule({
        orderId: order.id,
        reason: 'IT: sin cupo hoy',
        scheduledDeliveryDate: `${TOMORROW}T09:00:00-05:00`,
        deliveryWindowStart: `${TOMORROW}T09:00:00-05:00`,
        deliveryWindowEnd: `${TOMORROW}T11:00:00-05:00`,
      })

      expect(audit).toEqual(expect.objectContaining({ action: 'RESCHEDULE', outcome: 'APPLIED' }))
      expect(await urgencyOf(order.id)).toBeUndefined()
      const tomorrow = await ordersService.listAll({ date: TOMORROW, zoneId: zone.id })
      expect(tomorrow.map((listed) => listed.id)).toContain(order.id)
      expect(tomorrow.find((listed) => listed.id === order.id)?.status).toBe('PENDING')
    })

    it('el historial registra cada decisión con su responsable y motivo', async () => {
      const adminId = authStorage.getSession()?.user.id
      const records = (await dispatchService.audit()).filter(
        (record) => record.orderId && decided.includes(record.orderId),
      )

      expect(records.map((record) => record.action).sort()).toEqual(
        ['CONFIRM', 'CONTACT', 'PRIORITIZE', 'REJECT', 'RESCHEDULE'].sort(),
      )
      expect(records.every((record) => record.actorId === adminId)).toBe(true)
      expect(records.every((record) => record.reason.startsWith('IT:'))).toBe(true)
    })

    it('un CLIENT no puede ver la bandeja ni tomar decisiones (403)', async () => {
      await loginAsClient()

      await expectHttpError(dispatchService.inbox(), 403)
      await expectHttpError(dispatchService.prioritize(decided[0], 'IT'), 403)
    })
  },
)
