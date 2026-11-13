/**
 * Custodia de una unidad tras una emergencia en ruta (backend #51). Cada unidad pendiente al
 * interrumpir la ruta se sigue por separado:
 * - `PENDING`: el producto todavía no volvió a la tienda.
 * - `RECOVERED`: un ADMIN confirmó su retorno físico.
 * - `LOST_PREPARED` / `LOST_PENDING`: tiene una pérdida (#52) con reemplazo preparado o pendiente.
 */
export type EmergencyUnitStatus = 'PENDING' | 'RECOVERED' | 'LOST_PENDING' | 'LOST_PREPARED'

export interface EmergencyUnit {
  id: string
  emergencyId: string
  routeId: string
  stopId: string
  orderId: string
  orderItemId: string
  unitNumber: number
  productId: string
  status: EmergencyUnitStatus
  /** Recuperada o cubierta por un reemplazo preparado. */
  resolved: boolean
  recoveredAt: string | null
  recoveredById: string | null
  lossId: string | null
  replacementPreparedAt: string | null
  lossRecoveredAt: string | null
}

export interface EmergencyCounts {
  totalUnits: number
  recoveredUnits: number
  lostPreparedUnits: number
  lostPendingUnits: number
  pendingUnits: number
}

/** Emergencia de una ruta (`GET /dispatch/emergencies`). */
export interface RouteEmergency {
  id: string
  routeId: string
  reason: string
  declaredAt: string
  declaredById: string
  /** Cierre administrativo del incidente: no oculta las unidades pendientes. */
  closedAt: string | null
  closedById: string | null
  closeReason: string | null
  driverId: string | null
  /** Retorno del repartidor confirmado (por él desde la app o por un ADMIN). */
  returnedAt: string | null
  returnedById: string | null
  counts: EmergencyCounts
  pendingUnits: EmergencyUnit[]
}

/** Detalle con todas las unidades (`GET /dispatch/routes/:id/emergency`). */
export interface RouteEmergencyDetail extends RouteEmergency {
  units: EmergencyUnit[]
}
