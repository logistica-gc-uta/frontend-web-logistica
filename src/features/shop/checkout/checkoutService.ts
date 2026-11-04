import { customerApiClient } from '../account/customerApiClient'
import type {
  CardInput,
  CheckoutAttempt,
  CheckoutItem,
  CheckoutSuccess,
  DeliveryInput,
  Quote,
} from './checkoutTypes'

/** Tiempo máximo de espera del pago; pasado ese tiempo el resultado se verifica por su clave. */
export const PAYMENT_TIMEOUT_MS = 20_000

export const checkoutService = {
  /** Importes, IVA simulado y token de cotización calculados por el servidor (15 minutos). */
  async quote(items: CheckoutItem[], delivery: DeliveryInput): Promise<Quote> {
    const { data } = await customerApiClient.post<Quote>('/shop/checkout/quote', {
      items,
      delivery,
    })
    return data
  },

  /**
   * Pago con tarjeta ficticia. `idempotencyKey` identifica el intento: si se repite la misma clave,
   * el servidor no cobra dos veces. La tarjeta viaja solo en el cuerpo de esta petición.
   */
  async pay(
    idempotencyKey: string,
    body: {
      items: CheckoutItem[]
      delivery: DeliveryInput
      quoteToken: string
      paymentCard: CardInput
    },
  ): Promise<CheckoutSuccess> {
    const { data } = await customerApiClient.post<CheckoutSuccess>('/shop/checkout', body, {
      headers: { 'Idempotency-Key': idempotencyKey },
      timeout: PAYMENT_TIMEOUT_MS,
    })
    return data
  },

  /** Estado de un intento por su clave ORIGINAL, para resolver un pago incierto. */
  async attempt(idempotencyKey: string): Promise<CheckoutAttempt> {
    const { data } = await customerApiClient.get<CheckoutAttempt>(
      `/shop/checkout-attempts/${encodeURIComponent(idempotencyKey)}`,
    )
    return { status: data.status, orderId: data.orderId, errorCode: data.errorCode }
  },
}
