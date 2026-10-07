import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '../../lib/http/apiClient'
import { products } from '../../test/fixtures'
import { createHttpResponse } from '../../test/http'
import { productsService } from './productsService'

describe('productsService', () => {
  it('list consulta GET /products', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(createHttpResponse(products))

    await expect(productsService.list()).resolves.toEqual(products)
    expect(get).toHaveBeenCalledWith('/products')
  })

  it('create envía los datos a POST /products', async () => {
    const input = { name: 'Mouse Inalámbrico Logitech', price: 25.5, stock: 50 }
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(createHttpResponse(products[1]))

    await expect(productsService.create(input)).resolves.toEqual(products[1])
    expect(post).toHaveBeenCalledWith('/products', input)
  })
})
