import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '../../lib/http/apiClient'
import { auditRecord } from '../../test/dispatchFixtures'
import { orders } from '../../test/fixtures'
import { createHttpError, createHttpResponse } from '../../test/http'
import { ordersService } from '../orders/ordersService'
import { loadTodayAuditLog } from './auditLog'
import { dispatchService } from './dispatchService'

const NOW = new Date('2026-10-21T17:00:00Z')

describe('loadTodayAuditLog', () => {
  it('trae solo las decisiones de hoy y la dirección de cada pedido, una consulta por pedido', async () => {
    vi.spyOn(dispatchService, 'audit').mockResolvedValue([
      auditRecord({ id: 'a', orderId: orders[0].id, recordedAt: '2026-10-21T15:00:00Z' }),
      auditRecord({ id: 'b', orderId: orders[0].id, recordedAt: '2026-10-21T16:00:00Z' }),
      auditRecord({ id: 'c', orderId: null, recordedAt: '2026-10-21T16:30:00Z' }),
      auditRecord({ id: 'ayer', orderId: 'otro', recordedAt: '2026-10-20T15:00:00Z' }),
    ])
    const get = vi.spyOn(ordersService, 'get').mockResolvedValue(orders[0])

    const log = await loadTodayAuditLog(NOW)

    expect(log.records.map((record) => record.id)).toEqual(['a', 'b', 'c'])
    expect(log.addresses).toEqual({ [orders[0].id]: orders[0].deliveryAddress })
    expect(get).toHaveBeenCalledOnce()
  })

  it('si no se puede consultar un pedido, igual muestra la decisión (sin dirección)', async () => {
    vi.spyOn(dispatchService, 'audit').mockResolvedValue([
      auditRecord({ orderId: 'borrado', recordedAt: '2026-10-21T15:00:00Z' }),
    ])
    vi.spyOn(ordersService, 'get').mockRejectedValue(createHttpError(404))

    const log = await loadTodayAuditLog(NOW)

    expect(log.records).toHaveLength(1)
    expect(log.addresses).toEqual({})
  })
})

describe('ordersService.get', () => {
  it('consulta el detalle del pedido por su id', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(createHttpResponse(orders[0]))

    expect(await ordersService.get('order-1')).toBe(orders[0])
    expect(get).toHaveBeenCalledWith('/orders/order-1')
  })
})
