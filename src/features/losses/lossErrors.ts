import { describeActionError } from '../../lib/http/describeActionError'
import { shopErrorInfo } from '../shop/shopError'

/** Rechazos de pérdidas y reemplazos (backend #52): ninguno cambia el stock. */
const LOSS_ERRORS: Record<string, string> = {
  LOSS_ALREADY_DECLARED: 'Esa unidad ya tiene una pérdida declarada: no se registró otra.',
  NO_FREE_STOCK:
    'No hay stock libre de ese producto: el reemplazo sigue pendiente y no se descontó nada.',
  REPLACEMENT_ALREADY_PREPARED:
    'El reemplazo de esta pérdida ya estaba preparado: no se descontó otra unidad.',
  LOSS_ALREADY_CANCELLED: 'Esa pérdida ya estaba anulada.',
  LOSS_ALREADY_RECOVERED: 'No se puede anular: el original ya se registró como recuperado.',
  LOSS_CANCEL_ORDER_STATE:
    'No se puede anular la pérdida con el pedido en camino, entregado o cancelado.',
  LOSS_CANCEL_ACTIVE_CLAIM: 'No se puede anular mientras el pedido esté reservado en una ruta.',
  LOSS_CANCEL_PICKUP_EXISTS: 'No se puede anular: el pedido tiene un retiro en tienda acordado.',
  ORIGINAL_ALREADY_RECOVERED:
    'El original ya estaba registrado como recuperado: no se volvió a sumar al stock.',
}

export const describeLossError = (error: unknown, fallback: string): string => {
  const code = shopErrorInfo(error).code
  if (code && LOSS_ERRORS[code]) return LOSS_ERRORS[code]
  return describeActionError(error, {
    fallback,
    forbidden: 'Solo un ADMIN puede gestionar pérdidas y reemplazos.',
    conflictHint:
      'El pedido o la pérdida cambiaron (por ejemplo, el pedido ya se entregó o canceló): revisa el estado actual.',
  })
}
