import type { DistanceMethod } from '../planning/types'

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
  /** Cómo se midió la distancia (#47); los backends anteriores no lo envían. */
  distanceMethod?: DistanceMethod
  /** Huella de la propuesta: confirmar con una huella vieja da 409. */
  fingerprint: string
}

/** Intento de entrega fallido tal como lo lista la bandeja (sin el texto libre del chofer). */
export interface FailedAttempt {
  id: string
  stopId: string
  /** Motivo tipificado (`RECIPIENT_ABSENT`, `RECIPIENT_REFUSED`, …). */
  failureReason: string | null
  recordedAt: string
}

/**
 * Pedido con una entrega fallida que espera gestión del ADMIN. No está cancelado ni entregado:
 * conserva su estado comercial y queda en revisión hasta reprogramarse.
 */
export interface FailedDelivery {
  orderId: string
  /** Ruta a la que apunta el pedido ahora (puede ser `null` tras cerrarse la ruta). */
  routeId: string | null
  /** Intentos fallidos, el más reciente primero. */
  attempts: FailedAttempt[]
}

/** Bandeja del día (`GET /dispatch/inbox`): urgencias por despachar y entregas fallidas por gestionar. */
export interface UrgencyInbox {
  /** Día operativo (aaaa-mm-dd, Guayaquil). */
  date: string
  urgencies: UrgencyProposal[]
  failedDeliveries: FailedDelivery[]
}

/** Fecha y franja acordadas con el destinatario (instantes ISO 8601 con desfase). */
export interface DeliveryAgreement {
  scheduledDeliveryDate: string
  deliveryWindowStart: string
  deliveryWindowEnd: string
}

/** Gestión de contacto con el destinatario; sin acuerdo solo queda registrada. */
export interface ContactInput {
  orderId: string
  /** Último intento fallido; se omite para un pedido urgente sin fallos. */
  attemptId?: string
  agreement: DeliveryAgreement | null
  reason: string
}

/** Acuerdo de nueva entrega para reprogramar un pedido urgente. Instantes ISO 8601 con desfase. */
export interface RescheduleInput {
  orderId: string
  scheduledDeliveryDate: string
  deliveryWindowStart: string
  deliveryWindowEnd: string
  reason: string
}
