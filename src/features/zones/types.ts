/** Zona de entrega tal como la devuelve GET /zones. */
export interface Zone {
  id: string
  name: string
  code: string
  createdAt: string
}

/** Cuerpo de POST /zones (CreateZoneDto). Se declara como `type` para usarlo con `useForm`. */
export type CreateZoneInput = {
  name: string
  code: string
}
