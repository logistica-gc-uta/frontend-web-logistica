import { dispatchService } from '../dispatch/dispatchService'
import type { DispatchAudit, FailedAttempt } from '../dispatch/types'
import { monitorService } from '../monitor/monitorService'
import type { MonitorRoute, MonitorStop } from '../monitor/types'
import { ordersService } from '../orders/ordersService'
import type { Order } from '../orders/types'

/** Una visita del pedido en una ruta (la original, o una posterior tras reprogramarse). */
export interface OrderVisit {
  route: MonitorRoute
  stop: MonitorStop
}

/** Entrega fallida lista para mostrar y gestionar. */
export interface IncidentView {
  orderId: string
  /** Datos actuales del pedido; pueden faltar si no se pudo consultar. */
  order: Order | undefined
  /** Último intento fallido: el contacto debe referirse a él. */
  latestAttempt: FailedAttempt | undefined
  /** Ruta donde ocurrió el último intento fallido. */
  originalRoute: MonitorRoute | undefined
  /** Todas las visitas del pedido, en el orden de sus rutas. Solo lectura: nunca se reescriben. */
  visits: OrderVisit[]
  /** Contactos y reprogramaciones registrados para el pedido, el más reciente primero. */
  management: DispatchAudit[]
}

export interface IncidentsBoard {
  incidents: IncidentView[]
  /** Instante de esta consulta. */
  loadedAt: string
}

const MANAGEMENT_ACTIONS = new Set(['CONTACT', 'RESCHEDULE'])

/**
 * Carga las entregas fallidas que esperan gestión, con su contexto: la ruta del intento, el
 * historial de visitas del pedido (de `GET /routes`) y las gestiones ya registradas (auditoría).
 */
export async function loadIncidentsBoard(): Promise<IncidentsBoard> {
  const [inbox, routes, audit] = await Promise.all([
    dispatchService.inbox(),
    monitorService.listRoutes(),
    dispatchService.audit(),
  ])
  const orders = await Promise.all(
    inbox.failedDeliveries.map(({ orderId }) => ordersService.get(orderId).catch(() => undefined)),
  )

  const incidents = inbox.failedDeliveries.map((failed, index): IncidentView => {
    const latestAttempt = failed.attempts[0]
    const visits = routes.flatMap((route) =>
      route.stops
        .filter((stop) => stop.orderId === failed.orderId)
        .map((stop) => ({ route, stop })),
    )
    return {
      orderId: failed.orderId,
      order: orders[index],
      latestAttempt,
      originalRoute: visits.find(({ stop }) => stop.id === latestAttempt?.stopId)?.route,
      visits,
      management: audit
        .filter(
          (record) => record.orderId === failed.orderId && MANAGEMENT_ACTIONS.has(record.action),
        )
        .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
    }
  })

  return { incidents, loadedAt: new Date().toISOString() }
}
