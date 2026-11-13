import axios from 'axios'

/** Lo que nunca cambia cuando el motor vial falla: se dice siempre para tranquilizar al ADMIN. */
export const ROAD_ERROR_SAFE =
  'No se generó ninguna ruta: los pedidos siguen pendientes y las rutas guardadas no cambian.'

const ROAD_MESSAGES: Record<string, string> = {
  ROAD_ENGINE_UNAVAILABLE:
    'El motor vial no responde ahora, así que no se pueden calcular recorridos por calles. Vuelve a intentarlo en unos minutos.',
  ROAD_ENGINE_BAD_RESPONSE:
    'El motor vial devolvió datos incompletos y no se usaron. Vuelve a intentarlo en unos minutos.',
  ROAD_ROUTE_NOT_FOUND: 'No hay un recorrido por calles hasta algunos pedidos.',
  ROAD_POINT_OFF_NETWORK: 'Algunas ubicaciones de entrega están lejos de cualquier calle.',
  ROAD_MATRIX_TOO_LARGE:
    'Hay demasiados pedidos para medirlos de una vez: planifica por zona para reducir la cantidad.',
}

/** Rechazos de `GET /route-proposals` (`{statusCode, error, code, message, details}`). */
interface RoadErrorBody {
  code?: string
  details?: { orderIds?: unknown }
}

/**
 * Explica un error del motor vial (backend #47), o `null` si el error no es del motor. Nunca se
 * sustituye por una propuesta en línea recta: el backend no la genera y la web tampoco.
 */
export function describeRoadError(error: unknown): string | null {
  if (!axios.isAxiosError<RoadErrorBody>(error)) return null
  const body = error.response?.data
  const code = body?.code
  if (!code || !ROAD_MESSAGES[code]) return null

  const orderIds = Array.isArray(body?.details?.orderIds) ? body.details.orderIds : []
  const affected =
    orderIds.length > 0
      ? ` Pedidos afectados: ${orderIds.length}. Revisa su ubicación en Pedidos.`
      : ''
  return `${ROAD_MESSAGES[code]}${affected} ${ROAD_ERROR_SAFE}`
}
