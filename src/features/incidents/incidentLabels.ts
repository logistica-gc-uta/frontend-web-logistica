import axios, { HttpStatusCode } from 'axios'
import { AppError } from '../../lib/errors/AppError'
import type { IncidentStatus } from '../dispatch/types'
import { shopErrorInfo } from '../shop/shopError'
import { PICKUP_ERRORS } from './incidentError'

const GENERIC_DISABLED_REASON = 'Esta acción no está disponible en el estado actual del pedido.'

const ACTION_DISABLED_REASONS: Record<string, string> = {
  INCIDENT_NOT_READY_AT_STORE:
    'Confirma primero que el pedido devuelto o un reemplazo está disponible en tienda.',
  INCIDENT_ALREADY_READY:
    'La disponibilidad en tienda ya fue confirmada para el último intento fallido.',
  RESCHEDULE_AGREEMENT_REQUIRED:
    'Registra primero un contacto con fecha y franja futuras acordadas con el destinatario.',
  DELIVERY_COORDINATES_REQUIRED:
    'El pedido o la tienda no tienen coordenadas válidas para reprogramar la entrega.',
  CLAIM_NOT_RELEASED:
    'El pedido todavía sigue retenido en su ruta original; espera a que se libere.',
  ORDER_CLAIMED_BY_ANOTHER_ROUTE: 'El pedido ya está asignado a otra ruta activa.',
  RECOVERY_PENDING:
    'Hay unidades pendientes de recuperación en Emergencias antes de gestionar este pedido.',
  EMERGENCY_CUSTODY_SEPARATE:
    'Este pedido está bajo custodia de una emergencia y debe gestionarse desde Emergencias.',
  FAILED_ATTEMPT_NOT_FOUND:
    'No hay un intento fallido vigente registrado para gestionar esta acción.',
  INVALID_FAILED_ATTEMPT:
    'El intento fallido ya no es el más reciente o no es válido para esta acción.',
  PICKUP_ALREADY_AGREED: 'Este pedido ya tiene un retiro en tienda acordado.',
  PICKUP_NOT_AGREED: 'Todavía no hay un retiro en tienda acordado para confirmar.',
  PICKUP_ALREADY_CONFIRMED: 'El retiro en tienda ya fue confirmado y el pedido figura entregado.',
  ORDER_COMMERCIALLY_RESOLVED: 'El pedido ya fue entregado o cancelado comercialmente.',
}

const MUTATION_CONFLICT_MESSAGES: Record<string, string> = {
  INCIDENT_NOT_READY_AT_STORE:
    'Confirma primero que el pedido devuelto o un reemplazo está disponible en tienda. Actualiza la bandeja para ver el estado actual.',
  INCIDENT_ALREADY_READY:
    'La disponibilidad en tienda ya fue confirmada para el último intento fallido. Actualiza la bandeja para ver el estado actual.',
  RESCHEDULE_AGREEMENT_REQUIRED:
    'Falta un acuerdo vigente con fecha y franja futuras para reprogramar. Actualiza la bandeja para ver el estado actual.',
  DELIVERY_COORDINATES_REQUIRED:
    'El pedido o la tienda no tienen coordenadas válidas para reprogramar la entrega.',
  CLAIM_NOT_RELEASED:
    'El pedido todavía sigue retenido en su ruta original. Actualiza la bandeja y vuelve a intentarlo cuando se libere.',
  ORDER_CLAIMED_BY_ANOTHER_ROUTE:
    'El pedido ya está asignado a otra ruta activa. Actualiza la bandeja para ver su estado.',
  RECOVERY_PENDING:
    'Hay unidades pendientes de recuperación en Emergencias: resuélvelas ahí antes de gestionar este pedido.',
  EMERGENCY_CUSTODY_SEPARATE:
    'Este pedido está bajo custodia por emergencia y debe gestionarse desde Emergencias. Actualiza la bandeja.',
  FAILED_ATTEMPT_NOT_FOUND:
    'No hay un intento fallido vigente para esta gestión. Actualiza la bandeja para ver el estado actual.',
  INVALID_FAILED_ATTEMPT:
    'El intento fallido cambió o ya no es el más reciente. Actualiza la bandeja antes de volver a intentarlo.',
  ORDER_COMMERCIALLY_RESOLVED:
    'El pedido ya fue entregado o cancelado comercialmente. Actualiza la bandeja.',
}

const STATUS_BADGES: Record<IncidentStatus, { label: string; className: string }> = {
  WAITING_STORE_READINESS: {
    label: 'Esperando disponibilidad en tienda',
    className: 'badge badge--danger',
  },
  CONTACTED: {
    label: 'Contactado · falta disponibilidad en tienda',
    className: 'badge badge--warning',
  },
  READY_AT_STORE: {
    label: 'Disponible en tienda',
    className: 'badge badge--success',
  },
  PENDING_PICKUP: {
    label: 'Pendiente de retiro en tienda',
    className: 'badge badge--warning',
  },
  PICKED_UP: {
    label: 'Retirado en tienda',
    className: 'badge badge--success',
  },
  EMERGENCY_CUSTODY: {
    label: 'En custodia por emergencia',
    className: 'badge badge--warning',
  },
  REVIEW_WITHOUT_FAILED_ATTEMPT: {
    label: 'En revisión administrativa',
    className: 'badge badge--warning',
  },
}

const hasOwnKey = (record: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(record, key)

/** Traduce un `reasonCode` de `allowedActions` a español estable (sin exponer texto interno). */
export const describeActionDisabledReason = (reasonCode: string | null | undefined): string =>
  (typeof reasonCode === 'string' && hasOwnKey(ACTION_DISABLED_REASONS, reasonCode)
    ? ACTION_DISABLED_REASONS[reasonCode]
    : undefined) || GENERIC_DISABLED_REASON

/** Etiqueta e insignia CSS para cada estado de incidente proyectado por el servidor. */
export const incidentStatusBadge = (status: IncidentStatus) =>
  STATUS_BADGES[status] ?? {
    label: 'Entrega pendiente de gestión',
    className: 'badge badge--warning',
  }

/**
 * Traduce errores de mutaciones de incidentes a mensajes seguros en español según código conocido,
 * estado HTTP o condición de red, sin propagar textos crudos ni arreglos del servidor.
 */
export const describeIncidentMutationError = (error: unknown): string => {
  if (error instanceof AppError) return error.message

  const { code, status } = shopErrorInfo(error)
  if (typeof code === 'string' && hasOwnKey(MUTATION_CONFLICT_MESSAGES, code)) {
    return MUTATION_CONFLICT_MESSAGES[code]
  }
  if (typeof code === 'string' && hasOwnKey(PICKUP_ERRORS, code)) return PICKUP_ERRORS[code]

  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'
        ? 'El servidor tardó demasiado en responder'
        : 'No se pudo conectar con el servidor'
    }
    if (status === HttpStatusCode.BadRequest || status === HttpStatusCode.UnprocessableEntity) {
      return 'Los datos enviados no son válidos para esta gestión. Revisa la información e inténtalo de nuevo.'
    }
    if (status === HttpStatusCode.Unauthorized) {
      return 'Tu sesión expiró. Vuelve a iniciar sesión para gestionar entregas fallidas.'
    }
    if (status === HttpStatusCode.Forbidden) {
      return 'No tienes permisos para gestionar entregas fallidas.'
    }
    if (status === HttpStatusCode.NotFound) {
      return 'El pedido o el intento fallido ya no está disponible. Actualiza la bandeja para ver el estado actual.'
    }
    if (status === HttpStatusCode.Conflict) {
      return 'El intento, la ruta o el acuerdo cambiaron (por ejemplo, otra persona ya lo gestionó): actualiza la bandeja.'
    }
    if (status === HttpStatusCode.TooManyRequests) {
      return 'Demasiados intentos seguidos. Espera unos segundos y vuelve a intentarlo.'
    }
    if (status !== undefined && status >= 500) {
      return 'El servidor no pudo completar la gestión en este momento. Actualiza la bandeja e inténtalo de nuevo.'
    }
  }

  return 'No se pudo registrar la gestión. Actualiza la bandeja e inténtalo de nuevo.'
}

/** Detecta conflictos de estado obsoleto (`409` / `404`) que requieren refrescar la bandeja. */
export const isStaleIncidentError = (error: unknown): boolean => {
  const { status } = shopErrorInfo(error)
  return status === 409 || status === 404
}
