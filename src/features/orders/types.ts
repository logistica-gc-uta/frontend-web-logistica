import type { GeoPoint } from '../../types/geo'

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
  zoneId: string
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
  zone: { id: string; name: string; code: string }
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

/** Cuerpo de `POST /orders/admin` para un destinatario invitado (sin cuenta). */
export interface CreateAdminOrderInput {
  recipient: { type: 'GUEST'; name: string; contactPhone: string }
  zoneId: string
  deliveryAddress: string
  items: { productId: string; quantity: number }[]
  /** Instante ISO 8601 con desfase de zona horaria explícito. */
  scheduledDeliveryDate: string
  deliveryLat: number
  deliveryLng: number
}

/** Línea de producto del formulario; la cantidad se captura como texto. */
export type OrderItemFormValue = {
  productId: string
  quantity: string
}

/** Valores del formulario de pedido. */
export type OrderFormValues = {
  recipientName: string
  recipientPhone: string
  zoneId: string
  deliveryAddress: string
  /** Fecha y hora en horario de Guayaquil, formato de `datetime-local` (aaaa-mm-ddThh:mm). */
  scheduledAt: string
  items: OrderItemFormValue[]
  /** Punto elegido en el mapa. */
  location: GeoPoint | null
  /** El operador confirmó el punto actual. Mover el marcador anula la confirmación. */
  locationConfirmed: boolean
}
