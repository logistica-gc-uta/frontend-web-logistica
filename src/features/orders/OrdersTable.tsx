import { DataTable, type Column } from '../../components/ui/DataTable'
import { formatCurrency } from '../../lib/format/formatCurrency'
import { formatDateTime } from '../../lib/format/formatDateTime'
import { describePlanningReason } from '../../lib/planning/planningReasons'
import { ORDER_STATUS_LABELS } from './orderLabels'
import type { Order } from './types'

const COLUMNS: Column<Order>[] = [
  { header: 'Entrega', render: (order) => formatDateTime(order.scheduledDeliveryDate) },
  { header: 'Destinatario', render: (order) => order.recipientName ?? order.user?.name ?? '—' },
  { header: 'Dirección', render: (order) => order.deliveryAddress },
  { header: 'Zona', render: (order) => order.zone.code },
  {
    header: 'Productos',
    render: (order) =>
      order.items.map((item) => `${item.quantity}× ${item.product.name}`).join(', '),
  },
  {
    header: 'Estado',
    render: (order) => (
      <span
        className={`badge${order.status === 'DELIVERED' ? ' badge--success' : ''}${
          order.status === 'CANCELLED' ? ' badge--danger' : ''
        }`}
      >
        {ORDER_STATUS_LABELS[order.status]}
      </span>
    ),
  },
  { header: 'Total', render: (order) => formatCurrency(order.total) },
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
