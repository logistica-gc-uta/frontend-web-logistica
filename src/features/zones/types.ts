import type { GeoPoint } from '../../types/geo'

/** Zona de entrega tal como la devuelve GET /zones. */
export interface Zone {
  id: string
  name: string
  code: string
  createdAt: string
  /** Depósito de la zona; es `null` mientras no se haya configurado. */
  depotLat: number | null
  depotLng: number | null
  depotLocation: GeoPoint | null
}

/** Cuerpo de POST /zones (CreateZoneDto). Se declara como `type` para usarlo con `useForm`. */
export type CreateZoneInput = {
  name: string
  code: string
}
