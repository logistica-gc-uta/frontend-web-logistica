import { ordersService } from '../orders/ordersService'
import type { Order } from '../orders/types'
import { dispatchService } from './dispatchService'
import type { UrgencyProposal } from './types'

/** Bandeja del día lista para mostrar: urgencias por despachar con los datos de cada pedido. */
export interface UrgencyBoard {
  /** Día operativo (aaaa-mm-dd, Guayaquil). */
  date: string
  /** Pedidos de hoy por despachar, en el orden de la bandeja (los priorizados primero). */
  urgencies: UrgencyProposal[]
  /** Pedidos de hoy que ya están en una ruta: se ven en las rutas de hoy, no como urgencias. */
  alreadyRouted: number
  /** Pedidos con una entrega fallida pendiente de revisión (se gestionan en otra bandeja). */
  failedDeliveries: number
  /** Pedidos de hoy en cualquier estado, para nombrar urgencias y decisiones por su dirección. */
  orders: Record<string, Order>
}

/**
 * El backend también lista los pedidos de hoy que ya están en una ruta (bloqueados por
 * `ACTIVE_ROUTE_CLAIM`). No son urgencias por despachar.
 */
const isAlreadyRouted = (urgency: UrgencyProposal): boolean =>
  urgency.reasons.includes('ACTIVE_ROUTE_CLAIM')

/** Carga la bandeja y la cruza con los pedidos del día (la bandeja solo trae su id). */
export async function loadUrgencyBoard(): Promise<UrgencyBoard> {
  const inbox = await dispatchService.inbox()
  const urgencies = inbox.urgencies.filter((urgency) => !isAlreadyRouted(urgency))
  const orders = await ordersService.listAll({ date: inbox.date })
  return {
    date: inbox.date,
    urgencies,
    alreadyRouted: inbox.urgencies.length - urgencies.length,
    failedDeliveries: inbox.failedDeliveries,
    orders: Object.fromEntries(orders.map((order) => [order.id, order])),
  }
}
