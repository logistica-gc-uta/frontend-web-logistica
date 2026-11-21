import { useMemo } from 'react'
import { Link } from 'react-router'
import { orderReceiptPath } from '../../app/paths'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { formatCurrency } from '../../lib/format/formatCurrency'
import { formatDateTime } from '../../lib/format/formatDateTime'
import { canReschedulePendingOrder, isOverduePendingOrder } from './OrderRescheduleDrawer'
import { ORDER_STATUS_LABELS } from './orderLabels'
import type { Order, OrderStatus } from './types'

const STATUS_BADGE: Record<OrderStatus, string> = {
  PENDING: 'badge',
  ASSIGNED: 'badge badge--accent',
  IN_TRANSIT: 'badge badge--sand',
  DELIVERED: 'badge badge--success',
  CANCELLED: 'badge badge--danger',
}

interface OrdersTableProps {
  orders: Order[]
  onReschedule?: (order: Order) => void
  onConfirmPickup?: (order: Order) => void
}

export function OrdersTable({ orders, onReschedule, onConfirmPickup }: OrdersTableProps) {
  const columns = useMemo<Column<Order>[]>(
    () => [
      {
        header: 'Entrega',
        className: 'orders-table__when',
        render: (order) => (
          <div className="orders-table__when-cell">
            <span>{formatDateTime(order.scheduledDeliveryDate)}</span>
            {isOverduePendingOrder(order) && (
              <span className="badge badge--warning orders-table__overdue">Vencido</span>
            )}
          </div>
        ),
      },
      {
        header: 'Destinatario',
        className: 'orders-table__person',
        render: (order) => order.recipientName ?? order.user?.name ?? '—',
      },
      { header: 'Dirección', render: (order) => order.deliveryAddress },
      {
        header: 'Productos',
        render: (order) => (
          <ul className="orders-table__items">
            {order.items.map((item) => (
              <li key={item.id}>{`${item.quantity}× ${item.product.name}`}</li>
            ))}
          </ul>
        ),
      },
      {
        header: 'Estado',
        render: (order) =>
          order.pickup?.state === 'PENDING_PICKUP' ? (
            <span className="badge badge--warning">Retiro en tienda</span>
          ) : order.requiresAdministrativeReview ? (
            <span className="badge badge--danger">En gestión</span>
          ) : (
            <span className={STATUS_BADGE[order.status]}>{ORDER_STATUS_LABELS[order.status]}</span>
          ),
      },
      {
        header: 'Total',
        className: 'orders-table__total',
        render: (order) => formatCurrency(order.total),
      },
      {
        header: 'Acciones',
        render: (order) => {
          const recipient = order.recipientName ?? order.user?.name ?? 'sin nombre'
          const canReschedule = Boolean(onReschedule) && canReschedulePendingOrder(order)
          const canConfirmPickup =
            Boolean(onConfirmPickup) &&
            order.status !== 'DELIVERED' &&
            order.status !== 'CANCELLED' &&
            order.pickup?.state === 'PENDING_PICKUP'
          return (
            <div className="orders-table__actions">
              <Link
                to={orderReceiptPath(order.id)}
                aria-label={`Comprobante y contacto del pedido de ${recipient}`}
              >
                Ver
              </Link>
              {canReschedule && (
                <button
                  type="button"
                  className="btn btn--secondary orders-table__reschedule"
                  aria-label={`Reprogramar pedido de ${recipient}`}
                  onClick={() => onReschedule?.(order)}
                >
                  Reprogramar
                </button>
              )}
              {canConfirmPickup && (
                <button
                  type="button"
                  className="btn btn--secondary orders-table__reschedule"
                  aria-label={`Confirmar retiro en tienda del pedido de ${recipient}`}
                  onClick={() => onConfirmPickup?.(order)}
                >
                  Confirmar retiro
                </button>
              )}
            </div>
          )
        },
      },
    ],
    [onReschedule, onConfirmPickup],
  )

  return (
    <DataTable
      caption="Pedidos registrados"
      columns={columns}
      rows={orders}
      getRowKey={(order) => order.id}
      emptyMessage="No hay pedidos para los filtros seleccionados"
    />
  )
}
