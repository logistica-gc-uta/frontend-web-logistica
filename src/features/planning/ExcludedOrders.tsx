import { describePlanningReason } from '../../lib/planning/planningReasons'
import type { ExcludedOrder } from './types'

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/** Primeros caracteres del identificador: suficientes para ubicar el pedido en el listado. */
const shortId = (orderId: string): string => orderId.slice(0, 8)

interface ExcludedOrdersProps {
  excluded: ExcludedOrder[]
}

/** Pedidos que el planificador no pudo incluir en ninguna ruta, con el motivo en español. */
export function ExcludedOrders({ excluded }: ExcludedOrdersProps) {
  if (excluded.length === 0) return null

  return (
    <section className="card" aria-labelledby="excluded-orders-title">
      <h2 id="excluded-orders-title">Pedidos excluidos ({excluded.length})</h2>
      <p className="text-muted">
        Estos pedidos no entran en ninguna ruta propuesta. Corrige el motivo y vuelve a
        previsualizar.
      </p>
      <ul className="excluded-list">
        {excluded.map(({ orderId, reasons }) => (
          <li key={orderId}>
            <code>{shortId(orderId)}</code>{' '}
            {reasons.map((reason) => capitalize(describePlanningReason(reason))).join('. ')}
          </li>
        ))}
      </ul>
    </section>
  )
}
