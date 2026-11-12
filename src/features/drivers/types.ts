/** Perfil de repartidor tal como lo devuelve `GET /drivers` (ADMIN). Nunca trae hashes. */
export interface DriverProfile {
  id: string
  userId: string
  vehicle: string
  createdAt: string
  user: { id: string; name: string; email: string }
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

/** `GET /drivers/:id/availability?date=`: disponibilidad de un día, incluida la ausencia. */
export interface DriverDayAvailability {
  isAvailable: boolean
  hasPersistedHolds: boolean
  compatibilityFlagBlocks: boolean
  blockingRouteIds: string[]
  date: string
  absence: { id: string; startDate: string; endDate: string; reason: string | null } | null
}
