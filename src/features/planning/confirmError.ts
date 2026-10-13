import axios, { HttpStatusCode } from 'axios'
import { getErrorMessage } from '../../lib/http/apiError'

interface RouteActionMessages {
  /** Mensaje si el error no trae uno propio. */
  fallback: string
  /** Mensaje ante un 403. */
  forbidden: string
  /** Qué hacer ante un 409 (otro proceso ya tomó el pedido o el chofer). */
  conflictHint: string
}

/**
 * Explica por qué falló una acción sobre rutas. Una falla nunca se presenta como éxito: el
 * operador debe poder distinguir un conflicto de un problema de permisos o de conexión.
 */
function describeRouteActionError(error: unknown, messages: RouteActionMessages): string {
  const detail = getErrorMessage(error, messages.fallback)
  const status = axios.isAxiosError(error) ? error.response?.status : undefined

  if (status === HttpStatusCode.Forbidden) return messages.forbidden
  if (status === HttpStatusCode.Conflict) return `Conflicto: ${detail}. ${messages.conflictHint}`
  return detail
}

export const describeConfirmError = (error: unknown): string =>
  describeRouteActionError(error, {
    fallback: 'No se pudo confirmar la ruta',
    forbidden: 'No tienes permisos para confirmar rutas.',
    conflictHint: 'Vuelve a previsualizar para ver el estado actual de los pedidos.',
  })

export const describeAssignError = (error: unknown): string =>
  describeRouteActionError(error, {
    fallback: 'No se pudo asignar el chofer',
    forbidden: 'No tienes permisos para asignar choferes.',
    conflictHint: 'El chofer o la ruta cambiaron: revisa la lista actualizada.',
  })
