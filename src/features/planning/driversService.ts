import { apiClient } from '../../lib/http/apiClient'
import type { Driver } from './types'

/** Lo que usamos de cada elemento de `GET /drivers` (la respuesta trae bastante más). */
interface RawDriver {
  id: string
  vehicle: string
  user: { name: string }
  effectiveAvailability: { isAvailable: boolean }
}

/** Copia solo los campos necesarios: lo demás (por ejemplo, el hash de contraseña) se descarta. */
const toDriver = (raw: RawDriver): Driver => ({
  id: raw.id,
  name: raw.user.name,
  vehicle: raw.vehicle,
  isAvailable: raw.effectiveAvailability.isAvailable,
})

export const driversService = {
  /** Choferes con su disponibilidad efectiva (solo ADMIN). */
  async list(): Promise<Driver[]> {
    const { data } = await apiClient.get<RawDriver[]>('/drivers')
    return data.map(toDriver)
  },
}
