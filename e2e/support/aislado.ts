import type { Api } from './api'
import { API_URL, uniqueSuffix } from './env'
import { at, guayaquilTimeIn, todayInGuayaquil } from './time'

/**
 * Entorno aislado del #69: PostgreSQL descartable (e2e/aislado/docker-compose.yml), backend real
 * en el puerto 3101 y el panel en el 5181. Estas pruebas cambian el horario de entrega de la tienda
 * y operan con el chofer del seed HOY, así que nunca corren contra la base de desarrollo ni contra
 * un servicio desplegado.
 */
export const ISOLATED_API_PORTS = new Set(['3001', '3101'])

export function isolatedEnvironmentProblem(): string | null {
  if (process.env.E2E_AISLADO !== '1')
    return 'Se ejecuta solo con E2E_AISLADO=1 (ver docs/evidencias/69-e2e-aislado.md)'
  const api = new URL(process.env.VITE_API_URL ?? API_URL)
  if (api.hostname !== 'localhost' && api.hostname !== '127.0.0.1')
    return `La API ${api.origin} no es local: nunca se ejecuta contra un servicio desplegado`
  if (!ISOLATED_API_PORTS.has(api.port))
    return `La API ${api.origin} no es el backend aislado (puerto 3001 o 3101)`
  return null
}

export async function setDeliverySchedule(
  admin: Api,
  startTime: string,
  endTime: string,
): Promise<{ startTime: string; endTime: string }> {
  const settings = await admin.get<{
    version: number
    deliverySchedule: { startTime: string; endTime: string }
  }>('/admin/shop-settings')
  const previous = {
    startTime: settings.deliverySchedule.startTime,
    endTime: settings.deliverySchedule.endTime,
  }
  if (previous.startTime === startTime && previous.endTime === endTime) return previous
  await admin.patch('/admin/shop-settings', {
    expectedVersion: settings.version,
    deliverySchedule: { startTime, endTime },
  })
  return previous
}

/**
 * Abre el horario de entrega a todo el día (00:01–23:59) en la base descartable: asignar exige rutas
 * de HOY, y así el recorrido se puede repetir a cualquier hora (incluso de noche) sin romper la
 * validación del formulario de Configuración Shop (inicio > 00:00).
 */
export async function openFullDaySchedule(
  admin: Api,
): Promise<{ startTime: string; endTime: string }> {
  return setDeliverySchedule(admin, '01:00', '23:59')
}

/** Producto propio con precio y stock, sin publicar (la venta ADMIN no necesita imagen). */
export async function createPricedProduct(admin: Api): Promise<string> {
  const suffix = uniqueSuffix()
  const category = await admin.post<{ id: string }>('/admin/catalog/categories', {
    name: `E2E 69 ${suffix}`,
    slug: `e2e-69-${suffix.toLowerCase()}`,
    isActive: true,
  })
  const product = await admin.post<{ id: string }>('/admin/catalog/products', {
    sku: `E2E-69-${suffix}`,
    name: `E2E 69 Producto ${suffix}`,
    description: 'Producto de prueba E2E #69.',
    categoryId: category.id,
    priceCents: 500,
    stock: 50,
    isPublished: false,
  })
  return product.id
}

/** Venta ADMIN de hoy, unos minutos más tarde, cerca de la tienda del seed (dentro de cobertura). */
export async function createTodayOrder(
  admin: Api,
  { productId, label, k }: { productId: string; label: string; k: number },
): Promise<{ id: string; address: string; scheduledAt: string }> {
  const store = (await admin.get<{ location: { lat: number; lng: number } }>('/store-coverage'))
    .location
  const address = `E2E 69 ${label} ${uniqueSuffix()}`
  const scheduledAt = at(todayInGuayaquil(), guayaquilTimeIn(20))
  const order = await admin.post<{ id: string }>(
    '/orders/admin',
    {
      buyer: { type: 'GUEST', name: `E2E Comprador ${label}`, contactPhone: '0990000000' },
      payment: { method: 'CASH' },
      deliveryAddress: address,
      items: [{ productId, quantity: 1 }],
      scheduledDeliveryDate: scheduledAt,
      deliveryLat: store.lat + 0.0015 * k,
      deliveryLng: store.lng - 0.0012 * k,
    },
    { 'Idempotency-Key': crypto.randomUUID() },
  )
  return { id: order.id, address, scheduledAt }
}

/** Ruta de hoy con esos pedidos, confirmada como borrador y asignada al chofer. */
export async function createAssignedRoute(
  admin: Api,
  {
    orderIds,
    scheduledAt,
    driverId,
  }: { orderIds: string[]; scheduledAt: string; driverId: string },
): Promise<string> {
  const route = await admin.post<{ id: string }>('/routes', {
    zoneId: null,
    routeDate: scheduledAt,
    orderIds,
  })
  await admin.post(`/routes/${route.id}/assign`, { driverId })
  return route.id
}

export interface IsolatedRoute {
  id: string
  status: string
  cancelledAt?: string | null
  cancelReason?: string | null
  stops: { id: string; orderId: string; outcome: string | null }[]
}

export const routeById = async (admin: Api, id: string) =>
  (await admin.get<IsolatedRoute[]>('/routes')).find((route) => route.id === id)

export interface IsolatedIncident {
  orderId: string
  routeId: string | null
  status: string
  latestFailedAttemptId: string | null
  readiness: { attemptId: string; confirmedAt: string } | null
  allowedActions: Record<string, { allowed: boolean; reasonCode: string | null }>
}

export const incidentOf = async (admin: Api, orderId: string) =>
  (await admin.get<{ incidents: IsolatedIncident[] }>('/dispatch/inbox')).incidents.find(
    (incident) => incident.orderId === orderId,
  )

/** ¿Queda tiempo hoy para crear pedidos de hoy y recorrer las pruebas sin cruzar la medianoche? */
export const hasTimeToday = (): boolean => {
  const now = guayaquilTimeIn(0)
  const later = guayaquilTimeIn(40)
  return now < later && later <= '23:59'
}
