import axios from 'axios'

/**
 * Los módulos del Shop responden `{ error: { code, message, details } }`; los de autenticación,
 * `{ code, message }` al estilo NestJS. Aquí se leen ambos para decidir por código, no por texto.
 */
interface ErrorBody {
  code?: string
  message?: string | string[]
  error?: { code?: string; message?: string; details?: Record<string, unknown> } | string
}

export interface ShopErrorInfo {
  status?: number
  code?: string
  details: Record<string, unknown>
}

export function shopErrorInfo(error: unknown): ShopErrorInfo {
  if (!axios.isAxiosError<ErrorBody>(error)) return { details: {} }
  const body = error.response?.data
  const nested = typeof body?.error === 'object' ? body.error : undefined
  return {
    status: error.response?.status,
    code: nested?.code ?? body?.code,
    details: nested?.details ?? {},
  }
}

/** Código de error del Shop, si la respuesta lo trae. */
export const shopErrorCode = (error: unknown): string | undefined => shopErrorInfo(error).code
