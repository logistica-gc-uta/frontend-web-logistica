import type { GeoPoint } from '../../types/geo'

export interface RouteProposalStop {
  /** Posición en la visita, desde 1. */
  sequence: number
  orderId: string
  location: GeoPoint
  deliveryAddress: string
  /** Instante ISO 8601 programado para la entrega. */
  scheduledDeliveryDate: string
  /** Km por calles desde el punto anterior (el depósito para la primera). Solo con motor vial. */
  legDistanceKm?: number
  /** Segundos estimados desde el punto anterior, sin tráfico en vivo. Solo con motor vial. */
  legDurationSeconds?: number
}

/** Cómo se midieron las distancias: en línea recta o por la red vial (backend #47). */
export type DistanceMethod = 'HAVERSINE_STRAIGHT_LINE' | 'OSRM_ROAD_NETWORK'

/** Trazado por calles (GeoJSON, `[lng, lat]`): depósito → paradas → depósito. */
export interface RoadGeometry {
  type: 'LineString'
  coordinates: [number, number][]
}

/** Qué significan las métricas viales: siempre estimadas y sin tráfico en vivo. */
export interface RoadMetricsInfo {
  provider: string
  profile: string
  distanceUnit: string
  durationUnit: string
  directional: boolean
  trafficAware: boolean
  estimate: boolean
  maxSnapDistanceM: number
}

/** Estado del motor vial (`GET /route-proposals/road-engine`). */
export interface RoadEngineStatus {
  engine: 'HAVERSINE' | 'OSRM'
  configured: boolean
  available: boolean
  profile: string | null
  latencyMs: number | null
  checkedAt: string
  message: string
}

/** Ruta propuesta por el planificador (Clarke & Wright). Es temporal: no se guarda hasta confirmarla. */
export interface RouteProposal {
  /** `null` en propuestas sin zona que salen de la tienda (backend #49). */
  zoneId: string | null
  zoneCode: string | null
  /** Punto donde la ruta empieza y termina: la tienda, o el depósito de la zona si no hay tienda. */
  depot: GeoPoint
  /** Pedidos en orden de visita (1 a 4). */
  orderIds: string[]
  stops: RouteProposalStop[]
  /** Recorrido depósito → paradas → depósito, en km: por calles con motor vial o en línea recta. */
  totalDistanceKm: number
  /** La misma visita en línea recta, para contrastar. Solo con motor vial. */
  straightLineKm?: number
  /** Duración estimada de la vuelta completa, en segundos. Solo con motor vial. */
  totalDurationSeconds?: number
  /** Tramo de regreso al depósito. Solo con motor vial. */
  returnLegDistanceKm?: number
  returnLegDurationSeconds?: number
  /** Trazado por calles para el mapa. Solo con motor vial activo. */
  geometry?: RoadGeometry
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
  /** `OSRM_ROAD_NETWORK` con motor vial; `HAVERSINE_STRAIGHT_LINE` sin él. */
  distanceMethod: DistanceMethod
  /** Solo con motor vial. */
  roadMetrics?: RoadMetricsInfo
  /** La fecha consultada es hoy en Ecuador (backend #49). */
  isToday: boolean
  /** Solo hoy se pueden confirmar y asignar las propuestas; otro día es una vista previa. */
  canConfirm: boolean
  /** Diferencia máxima, en minutos, entre las horas pedidas de una misma ruta (backend #48). */
  timeWindowMarginMinutes: number
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
  /** `null` para una ruta sin zona que sale de la tienda (backend #49). */
  zoneId: string | null
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
  /** Cuándo se confirmó; ordena la lista para que cada ruta conserve su número. */
  createdAt: string
  /** Sin zona (`null`), la ruta sale de la tienda y se muestra como «Tienda» (backend #49). */
  zoneId: string | null
  zoneCode: string
  zoneName: string
  driverId: string | null
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
  /**
   * Por qué no está disponible: `ROUTE_HOLD` si tiene una ruta (queda libre cuando confirma su
   * regreso al depósito) o `MARKED_UNAVAILABLE` si está marcado como no disponible.
   */
  unavailableReason: DriverUnavailableReason | null
}

/** `ABSENT`: tiene una ausencia registrada para el día de la ruta (backend #44). */
export type DriverUnavailableReason = 'ROUTE_HOLD' | 'MARKED_UNAVAILABLE' | 'ABSENT'

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
