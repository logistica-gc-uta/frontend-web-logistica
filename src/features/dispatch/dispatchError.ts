import { describeActionError } from '../../lib/http/describeActionError'
import { shopErrorInfo } from '../shop/shopError'

/** Explica por qué no se registró una decisión sobre una urgencia (nunca se presenta como éxito). */
export const describeDispatchError = (error: unknown): string => {
  // Backend #82: el chofer elegido fue dado de baja mientras la propuesta estaba abierta.
  if (shopErrorInfo(error).code === 'DRIVER_INACTIVE') {
    return 'Ese chofer está dado de baja y no puede recibir rutas: actualiza las propuestas y elige otro.'
  }
  return describeActionError(error, {
    fallback: 'No se pudo registrar la decisión',
    forbidden: 'No tienes permisos para despachar urgencias.',
    conflictHint:
      'La propuesta, la ruta o el chofer cambiaron: actualiza las propuestas y vuelve a intentarlo.',
  })
}
