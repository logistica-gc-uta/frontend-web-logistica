import type { OrderStatus } from '../../orders/types'

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
