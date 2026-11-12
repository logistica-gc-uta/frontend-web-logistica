import { AppError } from '../../../lib/errors/AppError'
import type { OrderStatus } from '../../orders/types'
import { customerApiClient } from '../account/customerApiClient'
import { shopErrorInfo } from '../shopError'

/** Importes congelados al comprar: no se recalculan si después el ADMIN cambia el IVA. */
export interface OrderAmounts {
  subtotalCents: number
  taxAmountCents: number
  taxRateBps: number
  taxEnabled: boolean
  shippingAmountCents: number
  totalCents: number
}

/**
 * Origen de la compra (backend #46): `SHOP` la hizo el cliente en la web; `ADMIN` la registró la
 * tienda a su nombre. Un pedido antiguo sin creador se trata como `SHOP`.
 */
export type OrderSource = 'SHOP' | 'ADMIN'

/** Los importes son `null` en un pedido que se conserva sin comprobante: no se reconstruyen. */
type MaybeAmounts = { [K in keyof OrderAmounts]: OrderAmounts[K] | null }

export interface CustomerOrderSummary extends MaybeAmounts {
  id: string
  source: OrderSource
  /** `false`: pedido conservado sin comprobante fiable (sin número, importes ni productos). */
  receiptAvailable: boolean
  number: string | null
  createdAt: string
  scheduledDeliveryDate: string | null
  status: OrderStatus
  paymentStatus: 'APPROVED' | null
  itemsCount: number | null
  primaryImageUrl: string | null
  primaryProductId: string | null
  receiptId: string | null
}

export interface CustomerOrderPage {
  items: CustomerOrderSummary[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface CustomerOrderDetail extends MaybeAmounts {
  id: string
  source: OrderSource
  receiptAvailable: boolean
  number: string | null
  createdAt: string
  scheduledDeliveryDate: string | null
  status: OrderStatus
  /**
   * El backend dice `APPROVED` también en las compras de tienda: el pago real (efectivo o
   * transferencia declarados) solo viene en el comprobante. Se interpreta con `source`.
   */
  paymentStatus: 'APPROVED' | null
  buyer: { name: string; email: string }
  /** Puede faltar en un pedido conservado sin comprobante. */
  recipient: { name: string; phone: string } | null
  delivery: {
    /** `null` en los pedidos con cobertura de tienda (backend #42); los antiguos traen su zona. */
    zoneName: string | null
    address: string
    location: { lat: number; lng: number } | null
    scheduledDeliveryDate: string | null
    notes: string | null
  }
  /** Vacío en un pedido sin comprobante: no se reconstruyen productos con el catálogo actual. */
  items: {
    productId: string
    name: string
    quantity: number
    unitPriceCents: number
    lineTotalCents: number
    imageUrl: string | null
  }[]
  /** Cambios reales registrados por el backend (creado, asignado, en ruta, entregado…). */
  timeline: { code: string; label: string; at: string }[]
}

/** Pago de un comprobante: tarjeta de demostración (Shop) o declarado en la tienda (ADMIN). */
export type ReceiptPayment =
  | { kind?: 'SIMULATED_CARD'; status: 'APPROVED'; reference: string; cardLast4: string }
  | {
      kind: 'ADMIN_DECLARED_EXTERNAL'
      status: 'DECLARED'
      method: 'CASH' | 'TRANSFER'
      declaredAt: string
    }

export interface Receipt {
  id: string
  number: string
  orderId: string
  issuedAt: string
  merchantName: string
  disclaimer: string
  buyer: { name: string; email?: string; phone?: string }
  recipient: { name: string; phone?: string }
  items: {
    sku: string
    name: string
    quantity: number
    unitPriceCents: number
    lineTotalCents: number
  }[]
  subtotalCents: number
  totalCents: number
  payment: ReceiptPayment
  tax: { enabled: boolean; ratePercent: number; amountCents: number }
  shipping: { amountCents: number }
}

/** Los importes del pedido si tiene comprobante; `null` si se conserva sin él. */
export function amountsOf(order: MaybeAmounts): OrderAmounts | null {
  const { subtotalCents, taxAmountCents, taxRateBps, taxEnabled, shippingAmountCents, totalCents } =
    order
  if (
    subtotalCents === null ||
    taxAmountCents === null ||
    taxRateBps === null ||
    taxEnabled === null ||
    shippingAmountCents === null ||
    totalCents === null
  ) {
    return null
  }
  return { subtotalCents, taxAmountCents, taxRateBps, taxEnabled, shippingAmountCents, totalCents }
}

export const ORDER_NOT_FOUND_MESSAGE = 'No encontramos este pedido en tu cuenta.'
export const RECEIPT_UNAVAILABLE_MESSAGE =
  'Este pedido no tiene comprobante. Su seguimiento sigue disponible en el detalle.'

/** El pedido es tuyo pero se conserva sin comprobante (`RECEIPT_UNAVAILABLE`). */
export class ReceiptUnavailableError extends AppError {
  constructor() {
    super(RECEIPT_UNAVAILABLE_MESSAGE)
  }
}

/** Un pedido inexistente o de otra cuenta se informa igual, sin revelar si existe. */
function translate(error: unknown): never {
  const { status, code } = shopErrorInfo(error)
  if (code === 'RECEIPT_UNAVAILABLE') throw new ReceiptUnavailableError()
  if (status === 404 || status === 403 || status === 400)
    throw new AppError(ORDER_NOT_FOUND_MESSAGE)
  throw error
}

/** Pedidos del cliente autenticado (el backend filtra por el comprador del token). */
export const customerOrdersService = {
  /** Compras propias de la web y de la tienda en una sola lista, de la más reciente a la más antigua. */
  async list(page: number, pageSize = 10, status?: OrderStatus): Promise<CustomerOrderPage> {
    const { data } = await customerApiClient.get<CustomerOrderPage>('/shop/orders', {
      params: { page, pageSize, ...(status ? { status } : {}) },
    })
    return data
  },

  async detail(id: string): Promise<CustomerOrderDetail> {
    const { data } = await customerApiClient
      .get<CustomerOrderDetail>(`/shop/orders/${encodeURIComponent(id)}`)
      .catch(translate)
    return data
  },

  async receipt(orderId: string): Promise<Receipt> {
    const { data } = await customerApiClient
      .get<Receipt>(`/shop/orders/${encodeURIComponent(orderId)}/receipt`)
      .catch(translate)
    return data
  },
}
