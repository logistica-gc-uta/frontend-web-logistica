import { areaSuffix } from '../../lib/planning/routeArea'
import type { RealtimeSubscription } from '../../lib/realtime/realtimeClient'
import { dayInGuayaquil, todayInGuayaquil } from '../../lib/time/guayaquil'
import { dispatchService } from '../dispatch/dispatchService'
import { driversService } from '../planning/driversService'
import type { Driver } from '../planning/types'
import { monitorService } from './monitorService'
import type { MonitorRoute } from './types'

/**
 * Relaciones por id estable (#67, contrato del backend #85): qué pedidos tienen un caso en Entregas
 * fallidas y qué rutas tienen una emergencia. Si no se pudieron consultar quedan en `null` y el
 * tablero sigue funcionando, solo sin esos enlaces.
 */
export interface MonitorLinks {
  /** Pedidos con una entrega fallida pendiente de gestión. */
  failedOrderIds: Set<string>
  /** Ruta → emergencia declarada en ella. */
  emergencyByRoute: Map<string, string>
}

/** Ruta de un día anterior que sigue abierta y requiere cierre administrativo. */
export interface OverdueMonitorRoute {
  route: MonitorRoute
  name: string
  /** Día calendario de la ruta (aaaa-mm-dd, Guayaquil). */
  routeDay: string
}

/** Lo que muestra el monitor, tal como está en el servidor en el momento de la consulta. */
export interface MonitorBoard {
  /** Día mostrado (aaaa-mm-dd, Guayaquil). */
  day: string
  /** Rutas de días anteriores que siguen abiertas (sin iniciar, en curso o sin retorno al depósito). */
  overdueOpen: OverdueMonitorRoute[]
  /** Rutas de hoy con chofer (asignadas, en curso, interrumpidas o completadas), en el orden en que se crearon. */
  routes: { route: MonitorRoute; name: string }[]
  /**
   * Rutas de hoy canceladas antes de salir: no se siguen (sus pedidos volvieron a Planificación),
   * pero se informan y un enlace a una de ellas se explica (#67).
   */
  cancelled: MonitorRoute[]
  /** Rutas de hoy todavía en borrador (sin chofer): no hay nada que seguir. */
  drafts: number
  drivers: Record<string, Driver>
  links: MonitorLinks | null
  /** Instante de esta consulta. */
  loadedAt: string
}

const TRACKED = new Set(['ASSIGNED', 'IN_PROGRESS', 'INTERRUPTED', 'COMPLETED'])

function isOpenRoute(route: MonitorRoute): boolean {
  if (route.status === 'ASSIGNED' || route.status === 'IN_PROGRESS') return true
  if (route.status === 'COMPLETED' || route.status === 'INTERRUPTED') {
    return !route.returnedAt
  }
  return false
}

async function loadLinks(): Promise<MonitorLinks | null> {
  try {
    const [inbox, emergencies] = await Promise.all([
      dispatchService.inbox(),
      dispatchService.emergencies(),
    ])
    return {
      failedOrderIds: new Set(inbox.failedDeliveries.map(({ orderId }) => orderId)),
      emergencyByRoute: new Map(emergencies.map(({ routeId, id }) => [routeId, id])),
    }
  } catch {
    return null
  }
}

export async function loadMonitorBoard(now: Date = new Date()): Promise<MonitorBoard> {
  const day = todayInGuayaquil(now)
  const [routes, drivers, links] = await Promise.all([
    monitorService.listRoutes(),
    driversService.list(),
    loadLinks(),
  ])
  const ofDay = routes.filter((route) => dayInGuayaquil(new Date(route.date)) === day)
  const tracked = ofDay.filter((route) => TRACKED.has(route.status))
  const overdueOpen: OverdueMonitorRoute[] = routes
    .filter((route) => dayInGuayaquil(new Date(route.date)) < day && isOpenRoute(route))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .map((route) => {
      const routeDay = dayInGuayaquil(new Date(route.date))
      return {
        route,
        routeDay,
        name: `Ruta del ${routeDay}${areaSuffix(route.zoneCode)}`,
      }
    })
  return {
    day,
    overdueOpen,
    routes: tracked.map((route, index) => ({
      route,
      name: `Ruta ${index + 1}${areaSuffix(route.zoneCode)}`,
    })),
    cancelled: ofDay.filter((route) => route.status === 'CANCELLED'),
    drafts: ofDay.filter((route) => route.status === 'DRAFT').length,
    drivers: Object.fromEntries(drivers.map((driver) => [driver.id, driver])),
    links,
    loadedAt: new Date().toISOString(),
  }
}

/** Todo lo que hay que seguir: cada ruta, cada pedido de sus paradas, su chofer y las incidencias. */
export function boardSubscriptions(board: MonitorBoard | undefined): RealtimeSubscription[] {
  if (!board) return []
  const subscriptions: RealtimeSubscription[] = [{ resource: 'incidents' }]
  for (const { route } of [...(board.overdueOpen ?? []), ...board.routes]) {
    subscriptions.push({ resource: 'route', id: route.id })
    if (route.driverId) subscriptions.push({ resource: 'driver', id: route.driverId })
    route.stops.forEach((stop) => subscriptions.push({ resource: 'order', id: stop.orderId }))
  }
  return subscriptions
}

/** Página (de `perPage` rutas) donde está la ruta `routeId`, o `null` si no está en el tablero. */
export function pageOfRoute(
  routes: MonitorBoard['routes'],
  routeId: string,
  perPage: number,
): number | null {
  const index = routes.findIndex(({ route }) => route.id === routeId)
  return index < 0 ? null : Math.floor(index / perPage)
}
