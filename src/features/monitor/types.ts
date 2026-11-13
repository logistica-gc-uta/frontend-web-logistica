/** Resultado de una visita: `null` en rutas antiguas sin dato (no se inventa éxito ni fallo). */
export type StopOutcome = 'PENDING' | 'SUCCESSFUL' | 'FAILED' | null

/** Motivo tipificado de una visita fallida (el texto libre del chofer no se muestra). */
export type FailureReason = 'RECIPIENT_ABSENT' | 'RECIPIENT_REFUSED'

export interface MonitorStop {
  id: string
  orderId: string
  sequence: number | null
  deliveryAddress: string
  outcome: StopOutcome
  /** Motivo del último intento fallido, si lo hubo. */
  failureReason: string | null
}

/** `INTERRUPTED`: se declaró una emergencia en ruta (backend #51). */
export type MonitorRouteStatus =
  'UNVERIFIED' | 'DRAFT' | 'ASSIGNED' | 'IN_PROGRESS' | 'INTERRUPTED' | 'COMPLETED'

/** Ruta tal como la sigue el monitor (solo lo necesario de `GET /routes`). */
export interface MonitorRoute {
  id: string
  status: MonitorRouteStatus
  /** Instante del día de la ruta (ISO 8601). */
  date: string
  /** Cuándo se confirmó; ordena la lista para que cada ruta conserve su número. */
  createdAt: string
  zoneCode: string
  driverId: string | null
  driverName: string | null
  startedAt: string | null
  completedAt: string | null
  /** Regreso al depósito confirmado por el chofer. */
  returnedAt: string | null
  stops: MonitorStop[]
}

export interface RouteProgress {
  total: number
  delivered: number
  failed: number
  /** Visitas con resultado (entregadas + fallidas). */
  resolved: number
  /** Porcentaje de entregas exitosas sobre el total de paradas. */
  deliveredPercent: number
}
