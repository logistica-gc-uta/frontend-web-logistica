import { beforeEach, describe, expect, it, vi } from 'vitest'
import { customerOrdersService } from './customerOrdersService'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../account/customerApiClient', () => ({ customerApiClient: { get } }))

describe('customer order list parameters', () => {
  beforeEach(() => {
    get.mockReset()
    get.mockResolvedValue({ data: { items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 } })
  })

  it('keeps the existing unfiltered request unchanged', async () => {
    await customerOrdersService.list(1)
    expect(get).toHaveBeenCalledWith('/shop/orders', { params: { page: 1, pageSize: 10 } })
  })

  it('passes a selected status to the server before pagination', async () => {
    await customerOrdersService.list(2, 10, 'DELIVERED')
    expect(get).toHaveBeenCalledWith('/shop/orders', {
      params: { page: 2, pageSize: 10, status: 'DELIVERED' },
    })
  })
})
