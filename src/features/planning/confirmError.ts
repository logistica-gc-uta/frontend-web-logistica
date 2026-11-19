import axios from 'axios'
import { shopErrorInfo } from '../shop/shopError'
import { describeActionError } from '../../lib/http/describeActionError'

/** Backend #49: las rutas solo se confirman y asignan el día de entrega (hora de Ecuador). */
export const ROUTE_DATE_NOT_TODAY_MESSAGE =
  'Las rutas solo se confirman y asignan el mismo día de entrega (hora de Ecuador). Los pedidos de otros días siguen pendientes hasta ese día.'

const isNotToday = (error: unknown) => shopErrorInfo(error).code === 'ROUTE_DATE_NOT_TODAY'

const unitsText = (count: number) => (count === 1 ? '1 unidad' : `${count} unidades`)

function capacityExceededMessage(error: unknown, actionHint: string): string | null {
  const info = shopErrorInfo(error)
  if (info.code !== 'VEHICLE_CAPACITY_EXCEEDED') return null
  const body = axios.isAxiosError<Record<string, unknown>>(error) ? error.response?.data : undefined
  const bodyDetails =
    body && typeof body.details === 'object' && body.details !== null
      ? (body.details as Record<string, unknown>)
      : undefined
  const capacity = info.details.capacity ?? bodyDetails?.capacity ?? body?.capacity
  const requiredUnits =
    info.details.requiredUnits ?? bodyDetails?.requiredUnits ?? body?.requiredUnits
  if (typeof requiredUnits === 'number' && typeof capacity === 'number') {
    return `La carga de la ruta (${unitsText(requiredUnits)}) supera la capacidad del vehículo (${unitsText(capacity)}). ${actionHint}`
  }
  return `La carga de la ruta supera la capacidad del vehículo. ${actionHint}`
}

export const describeConfirmError = (error: unknown): string => {
  if (isNotToday(error)) return ROUTE_DATE_NOT_TODAY_MESSAGE
  const capacity = capacityExceededMessage(
    error,
    'No se guardó el borrador; vuelve a previsualizar o elige otro chofer.',
  )
  if (capacity) return capacity
  return describeActionError(error, {
    fallback: 'No se pudo confirmar la ruta',
    forbidden: 'No tienes permisos para confirmar rutas.',
    conflictHint: 'Vuelve a previsualizar para ver el estado actual de los pedidos.',
  })
}

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
  const capacity = capacityExceededMessage(error, 'Elige otro chofer.')
  if (capacity) return capacity
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
