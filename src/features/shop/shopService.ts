import axios from 'axios'
import { AppError } from '../../lib/errors/AppError'
import { shopPublicClient } from '../../lib/http/shopPublicClient'
import type { Zone } from '../zones/types'
import { shopErrorCode } from './shopError'
import type {
  CatalogApiQuery,
  ProductPage,
  ShopCategory,
  ShopImage,
  ShopProduct,
  ShopSettings,
} from './types'

/** El regalo no existe, se despublicó o su categoría está inactiva. */
export class ProductNotFoundError extends AppError {
  constructor() {
    super('Este regalo no existe o ya no está disponible.')
  }
}

const SHOP_ERROR_MESSAGES: Record<string, string> = {
  PRODUCT_NOT_FOUND: 'Este regalo no existe o ya no está disponible.',
  CATEGORY_NOT_FOUND: 'Esta categoría no existe o ya no está disponible.',
}

/** Traduce los errores conocidos del Shop; los demás siguen su curso (red, servidor…). */
function translate(error: unknown): never {
  if (shopErrorCode(error) === 'PRODUCT_NOT_FOUND') throw new ProductNotFoundError()
  const message = SHOP_ERROR_MESSAGES[shopErrorCode(error) ?? '']
  throw message ? new AppError(message) : error
}

interface RawProduct {
  id: string
  name: string
  description: string | null
  category: ShopCategory | null
  priceCents: number | null
  stock: number
  isFeatured: boolean
  isAvailable: boolean
  images: (ShopImage & { publicId?: string })[]
  primaryImageUrl: string | null
}

/** Copia solo lo que muestra el Shop. */
const toProduct = (raw: RawProduct): ShopProduct => ({
  id: raw.id,
  name: raw.name,
  description: raw.description ?? '',
  category: raw.category,
  priceCents: raw.priceCents ?? 0,
  currency: 'USD',
  stock: raw.stock,
  isFeatured: raw.isFeatured,
  isAvailable: raw.isAvailable,
  images: raw.images.map(({ id, secureUrl, altText, position, isPrimary }) => ({
    id,
    secureUrl,
    altText,
    position,
    isPrimary,
  })),
  primaryImageUrl: raw.primaryImageUrl,
})

/** Parámetros de `GET /shop/products`: solo se envían los filtros activos. */
const toParams = ({ inStock, ...query }: CatalogApiQuery) => ({
  ...Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined)),
  ...(inStock ? { inStock: 'true' } : {}),
})

interface RawSettings {
  version: number
  shipping: { status: string }
  tax: { enabled: boolean; rateBps: number; ratePercent: number }
  limits: { maxUnitsPerSkuPerOrder: number }
  deliverySchedule: { timeZone: string; startTime: string; endTime: string }
}

export const shopService = {
  async categories(): Promise<ShopCategory[]> {
    const { data } = await shopPublicClient.get<{ items: ShopCategory[] }>('/shop/categories')
    return data.items
  },

  async products(query: CatalogApiQuery): Promise<ProductPage> {
    const { data } = await shopPublicClient
      .get<ProductPage & { items: RawProduct[] }>('/shop/products', { params: toParams(query) })
      .catch(translate)
    return { ...data, items: data.items.map(toProduct) }
  },

  async product(id: string): Promise<ShopProduct> {
    const { data } = await shopPublicClient
      .get<RawProduct>(`/shop/products/${encodeURIComponent(id)}`)
      .catch((error: unknown) => {
        // Un ID mal formado (400) es, para el visitante, un regalo que no existe.
        if (axios.isAxiosError(error) && error.response?.status === 400) {
          throw new ProductNotFoundError()
        }
        return translate(error)
      })
    return toProduct(data)
  },

  /**
   * Límite por SKU, IVA simulado y horario de reparto vigentes: el ADMIN puede cambiarlos, así
   * que no se fijan en el código.
   */
  async settings(): Promise<ShopSettings> {
    const { data } = await shopPublicClient.get<RawSettings>('/shop/settings')
    return {
      version: data.version,
      maxUnitsPerSkuPerOrder: data.limits.maxUnitsPerSkuPerOrder,
      shippingFreeIncluded: data.shipping.status === 'FREE_INCLUDED',
      tax: {
        enabled: data.tax.enabled,
        rateBps: data.tax.rateBps,
        ratePercent: data.tax.ratePercent,
      },
      deliverySchedule: {
        timeZone: data.deliverySchedule.timeZone,
        startTime: data.deliverySchedule.startTime,
        endTime: data.deliverySchedule.endTime,
      },
    }
  },

  async zones(): Promise<Zone[]> {
    const { data } = await shopPublicClient.get<Zone[]>('/zones')
    return data
  },
}
