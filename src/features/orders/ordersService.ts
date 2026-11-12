import { apiClient } from '../../lib/http/apiClient'
import type {
  AdminPurchaseAttempt,
  AdminPurchaseResult,
  AdminReceipt,
  ContactAuditEntry,
  CreateAdminPurchaseInput,
  Order,
  OrderContact,
  OrderContactChange,
  OrdersPage,
  OrdersQuery,
} from './types'

const RESOURCE = '/orders'

/** Máximo de pedidos por página que acepta el backend. */
const MAX_PAGE_SIZE = 100

export const ordersService = {
  /** Lista paginada y filtrable de todos los pedidos (solo ADMIN). */
  async list(query: OrdersQuery): Promise<OrdersPage> {
    const { data } = await apiClient.get<OrdersPage>(RESOURCE, { params: query })
    return data
  },

  /** Detalle de un pedido (ADMIN puede consultar cualquiera). */
  async get(id: string): Promise<Order> {
    const { data } = await apiClient.get<Order>(`${RESOURCE}/${id}`)
    return data
  },

  /** Todos los pedidos que cumplen los filtros, recorriendo las páginas necesarias. */
  async listAll(filters: Omit<OrdersQuery, 'page' | 'pageSize'>): Promise<Order[]> {
    const first = await ordersService.list({ ...filters, page: 1, pageSize: MAX_PAGE_SIZE })
    const pages = Math.ceil(first.total / MAX_PAGE_SIZE)
    const rest = await Promise.all(
      Array.from({ length: Math.max(pages - 1, 0) }, (_, index) =>
        ordersService.list({ ...filters, page: index + 2, pageSize: MAX_PAGE_SIZE }),
      ),
    )
    return [first, ...rest].flatMap((page) => page.items)
  },

  /**
   * Registra una venta con pago externo declarado (solo ADMIN, backend #45). La misma clave con el
   * mismo cuerpo devuelve el resultado original: reenviar no cobra ni descuenta stock dos veces.
   */
  async createPurchase(
    input: CreateAdminPurchaseInput,
    idempotencyKey: string,
  ): Promise<AdminPurchaseResult> {
    const { data } = await apiClient.post<AdminPurchaseResult>(`${RESOURCE}/admin`, input, {
      headers: { 'Idempotency-Key': idempotencyKey },
    })
    return data
  },

  /** Estado de una venta cuyo resultado no se conoce (red caída, tiempo agotado). */
  async purchaseAttempt(idempotencyKey: string): Promise<AdminPurchaseAttempt> {
    const { data } = await apiClient.get<AdminPurchaseAttempt>(
      `${RESOURCE}/admin/purchase-attempts/${encodeURIComponent(idempotencyKey)}`,
    )
    return data
  },

  /** Comprobante imprimible de un pedido (ADMIN: de cliente con cuenta o invitado). */
  async receipt(orderId: string): Promise<AdminReceipt> {
    const { data } = await apiClient.get<AdminReceipt>(
      `${RESOURCE}/${encodeURIComponent(orderId)}/receipt`,
    )
    return data
  },

  /** Contacto actual del pedido con su versión (el detalle ADMIN lo incluye). */
  async contact(orderId: string): Promise<OrderContact> {
    const { data } = await apiClient.get<OrderContact>(`${RESOURCE}/${encodeURIComponent(orderId)}`)
    return data
  },

  /** Corrige el contacto; con una versión vieja el backend responde 409 sin cambiar nada. */
  async updateContact(orderId: string, change: OrderContactChange): Promise<OrderContact> {
    const { data } = await apiClient.patch<OrderContact>(
      `${RESOURCE}/${encodeURIComponent(orderId)}/contact`,
      change,
    )
    return data
  },

  /** Correcciones de contacto registradas, de la más antigua a la más reciente. */
  async contactHistory(orderId: string): Promise<ContactAuditEntry[]> {
    const { data } = await apiClient.get<ContactAuditEntry[]>(
      `${RESOURCE}/${encodeURIComponent(orderId)}/contact-history`,
    )
    return data
  },
}
