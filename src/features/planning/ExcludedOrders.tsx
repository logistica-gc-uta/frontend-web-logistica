import { Drawer } from '../../components/ui/Drawer'
import { describePlanningReason } from '../../lib/planning/planningReasons'
import type { ExcludedOrder } from './types'

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/** Primeros caracteres del identificador: suficientes para ubicar el pedido en el listado. */
const shortId = (orderId: string): string => orderId.slice(0, 8)

interface ExcludedOrdersProps {
  excluded: ExcludedOrder[]
  open: boolean
  onClose: () => void
}

/**
 * Pedidos que el planificador no pudo incluir en ninguna ruta, con el motivo en español, en un
 * panel lateral que se abre desde el aviso de la cabecera de la página.
 */
export function ExcludedOrders({ excluded, open, onClose }: ExcludedOrdersProps) {
  if (excluded.length === 0) return null

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Pedidos excluidos (${excluded.length})`}
      titleId="excluded-orders-title"
      className="drawer__panel--narrow"
    >
      <p className="text-muted">
        No entran en ninguna ruta propuesta. Corrige el motivo y vuelve a previsualizar.
      </p>
      <ul className="excluded-list">
        {excluded.map(({ orderId, reasons }) => (
          <li key={orderId}>
            <code>{shortId(orderId)}</code>{' '}
            <span>
              {reasons.map((reason) => capitalize(describePlanningReason(reason))).join('. ')}
            </span>
          </li>
        ))}
      </ul>
    </Drawer>
  )
}
