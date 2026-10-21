import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '../../lib/http/apiClient'
import { createdGuestOrder, orders } from '../../test/fixtures'
import { createHttpResponse } from '../../test/http'
import { ordersService } from './ordersService'
import type { CreateAdminOrderInput, OrdersPage } from './types'

describe('ordersService', () => {
  it('list consulta GET /orders con paginación y filtros', async () => {
    const page: OrdersPage = { items: orders, total: 2, page: 2, pageSize: 10 }
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(createHttpResponse(page))
    const query = {
      page: 2,
      pageSize: 10,
      date: '2030-02-14',
      zoneId: 'zone-1',
      status: 'PENDING' as const,
    }

    await expect(ordersService.list(query)).resolves.toEqual(page)
    expect(get).toHaveBeenCalledWith('/orders', { params: query })
  })

  it('createAsAdmin envía el pedido a POST /orders/admin', async () => {
    const input: CreateAdminOrderInput = {
      recipient: { type: 'GUEST', name: 'María Pérez', contactPhone: '0991234567' },
      zoneId: 'zone-1',
      deliveryAddress: 'Av. Los Chasquis',
      items: [{ productId: 'product-1', quantity: 1 }],
      scheduledDeliveryDate: '2030-02-14T10:00:00-05:00',
      deliveryLat: -1.25,
      deliveryLng: -78.63,
    }
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue(createHttpResponse(createdGuestOrder))

    await expect(ordersService.createAsAdmin(input)).resolves.toEqual(createdGuestOrder)
    expect(post).toHaveBeenCalledWith('/orders/admin', input)
  })
})
