/** Acciones administrativas auditadas de `POST /dispatch/interventions`. */
export type DispatchAction =
  | 'CONFIRM'
  | 'REJECT'
  | 'REORDER'
  | 'MOVE'
  | 'REASSIGN_DRIVER'
  | 'PRIORITIZE'
  | 'CONTACT'
  | 'RESCHEDULE'

/** `REJECTED` es el resultado correcto de un rechazo; `FAILED` nunca es un éxito. */
export type DispatchOutcome = 'APPLIED' | 'REJECTED' | 'FAILED'

/** Registro de auditoría de una decisión (respuesta de `POST /dispatch/interventions` y de `GET /dispatch/audit`). */
export interface DispatchAudit {
  id: string
  action: DispatchAction
  outcome: DispatchOutcome
  /** Usuario ADMIN que tomó la decisión (lo fija el backend a partir del token). */
  actorId: string
  orderId: string | null
  routeId: string | null
  reason: string
  /** Instante ISO 8601 en que se registró. */
  recordedAt: string
}

/** Reordenar las paradas de una ruta todavía no iniciada: `orderIds` son las mismas paradas en el nuevo orden. */
export interface ReorderStopsInput {
  routeId: string
  orderIds: string[]
  /** Motivo de la corrección (queda auditado por el backend). */
  reason: string
}

/** Pasar un pedido a otra ruta no iniciada del mismo día y zona. */
export interface MoveOrderInput {
  routeId: string
  orderId: string
  targetRouteId: string
  /** Motivo de la corrección (queda auditado por el backend). */
  reason: string
}

/**
 * Propuesta temporal para un pedido urgente (solo lectura):
 * - `INSERT`: cabe en una ruta de hoy no iniciada y con lugar.
 * - `NEW_ROUTE`: ninguna ruta sirve (completas o ya iniciadas); se propone una salida nueva.
 * - `BLOCKED`: no se puede despachar; `reasons` explica por qué.
 */
export type UrgencyKind = 'INSERT' | 'NEW_ROUTE' | 'BLOCKED'

export interface UrgencyProposal {
  orderId: string
  kind: UrgencyKind
  /** Ruta en la que se insertaría (`INSERT`). */
  routeId: string | null
  zoneId: string
  /** Pedidos de la ruta propuesta en orden de visita. */
  orderIds: string[]
  /** Choferes efectivamente disponibles para una salida nueva. */
  availableDriverIds: string[]
  /** Códigos del backend; pueden aparecer códigos nuevos. */
  reasons: string[]
  totalDistanceKm: number
  /** Huella de la propuesta: confirmar con una huella vieja da 409. */
  fingerprint: string
}

/** Bandeja del día (`GET /dispatch/inbox`). Las entregas fallidas se cuentan, pero se gestionan aparte. */
export interface UrgencyInbox {
  /** Día operativo (aaaa-mm-dd, Guayaquil). */
  date: string
  urgencies: UrgencyProposal[]
  /** Pedidos con una entrega fallida pendiente de revisión (bandeja de fallos, fuera de esta pantalla). */
  failedDeliveries: number
}

/** Acuerdo de nueva entrega para reprogramar un pedido urgente. Instantes ISO 8601 con desfase. */
export interface RescheduleInput {
  orderId: string
  scheduledDeliveryDate: string
  deliveryWindowStart: string
  deliveryWindowEnd: string
  reason: string
}
