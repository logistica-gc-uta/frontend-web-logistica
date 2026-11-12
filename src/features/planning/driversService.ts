import { apiClient } from '../../lib/http/apiClient'
import { todayInGuayaquil } from '../../lib/time/guayaquil'
import type { Driver, DriverUnavailableReason } from './types'

/** Lo que usamos de cada elemento de `GET /drivers` (la respuesta trae bastante más). */
interface RawDriver {
  id: string
  vehicle: string
  user: { name: string }
  effectiveAvailability: { isAvailable: boolean; hasPersistedHolds: boolean }
}

const unavailableReason = ({
  isAvailable,
  hasPersistedHolds,
}: RawDriver['effectiveAvailability']): DriverUnavailableReason | null => {
  if (isAvailable) return null
  return hasPersistedHolds ? 'ROUTE_HOLD' : 'MARKED_UNAVAILABLE'
}

/** Copia solo los campos necesarios: lo demás (por ejemplo, el hash de contraseña) se descarta. */
const toDriver = (raw: RawDriver): Driver => ({
  id: raw.id,
  name: raw.user.name,
  vehicle: raw.vehicle,
  isAvailable: raw.effectiveAvailability.isAvailable,
  unavailableReason: unavailableReason(raw.effectiveAvailability),
})

/** Lo que usamos de `GET /drivers/:id/availability?date=` (backend #44). */
interface DayAvailability {
  isAvailable: boolean
  absence: unknown | null
}

export const driversService = {
  /** Choferes con su disponibilidad efectiva (solo ADMIN). */
  async list(): Promise<Driver[]> {
    const { data } = await apiClient.get<RawDriver[]>('/drivers')
    return data.map(toDriver)
  },

  /**
   * Choferes para asignar rutas de `day` (aaaa-mm-dd). El listado no trae ausencias, así que se
   * consulta la disponibilidad de ese día: un chofer ausente no se ofrece aunque no tenga reservas.
   * Si una consulta falla, queda como en el listado; el backend igual rechaza con `DRIVER_ABSENT`.
   */
  async listForDay(day: string): Promise<Driver[]> {
    const drivers = await driversService.list()
    if (day < todayInGuayaquil()) return drivers
    return Promise.all(
      drivers.map(async (driver) => {
        try {
          const { data } = await apiClient.get<DayAvailability>(
            `/drivers/${encodeURIComponent(driver.id)}/availability`,
            { params: { date: day } },
          )
          return data.absence
            ? { ...driver, isAvailable: false, unavailableReason: 'ABSENT' as const }
            : driver
        } catch {
          return driver
        }
      }),
    )
  },
}
