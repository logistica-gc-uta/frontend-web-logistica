import { vi } from 'vitest'
import { dispatchService } from '../features/dispatch/dispatchService'
import type { OrderItemLoss } from '../features/losses/types'
import { ordersService } from '../features/orders/ordersService'
import type { Order } from '../features/orders/types'
import { guestOrder } from './fixtures'

/** Pérdida de la unidad 1 de un ítem, con reemplazo preparado (−1) y el original todavía perdido. */
export const preparedLoss = (overrides: Partial<OrderItemLoss> = {}): OrderItemLoss => ({
  id: 'loss-1',
  orderId: 'order-1',
  orderItemId: 'item-1',
  unitNumber: 1,
  productId: 'product-1',
  attemptId: null,
  declaredAt: '2030-02-14T16:00:00Z',
  declaredById: 'admin-1',
  replacement: { state: 'PREPARED', preparedAt: '2030-02-14T16:00:00Z', preparedById: 'admin-1' },
  original: { state: 'LOST', condition: null, recoveredAt: null, recoveredById: null },
  movements: [
    {
      kind: 'REPLACEMENT_OUT',
      delta: -1,
      stockAfter: 4,
      createdAt: '2030-02-14T16:00:00Z',
      createdById: 'admin-1',
    },
  ],
  ...overrides,
})

/**
 * La página del comprobante también carga sus pérdidas (#39). Las pruebas que la abren simulan esas
 * llamadas para no consultar un backend real.
 */
export function mockLossesPanel(order: Order = guestOrder, losses: OrderItemLoss[] = []) {
  return {
    order: vi.spyOn(ordersService, 'get').mockResolvedValue(order),
    losses: vi.spyOn(dispatchService, 'losses').mockResolvedValue(losses),
  }
}
