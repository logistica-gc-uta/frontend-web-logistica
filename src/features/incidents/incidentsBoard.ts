import { dispatchService } from '../dispatch/dispatchService'
import type {
  DispatchAudit,
  FailedAttempt,
  IncidentAllowedActions,
  IncidentEmergencyContext,
  IncidentOwnership,
  IncidentReadiness,
  IncidentStatus,
  OrderPickup,
} from '../dispatch/types'
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
  /** Contactos, reprogramaciones y gestiones de retiro del pedido, la más reciente primero. */
  management: DispatchAudit[]
  /** Retiro en tienda acordado (backend #50), o `null` si todavía espera gestión. */
  pickup: OrderPickup | null
  /** Estado operativo proyectado por el servidor (ausente en backends anteriores). */
  status?: IncidentStatus
  /** Propietario operativo proyectado por el servidor. */
  ownership?: IncidentOwnership
  /** Último intento fallido canónico reportado por el servidor (puede ser `null` explícito). */
  latestFailedAttemptId?: string | null
  /** Confirmación de disponibilidad en tienda para `latestFailedAttemptId`, o `null`. */
  readiness?: IncidentReadiness | null
  /** Emergencia activa propietaria cuando `ownership === 'EMERGENCY_CUSTODY'`. */
  emergencyId?: string | null
  /** Contexto mínimo de emergencia cuando `ownership === 'EMERGENCY_CUSTODY'`. */
  emergency?: IncidentEmergencyContext | null
  /** Último acuerdo de contacto vigente no consumido para `latestFailedAttemptId`, o `null`. */
  activeAgreementId?: string | null
  /** Acciones permitidas/denegadas por el servidor. */
  allowedActions?: IncidentAllowedActions
}

export interface IncidentsBoard {
  incidents: IncidentView[]
  /** Instante de esta consulta. */
  loadedAt: string
}

const MANAGEMENT_ACTIONS = new Set([
  'CONTACT',
  'CONFIRM_INCIDENT_READY',
  'RESCHEDULE',
  'PICKUP_AGREE',
  'PICKUP_DECLINE',
  'PICKUP_CONFIRM',
])

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
    const latestAttempt =
      failed.latestFailedAttemptId !== undefined
        ? failed.latestFailedAttemptId === null
          ? undefined
          : failed.attempts.find((attempt) => attempt.id === failed.latestFailedAttemptId)
        : failed.attempts[0]
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
      pickup: failed.pickup,
      ...(failed.status !== undefined ? { status: failed.status } : {}),
      ...(failed.ownership !== undefined ? { ownership: failed.ownership } : {}),
      ...(failed.latestFailedAttemptId !== undefined
        ? { latestFailedAttemptId: failed.latestFailedAttemptId }
        : {}),
      ...(failed.readiness !== undefined ? { readiness: failed.readiness } : {}),
      ...(failed.emergencyId !== undefined ? { emergencyId: failed.emergencyId } : {}),
      ...(failed.emergency !== undefined ? { emergency: failed.emergency } : {}),
      ...(failed.activeAgreementId !== undefined
        ? { activeAgreementId: failed.activeAgreementId }
        : {}),
      ...(failed.allowedActions !== undefined ? { allowedActions: failed.allowedActions } : {}),
    }
  })

  return { incidents, loadedAt: new Date().toISOString() }
}
