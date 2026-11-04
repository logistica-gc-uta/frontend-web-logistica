import type { CheckoutItem, DeliveryInput, Quote } from './checkoutTypes'

/**
 * Lo que el flujo de compra conserva entre pasos (y al recargar la página) en `sessionStorage`:
 * datos de entrega, la cotización aceptada y la clave del pago en curso. Nunca la tarjeta.
 */
export interface CheckoutDraft {
  ownerId: string
  delivery: DeliveryInput
  /** Los mismos productos que se cotizaron: si el carrito cambia, hay que volver a cotizar. */
  items: CheckoutItem[]
  quote: Quote
  /** Total que el cliente aceptó explícitamente; el pago no avanza con otro. */
  acceptedTotalCents: number
  /** Clave del intento de pago enviado cuyo resultado todavía no se conoce. */
  pendingKey?: string
}

const KEY = 'regalia.checkout'

export const checkoutStorage = {
  /** Borrador del cliente indicado; el de otra cuenta se descarta. */
  load(ownerId: string): CheckoutDraft | null {
    try {
      const draft = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as CheckoutDraft | null
      return draft?.ownerId === ownerId && draft.quote?.quoteToken ? draft : null
    } catch {
      return null
    }
  },

  save(draft: CheckoutDraft): void {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(draft))
    } catch {
      // Sin almacenamiento el flujo sigue en memoria mientras no se recargue la página.
    }
  },

  clear(): void {
    try {
      sessionStorage.removeItem(KEY)
    } catch {
      // Nada que limpiar.
    }
  },
}

/** El carrito sigue siendo exactamente lo que se cotizó (mismos productos y cantidades). */
export const sameItems = (a: CheckoutItem[], b: CheckoutItem[]): boolean =>
  a.length === b.length &&
  a.every((item) =>
    b.some((other) => other.productId === item.productId && other.quantity === item.quantity),
  )
