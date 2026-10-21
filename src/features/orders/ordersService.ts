import { apiClient } from '../../lib/http/apiClient'
import type { CreatedOrder, CreateAdminOrderInput, Order, OrdersPage, OrdersQuery } from './types'

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

  /** Registra un pedido a nombre de un destinatario invitado (solo ADMIN). */
  async createAsAdmin(input: CreateAdminOrderInput): Promise<CreatedOrder> {
    const { data } = await apiClient.post<CreatedOrder>(`${RESOURCE}/admin`, input)
    return data
  },
}
