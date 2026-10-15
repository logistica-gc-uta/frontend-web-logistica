import { apiClient } from '../../lib/http/apiClient'
import { AppError } from '../../lib/errors/AppError'
import type {
  ConfirmRouteInput,
  DispatchAudit,
  MoveOrderInput,
  ReorderStopsInput,
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
  createdAt: string
  zoneId: string
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
  createdAt: raw.createdAt,
  zoneId: raw.zoneId,
  zoneCode: raw.zone.code,
  zoneName: raw.zone.name,
  driverName: raw.driver?.user.name ?? null,
  orders: raw.orders
    .map(({ id, deliveryAddress, stopOrder }) => ({ id, deliveryAddress, stopOrder }))
    .sort(byStopOrder),
})

/**
 * Corrección administrativa auditada. Cada intento lleva un `requestId` nuevo: el backend lo usa
 * para no aplicar dos veces la misma petición. Un resultado distinto de `APPLIED` no es un éxito.
 */
async function intervene(body: Record<string, unknown>): Promise<DispatchAudit> {
  const { data } = await apiClient.post<DispatchAudit>(
    '/dispatch/interventions',
    { requestId: crypto.randomUUID(), ...body },
    { timeout: REQUEST_TIMEOUT_MS },
  )
  if (data.outcome !== 'APPLIED') {
    throw new AppError('El servidor no aplicó la corrección. Revisa la lista actualizada.')
  }
  return data
}

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

  /**
   * Rutas guardadas (todas las fechas y zonas), con sus paradas y chofer, en el orden en que se
   * confirmaron. El orden de la API cambia al modificar una ruta; así cada una conserva su número.
   */
  async listRoutes(): Promise<SavedRouteDetail[]> {
    const { data } = await apiClient.get<RawRoute[]>('/routes')
    return data
      .map(toRouteDetail)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
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

  /** Cambia el orden de visita de una ruta DRAFT o ASSIGNED (`REORDER`). */
  reorderStops: ({ routeId, orderIds, reason }: ReorderStopsInput): Promise<DispatchAudit> =>
    intervene({ action: 'REORDER', routeId, orderIds, reason }),

  /** Pasa un pedido a otra ruta no iniciada del mismo día y zona (`MOVE`). */
  moveOrder: ({
    routeId,
    orderId,
    targetRouteId,
    reason,
  }: MoveOrderInput): Promise<DispatchAudit> =>
    intervene({ action: 'MOVE', routeId, orderId, targetRouteId, reason }),
}
