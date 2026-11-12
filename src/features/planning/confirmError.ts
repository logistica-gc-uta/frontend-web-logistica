import { shopErrorInfo } from '../shop/shopError'
import { describeActionError } from '../../lib/http/describeActionError'

export const describeConfirmError = (error: unknown): string =>
  describeActionError(error, {
    fallback: 'No se pudo confirmar la ruta',
    forbidden: 'No tienes permisos para confirmar rutas.',
    conflictHint: 'Vuelve a previsualizar para ver el estado actual de los pedidos.',
  })

export const describeCorrectionError = (error: unknown): string =>
  describeActionError(error, {
    fallback: 'No se pudo corregir la ruta',
    forbidden: 'No tienes permisos para corregir rutas.',
    conflictHint:
      'La ruta cambió o ya no se puede modificar (por ejemplo, se inició): revisa la lista actualizada.',
  })

export const describeAssignError = (error: unknown): string =>
  // Backend #44: el chofer tiene una ausencia el día de la ruta.
  shopErrorInfo(error).code === 'DRIVER_ABSENT'
    ? 'Ese chofer está ausente el día de la ruta: elige otro.'
    : describeActionError(error, {
        fallback: 'No se pudo asignar el chofer',
        forbidden: 'No tienes permisos para asignar choferes.',
        conflictHint: 'El chofer o la ruta cambiaron: revisa la lista actualizada.',
      })
