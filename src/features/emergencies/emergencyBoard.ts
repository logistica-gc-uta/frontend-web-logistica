import { dispatchService } from '../dispatch/dispatchService'
import { monitorService } from '../monitor/monitorService'
import type { MonitorRoute } from '../monitor/types'
import { ordersService } from '../orders/ordersService'
import type { Order } from '../orders/types'
import type { EmergencyUnit, RouteEmergencyDetail } from './types'

/** Unidades de un pedido dentro de una emergencia. */
export interface EmergencyOrder {
  orderId: string
  /** Datos actuales del pedido; pueden faltar si no se pudo consultar. */
  order: Order | undefined
  units: EmergencyUnit[]
  /** Todas sus unidades están recuperadas o cubiertas por un reemplazo preparado. */
  resolved: boolean
  /** Sigue bloqueado para planificar (revisión administrativa pendiente). */
  awaitingReview: boolean
}

export interface EmergencyView {
  emergency: RouteEmergencyDetail
  /** La ruta interrumpida, con lo entregado y lo fallido (de `GET /routes`). */
  route: MonitorRoute | undefined
  orders: EmergencyOrder[]
}

/**
 * Emergencias con su detalle por unidad, la ruta (para mostrar lo ya entregado, que nunca se borra)
 * y los pedidos afectados. Todo sale del servidor: nada se deduce en la web.
 */
export async function loadEmergencies(): Promise<EmergencyView[]> {
  const [list, routes] = await Promise.all([
    dispatchService.emergencies(),
    monitorService.listRoutes(),
  ])
  const details = await Promise.all(
    list.map((item) => dispatchService.routeEmergency(item.routeId)),
  )
  const orderIds = [...new Set(details.flatMap((detail) => detail.units.map((u) => u.orderId)))]
  const orders = new Map(
    await Promise.all(
      orderIds.map(async (id) => [id, await ordersService.get(id).catch(() => undefined)] as const),
    ),
  )

  return details
    .map((emergency) => {
      const byOrder = new Map<string, EmergencyUnit[]>()
      for (const unit of emergency.units) {
        byOrder.set(unit.orderId, [...(byOrder.get(unit.orderId) ?? []), unit])
      }
      return {
        emergency,
        route: routes.find((route) => route.id === emergency.routeId),
        orders: [...byOrder.entries()].map(([orderId, units]) => {
          const order = orders.get(orderId)
          return {
            orderId,
            order,
            units: [...units].sort(
              (a, b) => a.orderItemId.localeCompare(b.orderItemId) || a.unitNumber - b.unitNumber,
            ),
            resolved: units.every((unit) => unit.resolved),
            awaitingReview:
              order?.planningEligibility.reasons.includes('ADMINISTRATIVE_REVIEW_REQUIRED') ?? true,
          }
        }),
      }
    })
    .sort((a, b) => b.emergency.declaredAt.localeCompare(a.emergency.declaredAt))
}
