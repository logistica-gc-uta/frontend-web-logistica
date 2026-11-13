import type { OrderStatus } from '../../orders/types'
import type { CustomerPickup } from './customerOrdersService'

/** Estados tal como los registra el backend (ADMIN y DRIVER los cambian; el cliente solo los ve). */
export const CUSTOMER_ORDER_STATUS: Record<OrderStatus, string> = {
  PENDING: 'Pendiente de despacho',
  ASSIGNED: 'Asignado a una ruta',
  IN_TRANSIT: 'En camino',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
}

export const statusBadgeClass = (status: OrderStatus): string =>
  status === 'DELIVERED'
    ? 'badge badge--success'
    : status === 'CANCELLED'
      ? 'badge badge--danger'
      : 'badge'

/** Lo que decide el estado de seguimiento que ve el cliente (backend #50). */
interface Trackable {
  status: OrderStatus
  pickup?: CustomerPickup | null
  pendingManagement?: boolean
}

/**
 * Estado de seguimiento para el cliente: la gestión tras una entrega fallida y el retiro en tienda
 * se muestran por encima del estado del pedido, que no cambia mientras tanto. Solo un retiro
 * confirmado por la tienda se muestra como entregado.
 */
export function trackingLabel(order: Trackable): string {
  if (order.pickup?.state === 'PICKED_UP') return 'Entregado: retirado en tienda'
  if (order.pickup?.state === 'PENDING_PICKUP') return 'Pendiente de retiro en tienda'
  if (order.pendingManagement) return 'Entrega pendiente de gestión'
  return CUSTOMER_ORDER_STATUS[order.status]
}

export const trackingBadgeClass = (order: Trackable): string =>
  order.pickup?.state === 'PENDING_PICKUP' || (order.pendingManagement && !order.pickup)
    ? 'badge badge--warning'
    : statusBadgeClass(order.status)
