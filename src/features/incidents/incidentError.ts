import { describeActionError } from '../../lib/http/describeActionError'
import { shopErrorInfo } from '../shop/shopError'

/** Rechazos del retiro en tienda (backend #50): nunca se presentan como éxito. */
const PICKUP_ERRORS: Record<string, string> = {
  PICKUP_ALREADY_AGREED: 'Este pedido ya tiene un retiro en tienda acordado: actualiza la bandeja.',
  PICKUP_NOT_AGREED:
    'No hay un retiro acordado para confirmar: registra primero el acuerdo con el cliente.',
  PICKUP_ALREADY_CONFIRMED: 'El retiro ya fue confirmado: el pedido ya está entregado.',
}

/** Explica por qué no se registró una gestión de entrega fallida (nunca se presenta como éxito). */
export const describeIncidentError = (error: unknown): string => {
  const code = shopErrorInfo(error).code
  if (code && PICKUP_ERRORS[code]) return PICKUP_ERRORS[code]
  return describeActionError(error, {
    fallback: 'No se pudo registrar la gestión',
    forbidden: 'No tienes permisos para gestionar entregas fallidas.',
    conflictHint:
      'El intento, la ruta o el acuerdo cambiaron (por ejemplo, otra persona ya lo gestionó): actualiza la bandeja.',
  })
}
