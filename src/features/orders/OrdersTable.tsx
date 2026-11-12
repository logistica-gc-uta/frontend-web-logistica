import { Link } from 'react-router'
import { orderReceiptPath } from '../../app/paths'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { formatCurrency } from '../../lib/format/formatCurrency'
import { formatDateTime } from '../../lib/format/formatDateTime'
import { describePlanningReason } from '../../lib/planning/planningReasons'
import { ORDER_STATUS_LABELS } from './orderLabels'
import type { Order, OrderStatus } from './types'

const STATUS_BADGE: Record<OrderStatus, string> = {
  PENDING: 'badge',
  ASSIGNED: 'badge badge--accent',
  IN_TRANSIT: 'badge badge--sand',
  DELIVERED: 'badge badge--success',
  CANCELLED: 'badge badge--danger',
}

const COLUMNS: Column<Order>[] = [
  { header: 'Entrega', render: (order) => formatDateTime(order.scheduledDeliveryDate) },
  { header: 'Destinatario', render: (order) => order.recipientName ?? order.user?.name ?? '—' },
  { header: 'Dirección', render: (order) => order.deliveryAddress },
  // Los pedidos con cobertura de tienda (#42) no tienen zona.
  { header: 'Zona', render: (order) => order.zone?.code ?? '—' },
  {
    header: 'Productos',
    render: (order) =>
      order.items.map((item) => `${item.quantity}× ${item.product.name}`).join(', '),
  },
  {
    header: 'Estado',
    render: (order) => (
      <span className={STATUS_BADGE[order.status]}>{ORDER_STATUS_LABELS[order.status]}</span>
    ),
  },
  { header: 'Total', render: (order) => formatCurrency(order.total) },
  {
    header: 'Comprobante',
    render: (order) => (
      <Link
        to={orderReceiptPath(order.id)}
        aria-label={`Comprobante y contacto del pedido de ${order.recipientName ?? order.user?.name ?? 'sin nombre'}`}
      >
        Ver
      </Link>
    ),
  },
  {
    header: 'Planificación',
    render: ({ planningEligibility }) =>
      planningEligibility.eligible ? (
        <span className="badge badge--success">Apto</span>
      ) : (
        <>
          <span className="badge badge--danger">No apto</span>{' '}
          <small>{planningEligibility.reasons.map(describePlanningReason).join(', ')}</small>
        </>
      ),
  },
]

interface OrdersTableProps {
  orders: Order[]
}

export function OrdersTable({ orders }: OrdersTableProps) {
  return (
    <DataTable
      caption="Pedidos registrados"
      columns={COLUMNS}
      rows={orders}
      getRowKey={(order) => order.id}
      emptyMessage="No hay pedidos para los filtros seleccionados"
    />
  )
}
