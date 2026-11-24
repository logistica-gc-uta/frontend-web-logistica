import { apiAs, type Api } from './api'
import { credentialsFor, uniqueSuffix } from './env'

/**
 * Datos propios de cada ejecución, creados con la API real: zona con depósito, producto y pedidos
 * con prefijo `E2E`. Así las pruebas no dependen de datos ajenos ni consumen el stock del seed.
 */
export interface Zone {
  id: string
  code: string
  depot: { lat: number; lng: number }
}

export interface RawRoute {
  id: string
  status: 'DRAFT' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED'
  zone: { code: string }
  orders: { id: string; deliveryAddress: string }[]
  stops: { id: string; orderId: string; sequence: number | null; outcome: string | null }[]
}

export interface Order {
  id: string
  status: string
  deliveryAddress: string
  scheduledDeliveryDate: string | null
  /** `null` en ventas sin zona (#42). */
  zoneId: string | null
}

interface Proposal {
  routeDate: string
  orderIds: string[]
}

/** Depósito de las zonas de prueba (Riobamba), lejos de las zonas del seed. */
const DEPOT = { lat: -1.2539, lng: -78.6211 }

export async function createZone(admin: Api, label: string): Promise<Zone> {
  const suffix = uniqueSuffix()
  const zone = await admin.post<{ id: string; code: string }>('/zones', {
    name: `E2E ${label} ${suffix}`,
    code: `E2E-${suffix}`,
    depotLat: DEPOT.lat,
    depotLng: DEPOT.lng,
  })
  return { id: zone.id, code: zone.code, depot: DEPOT }
}

export async function createProduct(admin: Api, stock = 20): Promise<string> {
  const product = await admin.post<{ id: string }>('/products', {
    name: `E2E Producto ${uniqueSuffix()}`,
    price: 5,
    stock,
  })
  return product.id
}

export interface NewOrder {
  zone: Zone
  productId: string
  /** Fecha y hora ISO con zona (por ejemplo `2061-03-02T10:00:00-05:00`). */
  scheduledAt: string
  /** Desplazamiento desde el depósito, para que cada parada tenga su propio punto. */
  k: number
}

export async function createOrder(admin: Api, { zone, productId, scheduledAt, k }: NewOrder) {
  const address = `E2E Parada ${k} ${uniqueSuffix()}`
  // Venta ADMIN (backend #45). Se envía `zoneId` (opcional desde #42) para que el pedido siga
  // siendo planificable: la planificación omite los pedidos sin zona hasta backend #49.
  const order = await admin.post<{ id: string }>(
    '/orders/admin',
    {
      buyer: { type: 'GUEST', name: `E2E Comprador ${k}`, contactPhone: '0990000000' },
      payment: { method: 'CASH' },
      zoneId: zone.id,
      deliveryAddress: address,
      items: [{ productId, quantity: 1 }],
      scheduledDeliveryDate: scheduledAt,
      deliveryLat: zone.depot.lat + 0.0012 * k,
      deliveryLng: zone.depot.lng + 0.0009 * k,
    },
    { 'Idempotency-Key': crypto.randomUUID() },
  )
  return { id: order.id, address }
}

export const getOrder = (admin: Api, id: string) => admin.get<Order>(`/orders/${id}`)

export const listRoutes = (admin: Api) => admin.get<RawRoute[]>('/routes')

/** Rutas guardadas que contienen el pedido (para comprobar que no se duplicó ninguna). */
export const routesWithOrder = async (admin: Api, orderId: string) =>
  (await listRoutes(admin)).filter((route) => route.stops.some((stop) => stop.orderId === orderId))

export const stopOf = async (admin: Api, routeId: string, orderId: string) =>
  (await listRoutes(admin))
    .find((route) => route.id === routeId)
    ?.stops.find((stop) => stop.orderId === orderId)

/** Confirma como DRAFT la propuesta del día que contiene el pedido y se la asigna al chofer. */
export async function planAndAssign(
  admin: Api,
  {
    zone,
    date,
    orderId,
    driverId,
  }: { zone: Zone; date: string; orderId: string; driverId: string },
): Promise<RawRoute> {
  const { proposals } = await admin.get<{ proposals: Proposal[] }>(
    `/route-proposals?date=${date}&zoneId=${zone.id}`,
  )
  const proposal = proposals.find((candidate) => candidate.orderIds.includes(orderId))
  if (!proposal) throw new Error(`No hay propuesta para el pedido ${orderId}`)
  const route = await admin.post<{ id: string }>('/routes', {
    zoneId: zone.id,
    routeDate: proposal.routeDate,
    orderIds: proposal.orderIds,
  })
  await admin.post(`/routes/${route.id}/assign`, { driverId })
  return (await listRoutes(admin)).find((candidate) => candidate.id === route.id)!
}

interface RawDriver {
  id: string
  user: { email: string }
  effectiveAvailability: { isAvailable: boolean }
}

/** Chofer del seed (el de `.env.integration.local`); debe estar disponible para empezar. */
export async function seedDriver(admin: Api): Promise<{ id: string; isAvailable: boolean }> {
  const { email } = credentialsFor('DRIVER')
  const driver = (await admin.get<RawDriver[]>('/drivers')).find(({ user }) => user.email === email)
  if (!driver) throw new Error('No se encontró al chofer del seed')
  return { id: driver.id, isAvailable: driver.effectiveAvailability.isAvailable }
}

/**
 * Acciones del chofer con su propio token, con los mismos endpoints que la app Flutter. Playwright
 * prueba el panel web: la app móvil no se cubre aquí.
 */
export async function driverActions() {
  const api = await apiAs('DRIVER')
  return {
    start: (routeId: string) => api.post(`/routes/${routeId}/start`),
    deliver: async (orderId: string) => {
      await api.patch(`/orders/${orderId}/status`, { status: 'IN_TRANSIT' })
      await api.patch(`/orders/${orderId}/status`, { status: 'DELIVERED' })
    },
    fail: (routeId: string, stopId: string) =>
      api.post(`/routes/${routeId}/stops/${stopId}/failure`, {
        reason: 'RECIPIENT_ABSENT',
        context: 'E2E: nadie atendió',
        requestId: crypto.randomUUID(),
      }),
    complete: (routeId: string) => api.post(`/routes/${routeId}/complete`),
    returnToDepot: (routeId: string) => api.post(`/routes/${routeId}/return`),
    dispose: () => api.dispose(),
  }
}
