import type { DriverUnavailableReason, RouteStatus } from './types'

export const ROUTE_STATUS_LABELS: Record<RouteStatus, string> = {
  DRAFT: 'Borrador (DRAFT)',
  ASSIGNED: 'Asignada (ASSIGNED)',
  IN_PROGRESS: 'En curso (IN_PROGRESS)',
  COMPLETED: 'Completada (COMPLETED)',
}

/** Qué significa cada estado y qué se puede hacer con la ruta desde esta pantalla. */
export const ROUTE_STATUS_HELP: Record<RouteStatus, string> = {
  DRAFT: 'Guardada, sin chofer. Aún se puede asignar y corregir.',
  ASSIGNED: 'Con chofer, todavía sin iniciar. Sus paradas aún se pueden corregir.',
  IN_PROGRESS: 'En ejecución: sus paradas y su composición no se pueden modificar.',
  COMPLETED: 'Terminada: no se puede modificar.',
}

/** Por qué un chofer no se puede elegir todavía. */
export const DRIVER_UNAVAILABLE_LABELS: Record<DriverUnavailableReason, string> = {
  ROUTE_HOLD: 'ocupado hasta que regrese al depósito',
  MARKED_UNAVAILABLE: 'marcado como no disponible',
}
