import { apiClient } from '../../lib/http/apiClient'
import type { CreatedOrder, CreateAdminOrderInput, OrdersPage, OrdersQuery } from './types'

const RESOURCE = '/orders'

export const ordersService = {
  /** Lista paginada y filtrable de todos los pedidos (solo ADMIN). */
  async list(query: OrdersQuery): Promise<OrdersPage> {
    const { data } = await apiClient.get<OrdersPage>(RESOURCE, { params: query })
    return data
  },

  /** Registra un pedido a nombre de un destinatario invitado (solo ADMIN). */
  async createAsAdmin(input: CreateAdminOrderInput): Promise<CreatedOrder> {
    const { data } = await apiClient.post<CreatedOrder>(`${RESOURCE}/admin`, input)
    return data
  },
}
