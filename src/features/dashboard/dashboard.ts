import { todayInGuayaquil } from '../../lib/time/guayaquil'
import { ordersService } from '../orders/ordersService'
import { ORDER_STATUSES, type Order, type OrderStatus } from '../orders/types'

/** Pedidos del día contados por estado, en el orden del flujo de entrega. */
export interface OrdersSummary {
  day: string
  total: number
  byStatus: Record<OrderStatus, number>
}

export function summarizeOrders(day: string, orders: readonly Order[]): OrdersSummary {
  const byStatus = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0])) as Record<
    OrderStatus,
    number
  >
  for (const order of orders) byStatus[order.status] += 1
  return { day, total: orders.length, byStatus }
}

/** Pedidos con entrega programada para hoy (día de Guayaquil). */
export async function loadTodayOrders(now: Date = new Date()): Promise<OrdersSummary> {
  const day = todayInGuayaquil(now)
  return summarizeOrders(day, await ordersService.listAll({ date: day }))
}

/** Porcentaje de un estado sobre el total, para el ancho de su tramo en la barra. */
export const sharePercent = (count: number, total: number): number =>
  total === 0 ? 0 : (count * 100) / total

const longDate = new Intl.DateTimeFormat('es-EC', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'America/Guayaquil',
})

/** «miércoles, 5 de noviembre» a partir de un día aaaa-mm-dd. */
export function formatOperationalDay(day: string): string {
  // Mediodía UTC: el mismo día en Guayaquil (UTC-5) sin importar la zona del navegador.
  const date = new Date(`${day}T12:00:00Z`)
  return Number.isNaN(date.getTime()) ? day : longDate.format(date)
}
