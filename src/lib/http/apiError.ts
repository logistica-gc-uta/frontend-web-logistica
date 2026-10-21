import axios from 'axios'
import { AppError } from '../errors/AppError'

const DEFAULT_MESSAGE = 'Ocurrió un error inesperado'
const NETWORK_MESSAGE = 'No se pudo conectar con el servidor'
const TIMEOUT_MESSAGE = 'El servidor tardó demasiado en responder'

interface NestErrorBody {
  message?: string | string[]
}

/**
 * Convierte cualquier error en un mensaje legible para el usuario.
 * NestJS responde `message` como string o como arreglo (errores de class-validator).
 */
export function getErrorMessage(error: unknown, fallback = DEFAULT_MESSAGE): string {
  if (error instanceof AppError) return error.message
  if (!axios.isAxiosError<NestErrorBody>(error)) return fallback
  if (!error.response) return error.code === 'ECONNABORTED' ? TIMEOUT_MESSAGE : NETWORK_MESSAGE

  const { message } = error.response.data ?? {}
  if (Array.isArray(message)) return message.join('. ')
  return message || fallback
}
