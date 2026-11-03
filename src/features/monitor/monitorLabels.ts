import type { RealtimeStatus } from '../../hooks/useRealtimeUpdates'
import type { DriverState } from './routeProgress'
import type { MonitorRouteStatus } from './types'

export const MONITOR_ROUTE_STATUS_LABELS: Record<MonitorRouteStatus, string> = {
  UNVERIFIED: 'Sin verificar',
  DRAFT: 'Borrador (DRAFT)',
  ASSIGNED: 'Asignada, sin iniciar (ASSIGNED)',
  IN_PROGRESS: 'En curso (IN_PROGRESS)',
  COMPLETED: 'Completada (COMPLETED)',
}

export const DRIVER_STATE_LABELS: Record<DriverState, string> = {
  BUSY: 'Ocupado con esta ruta',
  RETURNING: 'Retornando al depósito: todavía no está disponible',
  AVAILABLE: 'Regresó al depósito y está disponible',
  BUSY_ELSEWHERE: 'Regresó al depósito, pero sigue ocupado con otra ruta',
}

const FAILURE_REASON_LABELS: Record<string, string> = {
  RECIPIENT_ABSENT: 'destinatario ausente',
  RECIPIENT_REFUSED: 'el destinatario rechazó la entrega',
}

/** Motivo tipificado de una visita fallida; un código desconocido se muestra tal cual. */
export const describeFailureReason = (code: string | null): string =>
  code ? (FAILURE_REASON_LABELS[code] ?? code) : 'sin motivo registrado'

export const REALTIME_STATUS_LABELS: Record<RealtimeStatus, string> = {
  connecting: 'Conectando…',
  live: 'En vivo',
  lost: 'Conexión perdida: reintentando. Los datos pueden estar desactualizados.',
  recovered: 'Conexión recuperada: datos actualizados desde el servidor.',
  closed: 'El servidor cerró la conexión (puede que la sesión haya vencido).',
}
