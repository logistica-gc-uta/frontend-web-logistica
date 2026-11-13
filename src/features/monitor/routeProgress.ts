import type { Driver } from '../planning/types'
import type { MonitorRoute, RouteProgress } from './types'

/**
 * Progreso calculado solo con los resultados que guardó el backend. Una visita fallida cuenta
 * como resuelta, pero no como entrega: 3 entregas y 1 fallo son 4/4 resueltas y 75 % entregado.
 */
export function routeProgress(route: MonitorRoute): RouteProgress {
  const total = route.stops.length
  const delivered = route.stops.filter((stop) => stop.outcome === 'SUCCESSFUL').length
  const failed = route.stops.filter((stop) => stop.outcome === 'FAILED').length
  return {
    total,
    delivered,
    failed,
    resolved: delivered + failed,
    deliveredPercent: total === 0 ? 0 : Math.round((delivered * 100) / total),
  }
}

/**
 * - `BUSY`: con esta ruta asignada o en curso.
 * - `RETURNING`: terminó las visitas pero no confirmó su regreso al depósito (aún no disponible).
 * - `AVAILABLE`: regresó y el backend lo da por disponible.
 * - `BUSY_ELSEWHERE`: regresó, pero el backend lo retiene por otra ruta o lo marcó no disponible.
 */
export type DriverState = 'BUSY' | 'RETURNING' | 'AVAILABLE' | 'BUSY_ELSEWHERE'

export function driverState(route: MonitorRoute, driver: Driver | undefined): DriverState | null {
  if (!route.driverId) return null
  // Una ruta interrumpida (#51) tampoco libera al chofer por sí sola: hace falta confirmar su regreso.
  if (route.status !== 'COMPLETED' && route.status !== 'INTERRUPTED') return 'BUSY'
  if (!route.returnedAt) return 'RETURNING'
  return driver?.isAvailable ? 'AVAILABLE' : 'BUSY_ELSEWHERE'
}
