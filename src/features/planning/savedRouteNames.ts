import { dayInGuayaquil } from '../../lib/time/guayaquil'
import type { SavedRouteDetail } from './types'

/**
 * Rutas guardadas del día (aaaa-mm-dd, Guayaquil) con un nombre único: varias rutas pueden compartir
 * zona y hora de entrega, así que se numeran en el orden en que se confirmaron.
 */
export const namedRoutesOfDay = (routes: SavedRouteDetail[], day: string) =>
  routes
    .filter((route) => dayInGuayaquil(new Date(route.date)) === day)
    .map((route, index) => ({ route, name: `Ruta guardada ${index + 1} · ${route.zoneCode}` }))

/** Nombre de cada ruta guardada del día, por identificador. */
export const savedRouteNames = (routes: SavedRouteDetail[], day: string): Record<string, string> =>
  Object.fromEntries(namedRoutesOfDay(routes, day).map(({ route, name }) => [route.id, name]))
