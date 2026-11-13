import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { catalogService } from '../features/catalog/catalogService'
import { dispatchService } from '../features/dispatch/dispatchService'
import {
  describeConfirmError,
  ROUTE_DATE_NOT_TODAY_MESSAGE,
} from '../features/planning/confirmError'
import { planningService } from '../features/planning/planningService'
import { productsService } from '../features/products/productsService'
import { shopService } from '../features/shop/shopService'
import { BUSINESS_TIME_ZONE, todayInGuayaquil } from '../lib/time/guayaquil'
import type { GeoPoint } from '../types/geo'
import { expectHttpError } from './support/assertions'
import { coveragePoints, createGuestSale } from './support/purchases'
import { loginAsAdmin, loginAsClient, uniqueSuffix } from './support/session'

/**
 * #37 parte 2 · Rutas del día y horarios contra la API real (backend #48 y #49). Las ventas se
 * registran sin zona: salen de la tienda. Nunca se asignan choferes; el borrador de hoy que se crea
 * se libera al final con `RELEASE_DRAFT`.
 */
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

/** Un miércoles al azar entre 2060 y 2079: el día futuro es propio de esta ejecución. */
const FUTURE_DAY = new Date(
  Date.UTC(2060, 0, 7) + Math.floor(Math.random() * 1000) * 7 * 86_400_000,
)
  .toISOString()
  .slice(0, 10)

let inside: GeoPoint
let productId: string

describe('Integración real · rutas del día y horarios (#37, backend #48 y #49)', () => {
  beforeAll(async () => {
    await loginAsAdmin()
    inside = (await coveragePoints()).inside
    productId = (
      await productsService.create({
        name: `IT Producto rutas del día ${uniqueSuffix()}`,
        price: 10,
        stock: 10,
      })
    ).id
  })

  beforeEach(loginAsAdmin)

  it('otro día es solo vista previa: no se puede confirmar (409 ROUTE_DATE_NOT_TODAY)', async () => {
    const sale = await createGuestSale({
      productId,
      scheduledDeliveryDate: `${FUTURE_DAY}T10:00:00-05:00`,
      location: inside,
    })

    const preview = await planningService.getProposals({ date: FUTURE_DAY })
    const proposal = preview.proposals.find((item) => item.orderIds.includes(sale.id))

    expect(preview).toEqual(
      expect.objectContaining({ isToday: false, canConfirm: false, date: FUTURE_DAY }),
    )
    expect(preview.timeWindowMarginMinutes).toEqual(expect.any(Number))
    // La venta sin zona se planifica desde la tienda (#49).
    expect(proposal).toEqual(expect.objectContaining({ zoneId: null, zoneCode: null }))

    const error = await planningService
      .confirmRoute({ zoneId: null, routeDate: proposal!.routeDate, orderIds: proposal!.orderIds })
      .catch((reason: unknown) => reason)
    expect(describeConfirmError(error)).toBe(ROUTE_DATE_NOT_TODAY_MESSAGE)
  })

  it('horas lejanas no se mezclan: 10:00 y 15:00 van en rutas distintas', async () => {
    const day = new Date(Date.parse(`${FUTURE_DAY}T12:00:00Z`) + 86_400_000)
      .toISOString()
      .slice(0, 10)
    const morning = await createGuestSale({
      productId,
      scheduledDeliveryDate: `${day}T10:00:00-05:00`,
      location: inside,
    })
    const afternoon = await createGuestSale({
      productId,
      scheduledDeliveryDate: `${day}T15:00:00-05:00`,
      location: inside,
    })

    const { proposals } = await planningService.getProposals({ date: day })
    const routeOf = (orderId: string) => proposals.find((item) => item.orderIds.includes(orderId))

    expect(routeOf(morning.id)).toBeDefined()
    expect(routeOf(morning.id)).not.toBe(routeOf(afternoon.id))
  })

  it('el margen se guarda con la versión y se refleja en las propuestas', async () => {
    const before = await catalogService.getSettings()
    const next = before.routeTimeWindowMarginMinutes === 45 ? 50 : 45

    const saved = await catalogService.saveSettings(before.version, {
      routePlanning: { timeWindowMarginMinutes: next },
    })
    try {
      expect(saved.routeTimeWindowMarginMinutes).toBe(next)
      expect(saved.version).toBe(before.version + 1)
      const preview = await planningService.getProposals({ date: FUTURE_DAY })
      expect(preview.timeWindowMarginMinutes).toBe(next)
      // Con una versión vieja no se sobrescribe.
      await expectHttpError(
        catalogService.saveSettings(before.version, {
          routePlanning: { timeWindowMarginMinutes: 60 },
        }),
        409,
      )
    } finally {
      await catalogService.saveSettings(saved.version, {
        routePlanning: { timeWindowMarginMinutes: before.routeTimeWindowMarginMinutes },
      })
    }
  })

  it.skipIf(!HAS_TIME_LEFT_TODAY)(
    'hoy se confirma un borrador sin zona («Tienda») y se puede liberar con auditoría',
    async () => {
      const sale = await createGuestSale({
        productId,
        scheduledDeliveryDate: `${TODAY}T${LATER_TODAY}:00-05:00`,
        location: inside,
      })
      const preview = await planningService.getProposals({ date: TODAY })
      expect(preview).toEqual(expect.objectContaining({ isToday: true, canConfirm: true }))
      const proposal = preview.proposals.find((item) => item.orderIds.includes(sale.id))!

      const route = await planningService.confirmRoute({
        zoneId: null,
        routeDate: proposal.routeDate,
        orderIds: [sale.id],
      })
      const listed = (await planningService.listRoutes()).find((item) => item.id === route.id)
      expect(listed).toEqual(
        expect.objectContaining({ status: 'DRAFT', zoneId: null, zoneCode: 'Tienda' }),
      )

      const audit = await dispatchService.releaseDraft(route.id, 'IT liberar borrador de prueba')

      expect(audit).toEqual(
        expect.objectContaining({ action: 'RELEASE_DRAFT', outcome: 'APPLIED', routeId: route.id }),
      )
      const after = await planningService.getProposals({ date: TODAY })
      expect(after.proposals.some((item) => item.orderIds.includes(sale.id))).toBe(true)
    },
  )

  it('un CLIENT no puede liberar borradores ni cambiar el margen (403)', async () => {
    await loginAsClient()

    await expectHttpError(dispatchService.releaseDraft(crypto.randomUUID(), 'IT'), 403)
    await expectHttpError(
      catalogService.saveSettings(1, { routePlanning: { timeWindowMarginMinutes: 30 } }),
      403,
    )
  })

  afterAll(loginAsAdmin)
})
