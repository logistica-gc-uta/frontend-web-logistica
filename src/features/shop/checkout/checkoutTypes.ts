import type { GeoPoint } from '../../../types/geo'

export interface CheckoutItem {
  productId: string
  quantity: number
}

/** Datos de entrega que el cliente envía al cotizar y al pagar (el comprador sale del JWT). */
export interface DeliveryInput {
  recipient: { name: string; phone: string }
  /**
   * Obsoleto desde backend #42: el servidor decide la entrega con la cobertura de la tienda.
   * Solo puede venir en un borrador guardado antes del cambio; el checkout ya no lo envía.
   */
  zoneId?: string
  deliveryAddress: string
  deliveryLocation: GeoPoint
  /** ISO 8601 con offset explícito de Guayaquil (`-05:00`). */
  scheduledDeliveryDate: string
  deliveryNotes?: string
}

export interface QuoteLine {
  productId: string
  name: string
  quantity: number
  unitPriceCents: number
  lineTotalCents: number
  availableStock: number
  available: boolean
}

/** Cotización del servidor (`POST /shop/checkout/quote`): es la fuente de los importes. */
export interface Quote {
  items: QuoteLine[]
  subtotalCents: number
  shipping: { status: 'FREE_INCLUDED'; amountCents: number }
  tax: { enabled: boolean; rateBps: number; ratePercent: number; amountCents: number }
  totalCents: number
  settingsVersion: number
  validUntil: string
  quoteToken: string
}

/** Tarjeta ficticia: solo vive en el formulario y en la petición de pago, nunca se guarda. */
export interface CardInput {
  number: string
  holderName: string
  expiresMonth: number
  expiresYear: number
  cvv: string
}

export interface CheckoutSuccess {
  checkoutAttemptId: string
  status: 'SUCCEEDED'
  order: { id: string; number: string; totalCents: number; scheduledDeliveryDate: string }
  payment: { status: 'APPROVED'; amountCents: number; cardLast4: string; reference: string }
  receipt: { id: string; number: string }
}

export type AttemptStatus = 'PROCESSING' | 'SUCCEEDED' | 'REJECTED' | 'FAILED'

export interface CheckoutAttempt {
  status: AttemptStatus
  orderId: string | null
  errorCode: string | null
}
