import { apiClient } from '../../lib/http/apiClient'
import type {
  ConfirmRouteInput,
  ProposalsQuery,
  RouteOrderSummary,
  RouteProposalsResponse,
  RouteStatus,
  SavedRoute,
  SavedRouteDetail,
} from './types'

/** Con miles de pedidos el cálculo tarda del orden de segundos; más de esto se considera una falla. */
const REQUEST_TIMEOUT_MS = 30_000

/** Lo que usamos de cada elemento de `GET /routes` (la respuesta trae bastante más). */
interface RawRoute {
  id: string
  status: RouteStatus
  date: string
  zone: { code: string; name: string }
  driver: { user: { name: string } } | null
  orders: RouteOrderSummary[]
}

/** Paradas por orden de visita; las que no tienen posición van al final. */
const byStopOrder = (a: RouteOrderSummary, b: RouteOrderSummary): number =>
  (a.stopOrder ?? Number.MAX_SAFE_INTEGER) - (b.stopOrder ?? Number.MAX_SAFE_INTEGER)

/** Copia solo los campos necesarios: lo demás (por ejemplo, el hash de contraseña del chofer) se descarta. */
const toRouteDetail = (raw: RawRoute): SavedRouteDetail => ({
  id: raw.id,
  status: raw.status,
  date: raw.date,
  zoneCode: raw.zone.code,
  zoneName: raw.zone.name,
  driverName: raw.driver?.user.name ?? null,
  orders: raw.orders
    .map(({ id, deliveryAddress, stopOrder }) => ({ id, deliveryAddress, stopOrder }))
    .sort(byStopOrder),
})

export const planningService = {
  /** Calcula las propuestas del día. No escribe nada: se puede repetir sin duplicar registros. */
  async getProposals(query: ProposalsQuery): Promise<RouteProposalsResponse> {
    const { data } = await apiClient.get<RouteProposalsResponse>('/route-proposals', {
      params: query,
      timeout: REQUEST_TIMEOUT_MS,
    })
    return data
  },

  /** Confirma una propuesta: persiste la ruta como DRAFT (sin chofer asignado). */
  async confirmRoute(input: ConfirmRouteInput): Promise<SavedRoute> {
    const { data } = await apiClient.post<SavedRoute>('/routes', input, {
      timeout: REQUEST_TIMEOUT_MS,
    })
    return data
  },

  /** Rutas guardadas (todas las fechas y zonas), con sus paradas y chofer. */
  async listRoutes(): Promise<SavedRouteDetail[]> {
    const { data } = await apiClient.get<RawRoute[]>('/routes')
    return data.map(toRouteDetail)
  },

  /** Asigna un chofer disponible a una ruta DRAFT; la ruta pasa a ASSIGNED (todavía sin iniciar). */
  async assignDriver(routeId: string, driverId: string): Promise<SavedRoute> {
    const { data } = await apiClient.post<SavedRoute>(
      `/routes/${routeId}/assign`,
      { driverId },
      { timeout: REQUEST_TIMEOUT_MS },
    )
    return data
  },
}
