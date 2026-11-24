/** Capacidad por defecto (en unidades de producto) cuando el vehículo no tiene una explícita. */
export const DEFAULT_VEHICLE_CAPACITY = 4
/** Máximo admitido por PostgreSQL int4. */
export const MAX_VEHICLE_CAPACITY = 2_147_483_647

/** Perfil de repartidor tal como lo devuelve `GET /drivers` (ADMIN). Nunca trae hashes. */
export interface DriverProfile {
  id: string
  userId: string
  vehicle: string
  /** Capacidad del vehículo en unidades de producto (`null` usa 4 por defecto). */
  vehicleCapacity?: number | null
  createdAt: string
  user: { id: string; name: string; email: string }
  /**
   * Baja operativa reversible (backend #82). Un registro sin el campo cuenta como activo: solo
   * `false` es una baja. Dado de baja no puede iniciar sesión ni recibir rutas.
   */
  isActive?: boolean
  /** Último cambio de estado: cuándo y por qué (visible en el historial del backend). */
  statusChangedAt?: string | null
  statusReason?: string | null
  /** Disponibilidad efectiva de hoy (rutas/reservas), sin ausencias: ver `DriverDayAvailability`. */
  effectiveAvailability: {
    isAvailable: boolean
    hasPersistedHolds: boolean
    compatibilityFlagBlocks: boolean
    blockingRouteIds: string[]
  }
}

/** `POST /drivers`: el perfil creado y su contraseña temporal, que solo llega UNA vez. */
export interface CreatedDriver extends DriverProfile {
  temporaryPassword: string
}

export interface DriverProfileInput {
  name: string
  email: string
  vehicle: string
  vehicleCapacity?: number | null
}

/** Valores editables en el formulario de perfil de repartidor. */
export interface DriverProfileFormValues {
  name: string
  email: string
  vehicle: string
  vehicleCapacity?: string
}

/** Ruta asignada o en curso que cae dentro de una ausencia. Solo informa: nada se cambia solo. */
export interface AbsenceConflict {
  routeId: string
  status: string
  date: string
  orderIds: string[]
}

/** Ausencia de un repartidor: rango cerrado de días operativos de Ecuador (`aaaa-mm-dd`). */
export interface DriverAbsence {
  id: string
  driverId: string
  startDate: string
  endDate: string
  reason: string | null
  status: 'ACTIVE' | 'CANCELLED'
  createdAt: string
  cancelledAt: string | null
  cancelReason: string | null
  conflicts: AbsenceConflict[]
}

export interface AbsenceInput {
  startDate: string
  endDate: string
  reason?: string
}

/** Ruta que impide dar de baja a un repartidor (`DRIVER_HAS_OPEN_ROUTE`, backend #82). */
export interface BlockingRoute {
  routeId: string
  status: string | null
  /** `true` si el regreso al depósito ya se confirmó. */
  returnConfirmed: boolean
}

/** `GET /drivers/:id/availability?date=`: disponibilidad de un día, incluida la ausencia. */
export interface DriverDayAvailability {
  isAvailable: boolean
  hasPersistedHolds: boolean
  compatibilityFlagBlocks: boolean
  blockingRouteIds: string[]
  date: string
  absence: { id: string; startDate: string; endDate: string; reason: string | null } | null
}
