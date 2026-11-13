import { describeActionError } from '../../lib/http/describeActionError'
import { shopErrorInfo } from '../shop/shopError'

/** Rechazos de emergencias y custodia (backend #51): ninguno deja cambios a medias. */
const EMERGENCY_ERRORS: Record<string, string> = {
  EMERGENCY_ALREADY_DECLARED: 'Esta ruta ya tiene una emergencia declarada.',
  EMERGENCY_ALREADY_CLOSED: 'La emergencia ya estaba cerrada.',
  UNIT_ALREADY_RECOVERED: 'El retorno de esa unidad ya estaba confirmado.',
  UNIT_HAS_ACTIVE_LOSS:
    'Esa unidad tiene una pérdida declarada: anula la pérdida si el producto sí volvió.',
  RECOVERY_PENDING:
    'Todavía hay unidades de este pedido sin recuperar ni reemplazar: resuélvelas antes de volver a planificarlo.',
  DRIVER_ALREADY_RELEASED: 'El retorno del repartidor ya estaba registrado.',
  EMERGENCY_RECOVERY_NOT_FOUND: 'No se encontró esa unidad en la emergencia: actualiza la lista.',
}

export const describeEmergencyError = (error: unknown, fallback: string): string => {
  const code = shopErrorInfo(error).code
  if (code && EMERGENCY_ERRORS[code]) return EMERGENCY_ERRORS[code]
  return describeActionError(error, {
    fallback,
    forbidden: 'Solo un ADMIN puede gestionar emergencias.',
    conflictHint:
      'La ruta o sus unidades cambiaron (por ejemplo, ya no está en curso): revisa el estado actual.',
  })
}
