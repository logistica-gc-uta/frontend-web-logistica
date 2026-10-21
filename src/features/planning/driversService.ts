import { apiClient } from '../../lib/http/apiClient'
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

export const driversService = {
  /** Choferes con su disponibilidad efectiva (solo ADMIN). */
  async list(): Promise<Driver[]> {
    const { data } = await apiClient.get<RawDriver[]>('/drivers')
    return data.map(toDriver)
  },
}
