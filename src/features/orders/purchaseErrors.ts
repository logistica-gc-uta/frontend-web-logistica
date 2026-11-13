import axios from 'axios'
import { getErrorMessage } from '../../lib/http/apiError'
import { shopErrorInfo } from '../shop/shopError'

/**
 * Qué hacer cuando falla el registro de una venta ADMIN:
 * - `fix`: rechazo definitivo; no se registró nada. Corregir y volver a enviar (con otra clave).
 * - `verify`: no se sabe si se registró (red caída, tiempo agotado, error del servidor o venta en
 *   proceso). Se consulta el intento con la MISMA clave antes de volver a enviar.
 * - `newKey`: la clave ya se usó con otros datos; se reintenta con una clave nueva.
 */
export type PurchaseAction = 'fix' | 'verify' | 'newKey'

export interface PurchaseProblem {
  action: PurchaseAction
  message: string
}

const BY_CODE: Record<string, PurchaseProblem> = {
  DELIVERY_OUTSIDE_COVERAGE: {
    action: 'fix',
    message:
      'La ubicación está fuera de la zona de entrega. Mueve el marcador dentro del área marcada.',
  },
  DELIVERY_OUTSIDE_HOURS: {
    action: 'fix',
    message: 'La hora elegida está fuera del horario de reparto.',
  },
  STORE_NOT_CONFIGURED: {
    action: 'fix',
    message:
      'La tienda todavía no definió su zona de entrega: configúrala en «Tienda y cobertura» antes de registrar ventas.',
  },
  ADMIN_PURCHASE_IN_PROGRESS: {
    action: 'verify',
    message: 'Esta venta todavía se está registrando. Verifica su resultado en unos segundos.',
  },
  IDEMPOTENCY_KEY_REUSED: {
    action: 'newKey',
    message: 'Los datos cambiaron desde el envío anterior. Vuelve a registrar la venta.',
  },
}

/** Traduce el error del registro a la acción que corresponde. Nunca se presenta como éxito. */
export function describePurchaseError(error: unknown): PurchaseProblem {
  const { status, code } = shopErrorInfo(error)
  if (code && BY_CODE[code]) return BY_CODE[code]

  // Sin respuesta o error del servidor: la venta pudo haberse registrado. Se verifica, no se repite.
  if (axios.isAxiosError(error) && !error.response) {
    return {
      action: 'verify',
      message: 'Se perdió la conexión al registrar la venta. Verificando si quedó registrada…',
    }
  }
  if (status !== undefined && status >= 500) {
    return {
      action: 'verify',
      message: 'El servidor no confirmó la venta. Verificando si quedó registrada…',
    }
  }
  if (status === 403) {
    return { action: 'fix', message: 'Solo un ADMIN puede registrar ventas.' }
  }
  const backendMessage = getErrorMessage(error, '')
  if (/Registered client not found/i.test(backendMessage)) {
    return {
      action: 'fix',
      message: 'No se registró la venta: la cuenta del cliente ya no existe. Búscala de nuevo.',
    }
  }
  if (/Registered owner must be a CLIENT/i.test(backendMessage)) {
    return {
      action: 'fix',
      message: 'No se registró la venta: esa cuenta no es de un cliente. Elige otra.',
    }
  }
  if (status === 404) {
    return {
      action: 'fix',
      message: getErrorMessage(error, 'Algún dato de la venta ya no existe.'),
    }
  }
  // Productos antiguos sin precio en centavos: el backend responde en inglés; se traduce.
  const missingPrice = /Product '(.+)' has no valid price in cents/.exec(getErrorMessage(error, ''))
  if (missingPrice) {
    return {
      action: 'fix',
      message: `No se registró la venta: «${missingPrice[1]}» no tiene un precio en centavos configurado. Corrige su precio en Productos o elige otro producto.`,
    }
  }
  // 400 de validación o de stock: el backend ya explica el motivo en español.
  return {
    action: 'fix',
    message: `No se registró la venta: ${getErrorMessage(error, 'revisa los datos.')}`,
  }
}
