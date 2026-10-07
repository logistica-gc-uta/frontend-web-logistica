import { apiClient } from '../../lib/http/apiClient'
import type { CreateProductInput, Product } from './types'

const RESOURCE = '/products'

export const productsService = {
  /** El backend solo devuelve los productos con stock disponible (stock > 0). */
  async list(): Promise<Product[]> {
    const { data } = await apiClient.get<Product[]>(RESOURCE)
    return data
  },

  async create(input: CreateProductInput): Promise<Product> {
    const { data } = await apiClient.post<Product>(RESOURCE, input)
    return data
  },
}
