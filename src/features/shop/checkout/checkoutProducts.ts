import { shopService } from '../shopService'
import type { ShopProduct } from '../types'

/** Public display metadata must never replace the server's quote or block checkout. */
export async function loadCheckoutProducts(
  itemIds: readonly string[],
): Promise<Map<string, ShopProduct | null>> {
  const entries = await Promise.all(
    Array.from(new Set(itemIds)).map(async (id) => {
      try {
        return [id, await shopService.product(id)] as const
      } catch {
        return [id, null] as const
      }
    }),
  )
  return new Map(entries)
}
