import type { ShopProduct, ShopSettings } from '../types'
import type { CartItem } from './cartStorage'

export type LineProblem =
  /** El regalo ya no existe, se despublicó o su categoría se desactivó. */
  | { kind: 'UNAVAILABLE' }
  /** Sin stock por ahora. */
  | { kind: 'SOLD_OUT' }
  /** Pide más unidades de las que hay. */
  | { kind: 'NOT_ENOUGH_STOCK'; available: number }
  /** Supera el límite por SKU del pedido. */
  | { kind: 'OVER_LIMIT'; limit: number }

export interface CartLine {
  productId: string
  quantity: number
  /** `null` si el regalo ya no está disponible en la tienda. */
  product: ShopProduct | null
  /** Máximo que se puede elegir: min(stock, límite por SKU); 0 si no se puede comprar. */
  maximum: number
  problem: LineProblem | null
  lineTotalCents: number
}

/** Resumen informativo: el total definitivo lo calcula el backend al cotizar. */
export interface CartEstimate {
  units: number
  subtotalCents: number
  taxEnabled: boolean
  taxPercent: number
  taxCents: number
  shippingCents: 0
  totalCents: number
}

/** Misma regla que el backend: redondeo HALF_UP con enteros, floor((s × bps + 5000) / 10000). */
export const simulatedTaxCents = (subtotalCents: number, rateBps: number): number =>
  Math.floor((subtotalCents * rateBps + 5000) / 10000)

function problemOf(
  quantity: number,
  product: ShopProduct | null,
  limit: number,
): LineProblem | null {
  if (!product) return { kind: 'UNAVAILABLE' }
  if (!product.isAvailable || product.stock <= 0) return { kind: 'SOLD_OUT' }
  if (quantity > product.stock) return { kind: 'NOT_ENOUGH_STOCK', available: product.stock }
  if (quantity > limit) return { kind: 'OVER_LIMIT', limit }
  return null
}

/**
 * Cruza el carrito guardado (solo IDs y cantidades) con los datos vigentes de la API: precio,
 * stock, publicación y límite por SKU. Nada de lo guardado en el navegador se toma como definitivo.
 */
export function buildCartView(
  items: CartItem[],
  products: Map<string, ShopProduct | null>,
  settings: ShopSettings,
) {
  const limit = settings.maxUnitsPerSkuPerOrder
  const lines: CartLine[] = items.map(({ productId, quantity }) => {
    const product = products.get(productId) ?? null
    const problem = problemOf(quantity, product, limit)
    const canBuy = product !== null && product.isAvailable && product.stock > 0
    return {
      productId,
      quantity,
      product,
      maximum: canBuy ? Math.min(product.stock, limit) : 0,
      problem,
      lineTotalCents: product ? product.priceCents * quantity : 0,
    }
  })

  // Solo las líneas válidas cuentan para el resumen; las inválidas bloquean el checkout.
  const valid = lines.filter((line) => line.problem === null)
  const subtotalCents = valid.reduce((total, line) => total + line.lineTotalCents, 0)
  const taxCents = settings.tax.enabled ? simulatedTaxCents(subtotalCents, settings.tax.rateBps) : 0
  const estimate: CartEstimate = {
    units: valid.reduce((total, line) => total + line.quantity, 0),
    subtotalCents,
    taxEnabled: settings.tax.enabled,
    taxPercent: settings.tax.ratePercent,
    taxCents,
    shippingCents: 0,
    totalCents: subtotalCents + taxCents,
  }

  return {
    lines,
    estimate,
    hasProblems: lines.some((line) => line.problem !== null),
    canCheckout: lines.length > 0 && lines.every((line) => line.problem === null),
  }
}

export const describeProblem = (problem: LineProblem): string => {
  switch (problem.kind) {
    case 'UNAVAILABLE':
      return 'Este regalo ya no está disponible en la tienda.'
    case 'SOLD_OUT':
      return 'Agotado por ahora.'
    case 'NOT_ENOUGH_STOCK':
      return `Solo ${problem.available === 1 ? 'queda 1 unidad' : `quedan ${problem.available} unidades`}: ajusta la cantidad.`
    case 'OVER_LIMIT':
      return `Máximo ${problem.limit} unidades de este regalo por pedido: ajusta la cantidad.`
  }
}
