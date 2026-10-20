import type { RouteProposal } from './types'

/** Colores distinguibles entre sí y legibles sobre el mapa claro de OpenStreetMap. */
const ROUTE_COLORS = [
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#9333ea',
  '#ea580c',
  '#0891b2',
  '#be185d',
  '#65a30d',
  '#4f46e5',
  '#b45309',
] as const

/** Color de la ruta en la posición `index` (se repite si hay más rutas que colores). */
export const routeColor = (index: number): string => ROUTE_COLORS[index % ROUTE_COLORS.length]

/** Etiqueta de la ruta: no depende solo del color (accesibilidad). */
export const routeLabel = (index: number): string => `Ruta ${index + 1}`

/** Identifica una propuesta de forma estable: misma zona, día y pedidos = misma propuesta. */
export const proposalKey = (proposal: RouteProposal): string =>
  `${proposal.zoneId}|${proposal.routeDate}|${proposal.orderIds.join(',')}`
