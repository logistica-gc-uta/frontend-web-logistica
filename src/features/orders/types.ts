import type { GeoPoint } from '../../types/geo'
import type { AdminClient } from './adminClientsService'

export type OrderStatus = 'PENDING' | 'ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED'

export const ORDER_STATUSES: readonly OrderStatus[] = [
  'PENDING',
  'ASSIGNED',
  'IN_TRANSIT',
  'DELIVERED',
  'CANCELLED',
]

export interface OrderItem {
  id: string
  productId: string
  quantity: number
  /** Precio unitario al momento de crear el pedido. */
  price: number
  product: { id: string; name: string }
}

/** Si el pedido cumple los requisitos geográficos mínimos para la planificación de rutas. */
export interface PlanningEligibility {
  eligible: boolean
  /** Códigos del backend; pueden aparecer códigos nuevos, por eso no se restringe el tipo. */
  reasons: string[]
}

/** Pedido tal como lo devuelve `POST /orders/admin` al crearlo: sin productos, zona ni aptitud. */
export interface CreatedOrder {
  id: string
  userId: string | null
  recipientType: 'REGISTERED_CLIENT' | 'GUEST' | null
  recipientName: string | null
  recipientPhone: string | null
  /** `null` en pedidos con cobertura de tienda (backend #42); los antiguos conservan su zona. */
  zoneId: string | null
  deliveryAddress: string
  deliveryLat: number | null
  deliveryLng: number | null
  scheduledDeliveryDate: string | null
  status: OrderStatus
  total: number
  routeId: string | null
  createdAt: string
}

/** Pedido tal como lo devuelve `GET /orders` (proyección de ADMIN). */
export interface Order extends CreatedOrder {
  user?: { id: string; name: string }
  items: OrderItem[]
  zone: { id: string; name: string; code: string } | null
  deliveryLocation: GeoPoint | null
  planningEligibility: PlanningEligibility
}

/** Respuesta paginada de `GET /orders`. */
export interface OrdersPage {
  items: Order[]
  total: number
  page: number
  pageSize: number
}

/** Parámetros de `GET /orders`. La fecha es el día de entrega en horario de Guayaquil (aaaa-mm-dd). */
export interface OrdersQuery {
  page: number
  pageSize: number
  date?: string
  zoneId?: string
  status?: OrderStatus
}

/** Comprador de una venta registrada por ADMIN: cliente con cuenta o invitado (backend #45). */
export type AdminPurchaseBuyer =
  | { type: 'REGISTERED_CLIENT'; clientId: string; contactPhone: string }
  | { type: 'GUEST'; name: string; contactPhone: string }

/** Pago hecho fuera del Shop y declarado por ADMIN: no es una verificación bancaria. */
export type DeclaredPaymentMethod = 'CASH' | 'TRANSFER'

/** Cuerpo de `POST /orders/admin` (venta con pago externo declarado; sin zona desde #42). */
export interface CreateAdminPurchaseInput {
  buyer: AdminPurchaseBuyer
  /** Solo si el regalo lo recibe otra persona; si no, recibe el comprador. */
  giftRecipient?: { name: string; contactPhone: string }
  payment: { method: DeclaredPaymentMethod; note?: string }
  /**
   * Opcional y obsoleto (#42): el formulario no lo envía. Solo lo usan las pruebas que necesitan
   * pedidos planificables hasta que backend #49 planifique por cobertura.
   */
  zoneId?: string
  deliveryAddress: string
  items: { productId: string; quantity: number }[]
  /** Instante ISO 8601 con desfase de zona horaria explícito. */
  scheduledDeliveryDate: string
  deliveryLat: number
  deliveryLng: number
}

/** Respuesta de una venta confirmada: el pedido, su comprobante y los importes del servidor. */
export interface AdminPurchaseResult extends CreatedOrder {
  buyerName: string | null
  buyerPhone: string | null
  contactRevision: number
  receipt: { id: string; number: string }
  payment: {
    kind: 'ADMIN_DECLARED_EXTERNAL'
    status: 'DECLARED'
    method: DeclaredPaymentMethod
    declaredAt: string
  }
  subtotalCents: number
  taxAmountCents: number
  taxRateBps: number
  shippingAmountCents: number
  totalCents: number
}

/** `GET /orders/admin/purchase-attempts/:key`: estado de una venta cuyo resultado no se conoce. */
export interface AdminPurchaseAttempt {
  status: 'PROCESSING' | 'SUCCEEDED' | 'REJECTED' | 'FAILED'
  orderId: string | null
  errorCode: string | null
  result?: AdminPurchaseResult
}

/** Comprobante imprimible (`GET /orders/:id/receipt`) de una venta ADMIN o del Shop. */
export interface AdminReceipt {
  id: string
  number: string
  orderId: string
  issuedAt: string
  merchantName: string
  buyer: { name: string; phone?: string; email?: string }
  recipient: { name: string; phone: string }
  items: {
    sku: string
    name: string
    quantity: number
    unitPriceCents: number
    lineTotalCents: number
  }[]
  currency: 'USD'
  subtotalCents: number
  totalCents: number
  payment:
    | {
        kind: 'ADMIN_DECLARED_EXTERNAL'
        status: 'DECLARED'
        method: DeclaredPaymentMethod
        declaredAt: string
      }
    | { kind?: 'SIMULATED_CARD'; status: 'APPROVED'; reference: string; cardLast4: string }
  disclaimer: string
  tax: { enabled: boolean; rateBps: number; ratePercent: number; amountCents: number }
  shipping: { status: 'FREE_INCLUDED'; amountCents: number }
}

/** Datos de contacto del pedido que ADMIN puede corregir (con su versión). */
export interface OrderContact {
  id: string
  userId: string | null
  recipientType: 'REGISTERED_CLIENT' | 'GUEST' | null
  buyerName: string | null
  buyerPhone: string | null
  recipientName: string | null
  recipientPhone: string | null
  contactRevision: number
  deliveryAddress: string
  scheduledDeliveryDate: string | null
}

/** Cuerpo de `PATCH /orders/:id/contact`: solo los campos que cambian, con la versión actual. */
export interface OrderContactChange {
  contactRevision: number
  buyerName?: string
  buyerPhone?: string
  recipientName?: string
  recipientPhone?: string
}

/** Una corrección registrada en `GET /orders/:id/contact-history`. */
export interface ContactAuditEntry {
  id: string
  field: 'buyerName' | 'buyerPhone' | 'recipientName' | 'recipientPhone'
  previousValue: string | null
  nextValue: string
  actorId: string
  createdAt: string
}

/** Línea de producto del formulario; la cantidad se captura como texto. */
export type OrderItemFormValue = {
  productId: string
  quantity: string
}

/** Valores del formulario de venta ADMIN. */
export type OrderFormValues = {
  buyerType: 'GUEST' | 'REGISTERED_CLIENT'
  /** Cuenta elegida en el buscador cuando el comprador es un cliente registrado. */
  client: AdminClient | null
  /** Nombre del invitado (con cliente registrado se usa el de su cuenta). */
  buyerName: string
  buyerPhone: string
  /** El regalo lo recibe otra persona distinta del comprador. */
  giftToOther: boolean
  recipientName: string
  recipientPhone: string
  paymentMethod: '' | DeclaredPaymentMethod
  paymentNote: string
  deliveryAddress: string
  /** Fecha y hora en horario de Guayaquil, formato de `datetime-local` (aaaa-mm-ddThh:mm). */
  scheduledAt: string
  items: OrderItemFormValue[]
  /** Punto elegido en el mapa. */
  location: GeoPoint | null
  /** El operador confirmó el punto actual. Mover el marcador anula la confirmación. */
  locationConfirmed: boolean
}
