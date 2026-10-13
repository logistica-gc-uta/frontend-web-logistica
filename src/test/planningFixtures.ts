import type {
  Driver,
  RouteProposal,
  RouteProposalsResponse,
  RouteProposalStop,
  SavedRouteDetail,
} from '../features/planning/types'
import type { GeoPoint } from '../types/geo'

const DEPOT: GeoPoint = { lat: -1.249, lng: -78.632 }
const SCHEDULED = '2030-02-14T15:00:00Z'

const createStop = (orderId: string, sequence: number): RouteProposalStop => ({
  sequence,
  orderId,
  location: { lat: DEPOT.lat + sequence / 1000, lng: DEPOT.lng + sequence / 1000 },
  deliveryAddress: `Dirección de ${orderId}`,
  scheduledDeliveryDate: SCHEDULED,
})

/** Propuesta con los pedidos indicados, visitados en ese orden. */
export function createProposal(
  orderIds: string[],
  overrides: Partial<RouteProposal> = {},
): RouteProposal {
  return {
    zoneId: 'zone-1',
    zoneCode: 'FIC-02',
    depot: DEPOT,
    orderIds,
    stops: orderIds.map((orderId, index) => createStop(orderId, index + 1)),
    totalDistanceKm: 2.5,
    baselineKm: 6,
    savingsKm: 3.5,
    savingsPercent: 58.3,
    scheduledInstants: [SCHEDULED],
    routeDate: SCHEDULED,
    ...overrides,
  }
}

export const firstProposal = createProposal(['order-a', 'order-b', 'order-c'])
export const secondProposal = createProposal(['order-d', 'order-e'], {
  totalDistanceKm: 1.2,
  baselineKm: 2.4,
  savingsKm: 1.2,
  savingsPercent: 50,
})

/** Día con 5 pedidos candidatos: 2 rutas (3 + 2 paradas) y 1 pedido excluido por un motivo. */
export const proposalsResponse: RouteProposalsResponse = {
  date: '2030-02-14',
  timeZone: 'America/Guayaquil',
  capacity: 4,
  distanceMethod: 'HAVERSINE_STRAIGHT_LINE',
  proposals: [firstProposal, secondProposal],
  excluded: [
    {
      orderId: 'order-excluido-123456',
      zoneId: 'zone-2',
      reasons: ['MISSING_ZONE_DEPOT_COORDINATES'],
    },
  ],
  summary: {
    candidateOrders: 6,
    plannedOrders: 5,
    excludedOrders: 1,
    routes: 2,
    baselineKm: 8.4,
    plannedKm: 3.7,
    savingsKm: 4.7,
    savingsPercent: 55.95,
  },
}

export const emptyProposalsResponse: RouteProposalsResponse = {
  ...proposalsResponse,
  proposals: [],
  excluded: [],
  summary: {
    candidateOrders: 0,
    plannedOrders: 0,
    excludedOrders: 0,
    routes: 0,
    baselineKm: 0,
    plannedKm: 0,
    savingsKm: 0,
    savingsPercent: 0,
  },
}

export const savedDraft = (id = 'route-1') => ({
  id,
  status: 'DRAFT' as const,
  driverId: null,
  zoneId: 'zone-1',
  date: SCHEDULED,
  createdAt: '2026-10-13T12:00:00Z',
})

/** Ruta guardada del 14/02/2030 (10:00 en Guayaquil) con el estado indicado. */
export const savedRouteDetail = (
  id: string,
  overrides: Partial<SavedRouteDetail> = {},
): SavedRouteDetail => ({
  id,
  status: 'DRAFT',
  date: SCHEDULED,
  zoneCode: 'FIC-02',
  zoneName: 'Ficoa',
  driverName: null,
  orders: [
    { id: `${id}-o1`, deliveryAddress: `Parada 1 de ${id}`, stopOrder: 1 },
    { id: `${id}-o2`, deliveryAddress: `Parada 2 de ${id}`, stopOrder: 2 },
  ],
  ...overrides,
})

export const availableDriver: Driver = {
  id: 'driver-1',
  name: 'Carlos Chofer',
  vehicle: 'Camión Isuzu ABC-123',
  isAvailable: true,
}

export const busyDriver: Driver = {
  id: 'driver-2',
  name: 'Luis Transportista',
  vehicle: 'Furgoneta Renault XYZ-789',
  isAvailable: false,
}

/** Hash de prueba: si aparece en el estado de la interfaz, se filtró información sensible. */
export const LEAKED_HASH = '$2b$10$HASH-QUE-NUNCA-DEBE-LLEGAR-A-LA-INTERFAZ'

/** Elemento de `GET /routes` tal como lo devuelve el backend hoy (incluye el hash del chofer). */
export const rawRouteFromApi = {
  id: 'route-raw',
  status: 'ASSIGNED',
  date: SCHEDULED,
  driverId: 'driver-1',
  zoneId: 'zone-1',
  startedAt: null,
  zone: { id: 'zone-1', code: 'FIC-02', name: 'Ficoa', depotLat: -1.249, depotLng: -78.632 },
  driver: {
    id: 'driver-1',
    vehicle: 'Camión Isuzu ABC-123',
    user: { id: 'u1', name: 'Carlos Chofer', email: 'driver1@delivery.com', password: LEAKED_HASH },
  },
  orders: [
    { id: 'o2', deliveryAddress: 'Segunda parada', stopOrder: 2, recipientPhone: '0990000000' },
    { id: 'o3', deliveryAddress: 'Sin posición', stopOrder: null, recipientPhone: '0990000000' },
    { id: 'o1', deliveryAddress: 'Primera parada', stopOrder: 1, recipientPhone: '0990000000' },
  ],
}

/** Elemento de `GET /drivers` tal como lo devuelve el backend hoy (incluye el hash). */
export const rawDriverFromApi = {
  id: 'driver-1',
  userId: 'u1',
  vehicle: 'Camión Isuzu ABC-123',
  isAvailable: true,
  user: { id: 'u1', name: 'Carlos Chofer', email: 'driver1@delivery.com', password: LEAKED_HASH },
  effectiveAvailability: {
    isAvailable: false,
    hasPersistedHolds: true,
    compatibilityFlagBlocks: false,
    blockingRouteIds: ['route-raw'],
  },
}
