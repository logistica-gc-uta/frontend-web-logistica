import axios, { HttpStatusCode } from 'axios'
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

const RELEASE_DRAFT_ERRORS: Record<string, string> = {
  DRAFT_NOT_RELEASABLE:
    'Este borrador ya no se puede liberar: se le asignó un chofer o cambió de estado. Revisa la lista actualizada.',
  DRAFT_ALREADY_RELEASED:
    'Este borrador ya estaba liberado: sus pedidos ya están disponibles para planificar. Revisa la lista actualizada.',
}

export const describeReleaseError = (error: unknown): string => {
  const info = shopErrorInfo(error)
  if (info.code && RELEASE_DRAFT_ERRORS[info.code]) return RELEASE_DRAFT_ERRORS[info.code]
  if (info.status === HttpStatusCode.NotFound) {
    return 'No se encontró el borrador: revisa la lista actualizada.'
  }
  return describeActionError(error, {
    fallback: 'No se pudo liberar el borrador',
    forbidden: 'No tienes permisos para liberar rutas.',
    conflictHint: 'El borrador ya cambió (por ejemplo, se le asignó un chofer): revisa la lista.',
  })
}

/** 409 o 404 al liberar indica que la lista en pantalla está desactualizada. */
export const isStaleReleaseError = (error: unknown): boolean => {
  const { status } = shopErrorInfo(error)
  return status === HttpStatusCode.Conflict || status === HttpStatusCode.NotFound
}

const CANCEL_ROUTE_ERRORS: Record<string, string> = {
  ROUTE_ALREADY_CANCELLED: 'Esta ruta ya estaba cancelada: revisa la lista actualizada.',
  ROUTE_NOT_CANCELLABLE:
    'Esta ruta no se puede cancelar (solo se cancelan rutas asignadas antes de iniciar): revisa la lista actualizada.',
  ROUTE_ALREADY_STARTED: 'La ruta ya se inició y no se puede cancelar: revisa la lista actualizada.',
  ROUTE_CONCURRENT_TRANSITION:
    'La ruta cambió al mismo tiempo por otra operación: revisa la lista actualizada e inténtalo de nuevo.',
  ROUTE_COHERENCE_INVALID:
    'El estado actual de la ruta, sus paradas o el chofer no es consistente para cancelar: revisa la lista actualizada.',
  ROUTE_DRIVER_CHANGED:
    'El chofer asignado a la ruta cambió antes de cancelar: revisa la lista actualizada.',
}

export const describeCancelRouteError = (error: unknown): string => {
  const info = shopErrorInfo(error)
  if (info.code && CANCEL_ROUTE_ERRORS[info.code]) return CANCEL_ROUTE_ERRORS[info.code]
  if (info.status === HttpStatusCode.NotFound) {
    return 'No se encontró la ruta: revisa la lista actualizada.'
  }
  return describeActionError(error, {
    fallback: 'No se pudo cancelar la ruta',
    forbidden: 'No tienes permisos para cancelar rutas.',
    conflictHint:
      'La ruta cambió o ya no se puede cancelar (por ejemplo, ya se inició o cambió de chofer): revisa la lista actualizada.',
  })
}

/** 409 o 404 al cancelar indica estado obsoleto en pantalla y requiere revalidar contra el servidor. */
export const isStaleCancelRouteError = (error: unknown): boolean => {
  const { status } = shopErrorInfo(error)
  return status === HttpStatusCode.Conflict || status === HttpStatusCode.NotFound
}
