import type {
  AdminPurchaseResult,
  AdminReceipt,
  ContactAuditEntry,
  OrderContact,
} from '../features/orders/types'
import { createdGuestOrder } from './fixtures'

/** Venta de invitado confirmada por el servidor: $73,00 + IVA 15 % $10,95 = $83,95, en efectivo. */
export const purchaseResult = (
  overrides: Partial<AdminPurchaseResult> = {},
): AdminPurchaseResult => ({
  ...createdGuestOrder,
  zoneId: null,
  buyerName: 'María Pérez',
  buyerPhone: '0991234567',
  contactRevision: 0,
  receipt: { id: 'receipt-1', number: 'RG-2030-0007' },
  payment: {
    kind: 'ADMIN_DECLARED_EXTERNAL',
    status: 'DECLARED',
    method: 'CASH',
    declaredAt: '2030-02-10T15:00:00.000Z',
  },
  subtotalCents: 7300,
  taxAmountCents: 1095,
  taxRateBps: 1500,
  shippingAmountCents: 0,
  totalCents: 8395,
  ...overrides,
})

export const adminReceipt = (overrides: Partial<AdminReceipt> = {}): AdminReceipt => ({
  id: 'receipt-1',
  number: 'RG-2030-0007',
  orderId: createdGuestOrder.id,
  issuedAt: '2030-02-10T15:00:00.000Z',
  merchantName: 'REGALÍA',
  buyer: { name: 'María Pérez', phone: '0991234567' },
  recipient: { name: 'Ana Regalo', phone: '0987654321' },
  items: [
    {
      sku: 'RG-ROSAS',
      name: 'Ramo de rosas',
      quantity: 2,
      unitPriceCents: 3650,
      lineTotalCents: 7300,
    },
  ],
  currency: 'USD',
  subtotalCents: 7300,
  totalCents: 8395,
  payment: {
    kind: 'ADMIN_DECLARED_EXTERNAL',
    status: 'DECLARED',
    method: 'TRANSFER',
    declaredAt: '2030-02-10T15:00:00.000Z',
  },
  disclaimer: 'COMPROBANTE DE COMPRA SIMULADO — SIN VALIDEZ TRIBUTARIA',
  tax: { enabled: true, rateBps: 1500, ratePercent: 15, amountCents: 1095 },
  shipping: { status: 'FREE_INCLUDED', amountCents: 0 },
  ...overrides,
})

export const orderContact = (overrides: Partial<OrderContact> = {}): OrderContact => ({
  id: createdGuestOrder.id,
  userId: null,
  recipientType: 'GUEST',
  buyerName: 'María Pérez',
  buyerPhone: '0991234567',
  recipientName: 'Ana Regalo',
  recipientPhone: '0987654321',
  contactRevision: 0,
  deliveryAddress: 'Av. Cevallos y Montalvo',
  scheduledDeliveryDate: '2030-02-14T15:00:00.000Z',
  ...overrides,
})

export const contactAudit = (overrides: Partial<ContactAuditEntry> = {}): ContactAuditEntry => ({
  id: 'audit-1',
  field: 'recipientPhone',
  previousValue: '0987654321',
  nextValue: '0999999999',
  actorId: 'admin-1',
  createdAt: '2030-02-11T14:00:00.000Z',
  ...overrides,
})
