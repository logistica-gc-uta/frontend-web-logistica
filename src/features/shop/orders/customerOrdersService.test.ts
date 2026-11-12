import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHttpError } from '../../../test/http'
import {
  amountsOf,
  customerOrdersService,
  ORDER_NOT_FOUND_MESSAGE,
  ReceiptUnavailableError,
} from './customerOrdersService'

const amounts = {
  subtotalCents: 7300,
  taxAmountCents: 1095,
  taxRateBps: 1500,
  taxEnabled: true,
  shippingAmountCents: 0,
  totalCents: 8395,
}

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

  it('distinguishes an own order without receipt from a foreign or missing order', async () => {
    const notFound = (code: string) =>
      createHttpError(404, { data: { error: { code, message: 'x', details: {} } } })

    get.mockRejectedValueOnce(notFound('RECEIPT_UNAVAILABLE'))
    await expect(customerOrdersService.receipt('mine')).rejects.toBeInstanceOf(
      ReceiptUnavailableError,
    )

    get.mockRejectedValueOnce(notFound('ORDER_NOT_FOUND'))
    await expect(customerOrdersService.receipt('ajeno')).rejects.toThrow(ORDER_NOT_FOUND_MESSAGE)
  })

  it('reads the order source and keeps missing receipt amounts as null', () => {
    expect(amountsOf({ ...amounts, totalCents: null })).toBeNull()
    expect(amountsOf(amounts)).toEqual(amounts)
  })

  it('passes a selected status to the server before pagination', async () => {
    await customerOrdersService.list(2, 10, 'DELIVERED')
    expect(get).toHaveBeenCalledWith('/shop/orders', {
      params: { page: 2, pageSize: 10, status: 'DELIVERED' },
    })
  })
})
