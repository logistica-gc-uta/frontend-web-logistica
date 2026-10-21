import axios, { HttpStatusCode } from 'axios'
import { getErrorMessage } from './apiError'

export interface ActionErrorMessages {
  /** Mensaje si el error no trae uno propio. */
  fallback: string
  /** Mensaje ante un 403. */
  forbidden: string
  /** Qué hacer ante un 409 (otro proceso cambió el pedido, la ruta o el chofer). */
  conflictHint: string
}

/**
 * Explica por qué falló una acción administrativa. Una falla nunca se presenta como éxito: el
 * operador debe poder distinguir un conflicto de un problema de permisos o de conexión.
 */
export function describeActionError(error: unknown, messages: ActionErrorMessages): string {
  const detail = getErrorMessage(error, messages.fallback)
  const status = axios.isAxiosError(error) ? error.response?.status : undefined

  if (status === HttpStatusCode.Forbidden) return messages.forbidden
  if (status === HttpStatusCode.Conflict) return `Conflicto: ${detail}. ${messages.conflictHint}`
  return detail
}
