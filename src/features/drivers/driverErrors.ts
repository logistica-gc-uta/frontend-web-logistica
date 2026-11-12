import axios from 'axios'
import { getErrorMessage } from '../../lib/http/apiError'
import { shopErrorInfo } from '../shop/shopError'

/** Mensajes por código del backend (#43, #44); nunca por el texto en inglés. */
const MESSAGES: Record<string, string> = {
  EMAIL_ALREADY_EXISTS: 'Ya existe una cuenta con ese correo.',
  ABSENCE_OVERLAP: 'Ya hay una ausencia activa que se cruza con esas fechas.',
  ABSENCE_DATE_IN_PAST: 'Solo se registran ausencias de hoy o de fechas futuras.',
  ABSENCE_RANGE_INVALID: 'La fecha final no puede ser anterior a la inicial.',
  INVALID_DATE: 'Alguna fecha no es válida.',
  ABSENCE_ALREADY_CANCELLED: 'Esa ausencia ya estaba anulada.',
  ABSENCE_ALREADY_ELAPSED: 'Esa ausencia ya terminó: no se puede anular.',
  AVAILABILITY_DATE_IN_PAST: 'Solo se consulta la disponibilidad de hoy o de fechas futuras.',
}

/** Código de error del backend: algunos módulos lo ponen en la raíz y otros dentro de `error`. */
function codeOf(error: unknown): string | undefined {
  if (!axios.isAxiosError<{ code?: string }>(error)) return undefined
  return error.response?.data?.code ?? shopErrorInfo(error).code
}

export function describeDriverError(error: unknown, fallback: string): string {
  const code = codeOf(error)
  if (code && MESSAGES[code]) return MESSAGES[code]
  const { status } = shopErrorInfo(error)
  if (status === 401) return 'Tu sesión venció. Vuelve a iniciar sesión.'
  if (status === 403) return 'Solo un ADMIN puede gestionar repartidores.'
  if (status === 404) return 'Ese repartidor ya no existe.'
  if (axios.isAxiosError(error) && !error.response) return 'No se pudo conectar con el servidor.'
  return getErrorMessage(error, fallback)
}
