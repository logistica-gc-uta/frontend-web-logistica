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

export interface CustomerOrderSummary extends OrderAmounts {
  id: string
  number: string
  createdAt: string
  scheduledDeliveryDate: string
  status: OrderStatus
  itemsCount: number
  primaryImageUrl: string | null
  primaryProductId: string | null
  receiptId: string
}

export interface CustomerOrderPage {
  items: CustomerOrderSummary[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface CustomerOrderDetail extends OrderAmounts {
  id: string
  number: string
  createdAt: string
  scheduledDeliveryDate: string
  status: OrderStatus
  paymentStatus: 'APPROVED'
  buyer: { name: string; email: string }
  recipient: { name: string; phone: string }
  delivery: {
    /** `null` en los pedidos con cobertura de tienda (backend #42); los antiguos traen su zona. */
    zoneName: string | null
    address: string
    location: { lat: number; lng: number }
    scheduledDeliveryDate: string
    notes: string | null
  }
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

export interface Receipt {
  id: string
  number: string
  orderId: string
  issuedAt: string
  merchantName: string
  disclaimer: string
  buyer: { name: string; email: string }
  recipient: { name: string }
  items: {
    sku: string
    name: string
    quantity: number
    unitPriceCents: number
    lineTotalCents: number
  }[]
  subtotalCents: number
  totalCents: number
  payment: { status: 'APPROVED'; reference: string; cardLast4: string }
  tax: { enabled: boolean; ratePercent: number; amountCents: number }
  shipping: { amountCents: number }
}

export const ORDER_NOT_FOUND_MESSAGE = 'No encontramos este pedido en tu cuenta.'

/** Un pedido inexistente o de otra cuenta se informa igual, sin revelar si existe. */
function translate(error: unknown): never {
  const { status } = shopErrorInfo(error)
  if (status === 404 || status === 403 || status === 400)
    throw new AppError(ORDER_NOT_FOUND_MESSAGE)
  throw error
}

/** Pedidos del cliente autenticado (el backend filtra por el comprador del token). */
export const customerOrdersService = {
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
