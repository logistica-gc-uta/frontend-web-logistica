import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '../../lib/http/apiClient'
import { orders } from '../../test/fixtures'
import { createHttpResponse } from '../../test/http'
import {
  adminReceipt,
  contactAudit,
  orderContact,
  purchaseResult,
} from '../../test/purchaseFixtures'
import { ordersService } from './ordersService'
import type { CreateAdminPurchaseInput, OrdersPage } from './types'

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

  it('createPurchase envía la venta a POST /orders/admin con su Idempotency-Key', async () => {
    const input: CreateAdminPurchaseInput = {
      buyer: { type: 'GUEST', name: 'María Pérez', contactPhone: '0991234567' },
      payment: { method: 'CASH' },
      deliveryAddress: 'Av. Los Chasquis',
      items: [{ productId: 'product-1', quantity: 1 }],
      scheduledDeliveryDate: '2030-02-14T10:00:00-05:00',
      deliveryLat: -1.25,
      deliveryLng: -78.63,
    }
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(createHttpResponse(purchaseResult()))

    await expect(ordersService.createPurchase(input, 'clave-1')).resolves.toEqual(purchaseResult())
    expect(post).toHaveBeenCalledWith('/orders/admin', input, {
      headers: { 'Idempotency-Key': 'clave-1' },
    })
  })

  it('consulta el intento, el comprobante, el contacto y su historial; corrige con PATCH', async () => {
    const get = vi
      .spyOn(apiClient, 'get')
      .mockResolvedValueOnce(
        createHttpResponse({ status: 'PROCESSING', orderId: null, errorCode: null }),
      )
      .mockResolvedValueOnce(createHttpResponse(adminReceipt()))
      .mockResolvedValueOnce(createHttpResponse(orderContact()))
      .mockResolvedValueOnce(createHttpResponse([contactAudit()]))
    const patch = vi
      .spyOn(apiClient, 'patch')
      .mockResolvedValue(createHttpResponse(orderContact({ contactRevision: 1 })))

    await ordersService.purchaseAttempt('clave 1')
    await ordersService.receipt('p1')
    await ordersService.contact('p1')
    await expect(ordersService.contactHistory('p1')).resolves.toEqual([contactAudit()])
    await ordersService.updateContact('p1', { contactRevision: 0, buyerPhone: '0990000000' })

    expect(get.mock.calls.map(([url]) => url)).toEqual([
      '/orders/admin/purchase-attempts/clave%201',
      '/orders/p1/receipt',
      '/orders/p1',
      '/orders/p1/contact-history',
    ])
    expect(patch).toHaveBeenCalledWith('/orders/p1/contact', {
      contactRevision: 0,
      buyerPhone: '0990000000',
    })
  })
})
