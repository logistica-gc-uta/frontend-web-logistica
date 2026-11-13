import { shopErrorInfo } from '../shop/shopError'
import { describeActionError } from '../../lib/http/describeActionError'

/** Backend #49: las rutas solo se confirman y asignan el día de entrega (hora de Ecuador). */
export const ROUTE_DATE_NOT_TODAY_MESSAGE =
  'Las rutas solo se confirman y asignan el mismo día de entrega (hora de Ecuador). Los pedidos de otros días siguen pendientes hasta ese día.'

const isNotToday = (error: unknown) => shopErrorInfo(error).code === 'ROUTE_DATE_NOT_TODAY'

export const describeConfirmError = (error: unknown): string =>
  isNotToday(error)
    ? ROUTE_DATE_NOT_TODAY_MESSAGE
    : describeActionError(error, {
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

export const describeAssignError = (error: unknown): string => {
  // Backend #44: el chofer tiene una ausencia el día de la ruta.
  if (shopErrorInfo(error).code === 'DRIVER_ABSENT') {
    return 'Ese chofer está ausente el día de la ruta: elige otro.'
  }
  if (isNotToday(error)) return ROUTE_DATE_NOT_TODAY_MESSAGE
  return describeActionError(error, {
    fallback: 'No se pudo asignar el chofer',
    forbidden: 'No tienes permisos para asignar choferes.',
    conflictHint: 'El chofer o la ruta cambiaron: revisa la lista actualizada.',
  })
}

export const describeReleaseError = (error: unknown): string =>
  describeActionError(error, {
    fallback: 'No se pudo liberar el borrador',
    forbidden: 'No tienes permisos para liberar rutas.',
    conflictHint: 'El borrador ya cambió (por ejemplo, se le asignó un chofer): revisa la lista.',
  })
