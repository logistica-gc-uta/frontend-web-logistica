import type { GeoPoint } from '../../types/geo'

export interface RouteProposalStop {
  /** Posición en la visita, desde 1. */
  sequence: number
  orderId: string
  location: GeoPoint
  deliveryAddress: string
  /** Instante ISO 8601 programado para la entrega. */
  scheduledDeliveryDate: string
}

/** Ruta propuesta por el planificador (Clarke & Wright). Es temporal: no se guarda hasta confirmarla. */
export interface RouteProposal {
  zoneId: string
  zoneCode: string
  /** Depósito donde la ruta empieza y termina. */
  depot: GeoPoint
  /** Pedidos en orden de visita (1 a 4). */
  orderIds: string[]
  stops: RouteProposalStop[]
  /** Recorrido depósito → paradas → depósito, en km en línea recta. */
  totalDistanceKm: number
  /** Km sin optimizar: un viaje depósito → pedido → depósito por cada pedido. */
  baselineKm: number
  savingsKm: number
  savingsPercent: number
  scheduledInstants: string[]
  /** Valor a enviar a `POST /routes` para confirmar la propuesta. */
  routeDate: string
}

/** Pedido que no se pudo planificar y los motivos (códigos de `PlanningExclusionReason`). */
export interface ExcludedOrder {
  orderId: string
  zoneId: string
  reasons: string[]
}

export interface PlanningSummary {
  candidateOrders: number
  plannedOrders: number
  excludedOrders: number
  routes: number
  baselineKm: number
  plannedKm: number
  savingsKm: number
  savingsPercent: number
}

/** Respuesta de `GET /route-proposals`. */
export interface RouteProposalsResponse {
  date: string
  timeZone: string
  /** Máximo de paradas por ruta. */
  capacity: number
  /** Siempre `HAVERSINE_STRAIGHT_LINE`: distancia en línea recta, no por calles. */
  distanceMethod: string
  proposals: RouteProposal[]
  excluded: ExcludedOrder[]
  summary: PlanningSummary
}

/** Parámetros de `GET /route-proposals`. */
export interface ProposalsQuery {
  /** Día a planificar (aaaa-mm-dd, horario de Guayaquil). */
  date: string
  zoneId?: string
}

/** Cuerpo de `POST /routes`: confirma una propuesta como ruta DRAFT. */
export interface ConfirmRouteInput {
  zoneId: string
  routeDate: string
  orderIds: string[]
}

export type RouteStatus = 'DRAFT' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED'

/** Parada de una ruta guardada. */
export interface RouteOrderSummary {
  id: string
  deliveryAddress: string
  /** Posición en la visita; `null` si todavía no tiene. */
  stopOrder: number | null
}

/**
 * Ruta guardada tal como la usa la interfaz. `GET /routes` devuelve muchos más datos (incluido el
 * usuario del chofer): aquí solo se conservan los campos necesarios, a propósito.
 */
export interface SavedRouteDetail {
  id: string
  status: RouteStatus
  /** Instante del día de la ruta (ISO 8601). */
  date: string
  zoneCode: string
  zoneName: string
  driverName: string | null
  /** Paradas en orden de visita. */
  orders: RouteOrderSummary[]
}

/** Chofer que puede recibir una ruta. */
export interface Driver {
  id: string
  name: string
  vehicle: string
  /** Disponibilidad efectiva: sin rutas que lo retengan. */
  isAvailable: boolean
}

/** Ruta persistida tal como la devuelven `POST /routes` y `POST /routes/{id}/assign`. */
export interface SavedRoute {
  id: string
  /** `DRAFT`: guardada y editable. `ASSIGNED`: con chofer, todavía sin iniciar. */
  status: 'DRAFT' | 'ASSIGNED'
  driverId: string | null
  zoneId: string
  date: string
  createdAt: string
}
