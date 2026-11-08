import { customerStorage } from '../features/shop/account/customerStorage'
import type { CheckoutDraft } from '../features/shop/checkout/checkoutStorage'
import type { CheckoutSuccess, DeliveryInput, Quote } from '../features/shop/checkout/checkoutTypes'
import type {
  CustomerOrderDetail,
  CustomerOrderSummary,
  Receipt,
} from '../features/shop/orders/customerOrdersService'
import type { AuthUser, Session } from '../types/auth'

export const customer: AuthUser = {
  id: 'cliente-1',
  name: 'Kerly Cliente',
  email: 'kerly@regalia.test',
  role: 'CLIENT',
}

export const customerSession: Session = { token: 'token-cliente', user: customer }

/** Simula un cliente con sesión iniciada en el Shop. */
export const signInCustomer = (session: Session = customerSession) => customerStorage.save(session)

export const delivery: DeliveryInput = {
  recipient: { name: 'Ana Regalo', phone: '0991234567' },
  zoneId: 'zona-centro',
  deliveryAddress: 'Av. Cevallos y Montalvo',
  deliveryLocation: { lat: -1.25, lng: -78.63 },
  scheduledDeliveryDate: '2030-02-15T10:00:00-05:00',
}

/** Cotización del caso del issue: $73,00 + IVA simulado 15 % ($10,95) + envío $0 = $83,95. */
export const quote = (overrides: Partial<Quote> = {}): Quote => ({
  items: [
    {
      productId: 'p-rosas',
      name: 'Ramo de rosas',
      quantity: 2,
      unitPriceCents: 3650,
      lineTotalCents: 7300,
      availableStock: 20,
      available: true,
    },
  ],
  subtotalCents: 7300,
  shipping: { status: 'FREE_INCLUDED', amountCents: 0 },
  tax: { enabled: true, rateBps: 1500, ratePercent: 15, amountCents: 1095 },
  totalCents: 8395,
  settingsVersion: 1,
  validUntil: '2099-01-01T00:00:00Z',
  quoteToken: 'qtk_v1.prueba',
  ...overrides,
})

export const checkoutDraft = (overrides: Partial<CheckoutDraft> = {}): CheckoutDraft => ({
  ownerId: customer.id,
  delivery,
  items: [{ productId: 'p-rosas', quantity: 2 }],
  quote: quote(),
  acceptedTotalCents: 8395,
  ...overrides,
})

export const checkoutSuccess: CheckoutSuccess = {
  checkoutAttemptId: 'intento-1',
  status: 'SUCCEEDED',
  order: {
    id: 'pedido-1',
    number: 'RG-2030-0001',
    totalCents: 8395,
    scheduledDeliveryDate: '2030-02-15T15:00:00Z',
  },
  payment: { status: 'APPROVED', amountCents: 8395, cardLast4: '0001', reference: 'PAY-DEMO-1' },
  receipt: { id: 'comprobante-1', number: 'CMP-RG-2030-0001' },
}

const amounts = {
  subtotalCents: 7300,
  taxAmountCents: 1095,
  taxRateBps: 1500,
  taxEnabled: true,
  shippingAmountCents: 0,
  totalCents: 8395,
}

export const orderSummary = (
  overrides: Partial<CustomerOrderSummary> = {},
): CustomerOrderSummary => ({
  id: 'pedido-1',
  number: 'RG-2030-0001',
  createdAt: '2030-02-10T15:00:00Z',
  scheduledDeliveryDate: '2030-02-15T15:00:00Z',
  status: 'PENDING',
  itemsCount: 2,
  primaryImageUrl: null,
  primaryProductId: 'p-rosas',
  receiptId: 'comprobante-1',
  ...amounts,
  ...overrides,
})

export const orderDetail = (overrides: Partial<CustomerOrderDetail> = {}): CustomerOrderDetail => ({
  id: 'pedido-1',
  number: 'RG-2030-0001',
  createdAt: '2030-02-10T15:00:00Z',
  scheduledDeliveryDate: '2030-02-15T15:00:00Z',
  status: 'PENDING',
  paymentStatus: 'APPROVED',
  buyer: { name: customer.name, email: customer.email },
  recipient: { name: 'Ana Regalo', phone: '0991234567' },
  delivery: {
    zoneName: 'Centro',
    address: 'Av. Cevallos y Montalvo',
    location: { lat: -1.25, lng: -78.63 },
    scheduledDeliveryDate: '2030-02-15T15:00:00Z',
    notes: null,
  },
  items: [
    {
      productId: 'p-rosas',
      name: 'Ramo de rosas',
      quantity: 2,
      unitPriceCents: 3650,
      lineTotalCents: 7300,
      imageUrl: null,
    },
  ],
  timeline: [{ code: 'PENDING', label: 'Pedido registrado', at: '2030-02-10T15:00:00Z' }],
  ...amounts,
  ...overrides,
})

export const receipt = (overrides: Partial<Receipt> = {}): Receipt => ({
  id: 'comprobante-1',
  number: 'CMP-RG-2030-0001',
  orderId: 'pedido-1',
  issuedAt: '2030-02-10T15:00:00Z',
  merchantName: 'REGALÍA',
  disclaimer: 'COMPROBANTE DE COMPRA SIMULADO — SIN VALIDEZ TRIBUTARIA',
  buyer: { name: customer.name, email: customer.email },
  recipient: { name: 'Ana Regalo' },
  items: [
    {
      sku: 'SKU-1',
      name: 'Ramo de rosas',
      quantity: 2,
      unitPriceCents: 3650,
      lineTotalCents: 7300,
    },
  ],
  subtotalCents: 7300,
  totalCents: 8395,
  payment: { status: 'APPROVED', reference: 'PAY-DEMO-1', cardLast4: '0001' },
  tax: { enabled: true, ratePercent: 15, amountCents: 1095 },
  shipping: { amountCents: 0 },
  ...overrides,
})
