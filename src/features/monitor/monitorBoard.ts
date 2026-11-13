import type { RealtimeSubscription } from '../../lib/realtime/realtimeClient'
import { dayInGuayaquil, todayInGuayaquil } from '../../lib/time/guayaquil'
import { driversService } from '../planning/driversService'
import type { Driver } from '../planning/types'
import { monitorService } from './monitorService'
import type { MonitorRoute } from './types'

/** Lo que muestra el monitor, tal como está en el servidor en el momento de la consulta. */
export interface MonitorBoard {
  /** Día mostrado (aaaa-mm-dd, Guayaquil). */
  day: string
  /** Rutas de hoy con chofer (asignadas, en curso o completadas), en el orden en que se crearon. */
  routes: { route: MonitorRoute; name: string }[]
  /** Rutas de hoy todavía en borrador (sin chofer): no hay nada que seguir. */
  drafts: number
  drivers: Record<string, Driver>
  /** Instante de esta consulta. */
  loadedAt: string
}

const TRACKED = new Set(['ASSIGNED', 'IN_PROGRESS', 'INTERRUPTED', 'COMPLETED'])

export async function loadMonitorBoard(now: Date = new Date()): Promise<MonitorBoard> {
  const day = todayInGuayaquil(now)
  const [routes, drivers] = await Promise.all([monitorService.listRoutes(), driversService.list()])
  const ofDay = routes.filter((route) => dayInGuayaquil(new Date(route.date)) === day)
  const tracked = ofDay.filter((route) => TRACKED.has(route.status))
  return {
    day,
    routes: tracked.map((route, index) => ({
      route,
      name: `Ruta ${index + 1} · ${route.zoneCode}`,
    })),
    drafts: ofDay.filter((route) => route.status === 'DRAFT').length,
    drivers: Object.fromEntries(drivers.map((driver) => [driver.id, driver])),
    loadedAt: new Date().toISOString(),
  }
}

/** Todo lo que hay que seguir: cada ruta, cada pedido de sus paradas, su chofer y las incidencias. */
export function boardSubscriptions(board: MonitorBoard | undefined): RealtimeSubscription[] {
  if (!board) return []
  const subscriptions: RealtimeSubscription[] = [{ resource: 'incidents' }]
  for (const { route } of board.routes) {
    subscriptions.push({ resource: 'route', id: route.id })
    if (route.driverId) subscriptions.push({ resource: 'driver', id: route.driverId })
    route.stops.forEach((stop) => subscriptions.push({ resource: 'order', id: stop.orderId }))
  }
  return subscriptions
}
