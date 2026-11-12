import { apiClient } from '../../lib/http/apiClient'
import type {
  AbsenceInput,
  CreatedDriver,
  DriverAbsence,
  DriverDayAvailability,
  DriverProfile,
  DriverProfileInput,
} from './types'

const driverPath = (id: string) => `/drivers/${encodeURIComponent(id)}`

/** Gestión ADMIN de repartidores (backend #43) y de sus ausencias (backend #44). */
export const driversAdminService = {
  async list(): Promise<DriverProfile[]> {
    const { data } = await apiClient.get<DriverProfile[]>('/drivers')
    return data
  },

  /** Crea el repartidor; la contraseña temporal de la respuesta no se puede volver a obtener. */
  async create(input: DriverProfileInput): Promise<CreatedDriver> {
    const { data } = await apiClient.post<CreatedDriver>('/drivers', input)
    return data
  },

  /** Corrige solo los campos enviados; no toca rutas, reservas ni disponibilidad. */
  async update(id: string, changes: Partial<DriverProfileInput>): Promise<DriverProfile> {
    const { data } = await apiClient.patch<DriverProfile>(driverPath(id), changes)
    return data
  },

  /** Ausencias activas que terminan desde hoy (o desde `from`). */
  async absences(id: string, from?: string): Promise<DriverAbsence[]> {
    const { data } = await apiClient.get<DriverAbsence[]>(`${driverPath(id)}/absences`, {
      params: from ? { from } : {},
    })
    return data
  },

  /** Registra la ausencia; si choca con rutas asignadas las devuelve en `conflicts`. */
  async addAbsence(id: string, input: AbsenceInput): Promise<DriverAbsence> {
    const { data } = await apiClient.post<DriverAbsence>(`${driverPath(id)}/absences`, input)
    return data
  },

  /** Anula una ausencia (no se edita ni se borra). */
  async cancelAbsence(id: string, absenceId: string, reason?: string): Promise<DriverAbsence> {
    const { data } = await apiClient.post<DriverAbsence>(
      `${driverPath(id)}/absences/${encodeURIComponent(absenceId)}/cancel`,
      reason ? { reason } : {},
    )
    return data
  },

  /** Disponibilidad de un día (hoy o futuro), incluida la ausencia de ese día. */
  async availabilityOn(id: string, date: string): Promise<DriverDayAvailability> {
    const { data } = await apiClient.get<DriverDayAvailability>(`${driverPath(id)}/availability`, {
      params: { date },
    })
    return data
  },
}
