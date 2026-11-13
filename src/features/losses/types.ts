/**
 * Pérdida de UNA unidad de un ítem del pedido (backend #52). El reemplazo y el original se siguen por
 * separado: el reemplazo puede prepararse aunque el original no aparezca, y recuperar el original
 * después no reabre la entrega.
 */
export interface OrderItemLoss {
  id: string
  orderId: string
  orderItemId: string
  /** Unidad perdida dentro del ítem (1..cantidad). */
  unitNumber: number
  productId: string
  attemptId: string | null
  declaredAt: string
  declaredById: string
  replacement: {
    /** `PREPARED`: se descontó una unidad libre. `PENDING`: no había stock libre. */
    state: 'PENDING' | 'PREPARED'
    preparedAt: string | null
    preparedById: string | null
  }
  original: {
    state: 'LOST' | 'RECOVERED'
    /** Solo al recuperarse: `SELLABLE` vuelve al stock, `DAMAGED` no. */
    condition: 'SELLABLE' | 'DAMAGED' | null
    recoveredAt: string | null
    recoveredById: string | null
  }
  /** Movimientos de existencias que registró el servidor por esta pérdida. */
  movements: StockMovement[]
  /** Pérdida anulada por error (backend #51 `LOSS_CANCEL`); `null` si sigue vigente. */
  cancelledAt?: string | null
  cancelReason?: string | null
}

export interface StockMovement {
  /** `REPLACEMENT_CANCEL_IN`: al anular una pérdida con reemplazo preparado vuelve la unidad. */
  kind: 'REPLACEMENT_OUT' | 'RECOVERY_IN' | 'REPLACEMENT_CANCEL_IN'
  /** −1 al preparar el reemplazo, +1 al recuperar un original vendible. */
  delta: number
  /** Existencia del producto después del movimiento. */
  stockAfter: number
  createdAt: string
  createdById: string
}

export type RecoveryCondition = 'SELLABLE' | 'DAMAGED'

export interface DeclareLossInput {
  orderId: string
  orderItemId: string
  /** Obligatoria si el ítem tiene más de una unidad. */
  unitNumber?: number
  /** Intento fallido del que viene la pérdida, si lo hay. */
  attemptId?: string
  reason: string
}
