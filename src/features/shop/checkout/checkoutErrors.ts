import axios from 'axios'
import { describeOrderUnitsExceeded } from '../orderUnitsLimit'
import { shopErrorInfo } from '../shopError'

/**
 * Qué hacer ante cada error del checkout. Se decide por el código del backend, nunca por el texto:
 * - `fix`: corregir el formulario de entrega.
 * - `cart`: volver al carrito (stock, publicación o límite por SKU cambiaron).
 * - `requote`: volver a cotizar y aceptar el nuevo total.
 * - `card`: pago rechazado; probar con otra tarjeta y una clave nueva.
 * - `verify`: resultado incierto; consultar el intento con su clave original.
 * - `retry`: falla sin cobro registrada; se puede intentar de nuevo.
 */
export type CheckoutAction = 'fix' | 'cart' | 'requote' | 'card' | 'verify' | 'retry'

export interface CheckoutProblem {
  action: CheckoutAction
  code?: string
  message: string
}

const PROBLEMS: Record<string, Omit<CheckoutProblem, 'code'>> = {
  DELIVERY_INVALID: { action: 'fix', message: 'Revisa los datos de entrega: hay alguno inválido.' },
  DELIVERY_OUTSIDE_HOURS: {
    action: 'fix',
    message: 'La hora elegida está fuera del horario de reparto.',
  },
  DELIVERY_OUTSIDE_COVERAGE: {
    action: 'fix',
    message:
      'La ubicación está fuera de la zona de entrega. Mueve el marcador dentro del área marcada.',
  },
  STORE_NOT_CONFIGURED: {
    action: 'fix',
    message:
      'La tienda todavía no definió su zona de entrega: por ahora no se pueden hacer compras con entrega.',
  },
  VALIDATION_ERROR: { action: 'fix', message: 'Revisa los datos: hay alguno inválido.' },
  QUANTITY_LIMIT_EXCEEDED: {
    action: 'cart',
    message: 'Superas el máximo de unidades por regalo. Ajusta el carrito.',
  },
  // Backend #83: el pedido completo supera el máximo de unidades (distinto del límite por regalo).
  ORDER_UNITS_LIMIT_EXCEEDED: {
    action: 'cart',
    message:
      'El pedido supera el máximo de unidades por pedido (sumando todos los productos). Ajusta el carrito.',
  },
  STOCK_UNAVAILABLE: { action: 'cart', message: 'Algún regalo ya no tiene stock suficiente.' },
  PRODUCT_UNPUBLISHED: { action: 'cart', message: 'Algún regalo ya no está disponible.' },
  PRODUCT_NOT_FOUND: { action: 'cart', message: 'Algún regalo ya no está disponible.' },
  PRICE_CHANGED: {
    action: 'requote',
    message: 'Un precio cambió. Revisa y acepta el nuevo total.',
  },
  SHOP_SETTINGS_CHANGED: {
    action: 'requote',
    message: 'La tienda cambió su configuración (IVA o reglas). Revisa y acepta el nuevo total.',
  },
  QUOTE_EXPIRED: {
    action: 'requote',
    message: 'La cotización venció (dura 15 minutos). Revisa y acepta el total actualizado.',
  },
  ITEMS_MISMATCH: { action: 'requote', message: 'El carrito cambió. Vuelve a calcular el total.' },
  DELIVERY_MISMATCH: {
    action: 'requote',
    message: 'La entrega cambió. Vuelve a calcular el total.',
  },
  TAMPERED_TOKEN: {
    action: 'requote',
    message: 'La cotización no es válida. Vuelve a calcular el total.',
  },
  INVALID_TOKEN_FORMAT: {
    action: 'requote',
    message: 'La cotización no es válida. Vuelve a calcular el total.',
  },
  INVALID_TOKEN_TYPE: {
    action: 'requote',
    message: 'La cotización no es válida. Vuelve a calcular el total.',
  },
  BUYER_MISMATCH: {
    action: 'requote',
    message: 'La cotización es de otra sesión. Vuelve a calcular el total.',
  },
  INSUFFICIENT_DEMO_FUNDS: {
    action: 'card',
    message: 'Pago rechazado: la tarjeta de demostración no tiene saldo suficiente.',
  },
  CARD_INVALID: {
    action: 'card',
    message: 'Pago rechazado: los datos de la tarjeta no son válidos.',
  },
  CARD_EXPIRED: { action: 'card', message: 'Pago rechazado: la tarjeta está vencida.' },
  IDEMPOTENCY_KEY_REUSED: {
    action: 'verify',
    message: 'Ese pago ya se envió. Verificando su resultado.',
  },
  PAYMENT_SIMULATION_DISABLED: {
    action: 'retry',
    message: 'El simulador de pagos no está habilitado en este momento. No se hizo ningún cobro.',
  },
}

/**
 * Mensaje con las cifras del rechazo `ORDER_UNITS_LIMIT_EXCEEDED` (backend #83:
 * `details.requestedUnits` y `details.maximumAllowed`), o `null` si el error es otro o no las trae.
 */
export function orderUnitsLimitMessage(
  code: string | undefined,
  details: Record<string, unknown>,
): string | null {
  if (code !== 'ORDER_UNITS_LIMIT_EXCEEDED') return null
  const requested = details.requestedUnits
  const maximum = details.maximumAllowed
  if (typeof requested !== 'number' || typeof maximum !== 'number') return null
  return describeOrderUnitsExceeded(requested, maximum)
}

/** Problema por código (por ejemplo, el `errorCode` de un intento de pago rechazado). */
export const problemForCode = (code: string | null | undefined): CheckoutProblem | null =>
  code && PROBLEMS[code] ? { code, ...PROBLEMS[code] } : null

/**
 * Estado con el que se vuelve al carrito: por stock se usa el aviso de siempre; por cualquier
 * otro motivo (límite por regalo o por pedido, regalo despublicado) se muestra su mensaje.
 */
export const cartReturnState = (
  problem: CheckoutProblem,
): { stockChanged?: boolean; problem?: string } =>
  problem.code === 'STOCK_UNAVAILABLE' || !problem.code
    ? { stockChanged: true }
    : { problem: problem.message }

/** Traduce un error de cotización o de pago a la acción y el mensaje que corresponden. */
export function describeCheckoutError(error: unknown, { isPayment = false } = {}): CheckoutProblem {
  const { status, code, details } = shopErrorInfo(error)
  const unitsLimit = orderUnitsLimitMessage(code, details)
  if (unitsLimit) return { action: 'cart', code, message: unitsLimit }
  const known = problemForCode(code)
  if (known) return known

  // Sin respuesta (red caída o tiempo agotado) o error del servidor: en un pago no se sabe si se
  // cobró, así que se verifica; en una cotización basta con reintentar.
  const noAnswer = axios.isAxiosError(error) && !error.response
  if (isPayment && (noAnswer || (status !== undefined && status >= 500))) {
    return { action: 'verify', code, message: 'Verificando el resultado del pago...' }
  }
  if (noAnswer) {
    return { action: 'retry', message: 'No se pudo conectar con el servidor. Intenta de nuevo.' }
  }
  return { action: 'retry', code, message: 'No se pudo completar la operación. Intenta de nuevo.' }
}
