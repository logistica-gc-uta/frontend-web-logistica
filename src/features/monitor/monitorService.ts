import { areaLabel } from '../../lib/planning/routeArea'
import { apiClient } from '../../lib/http/apiClient'
import type { MonitorRoute, MonitorRouteStatus, MonitorStop, StopOutcome } from './types'

/** Lo que usamos de cada elemento de `GET /routes` (la respuesta trae bastante más). */
interface RawRoute {
  id: string
  status: MonitorRouteStatus
  date: string
  createdAt: string
  /** `null` en rutas sin zona que salen de la tienda (backend #49). */
  zone: { code: string } | null
  driverId: string | null
  driver: { user: { name: string } } | null
  startedAt: string | null
  completedAt: string | null
  returnedAt: string | null
  /** Cancelación antes de salir (backend #63/#85); ausentes en un backend anterior. */
  cancelledAt?: string | null
  cancelReason?: string | null
  orders: { id: string; deliveryAddress: string }[]
  stops: {
    id: string
    orderId: string
    sequence: number | null
    outcome: StopOutcome
    attempts: {
      outcome: string
      failureReason: string | null
      context?: string | null
      recordedAt: string
    }[]
  }[]
}

/** Paradas por orden de visita; las que no tienen posición van al final. */
const bySequence = (a: MonitorStop, b: MonitorStop): number =>
  (a.sequence ?? Number.MAX_SAFE_INTEGER) - (b.sequence ?? Number.MAX_SAFE_INTEGER)

const lastFailedAttempt = (attempts: RawRoute['stops'][number]['attempts']) =>
  attempts
    .filter((attempt) => attempt.outcome === 'FAILED')
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0]

/**
 * Copia solo los campos que muestra el panel: no entran datos del destinatario ni el usuario del
 * chofer (que incluye su hash de contraseña). Del intento fallido pasa el motivo y lo que anotó el
 * chofer en la app («Qué pasó»), porque la persona que gestiona la entrega necesita leerlo.
 */
const toMonitorRoute = (raw: RawRoute): MonitorRoute => {
  const addresses = new Map(raw.orders.map((order) => [order.id, order.deliveryAddress]))
  return {
    id: raw.id,
    status: raw.status,
    date: raw.date,
    createdAt: raw.createdAt,
    zoneCode: areaLabel(raw.zone?.code),
    driverId: raw.driverId,
    driverName: raw.driver?.user.name ?? null,
    startedAt: raw.startedAt,
    completedAt: raw.completedAt,
    returnedAt: raw.returnedAt,
    cancelledAt: raw.cancelledAt ?? null,
    cancelReason: raw.cancelReason?.trim() || null,
    stops: raw.stops
      .map((stop) => ({
        id: stop.id,
        orderId: stop.orderId,
        sequence: stop.sequence,
        deliveryAddress: addresses.get(stop.orderId) ?? `Pedido ${stop.orderId.slice(0, 8)}`,
        outcome: stop.outcome,
        failureReason: lastFailedAttempt(stop.attempts)?.failureReason ?? null,
        failureContext: lastFailedAttempt(stop.attempts)?.context?.trim() || null,
      }))
      .sort(bySequence),
  }
}

export const monitorService = {
  /**
   * Todas las rutas con sus visitas, tal como están en PostgreSQL (fuente de verdad), en el orden
   * en que se confirmaron: el orden de la API cambia cuando se modifica una ruta.
   */
  async listRoutes(): Promise<MonitorRoute[]> {
    const { data } = await apiClient.get<RawRoute[]>('/routes')
    return data
      .map(toMonitorRoute)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  },
}
