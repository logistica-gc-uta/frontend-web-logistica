import axios from 'axios'
import { AppError } from '../../lib/errors/AppError'
import { apiClient } from '../../lib/http/apiClient'
import type {
  CatalogApiQuery,
  ProductPage,
  ShopCategory,
  ShopImage,
  ShopProduct,
  ShopSettings,
} from './types'

/** Respuesta de error de los módulos del Shop: `{ error: { code, message } }`. */
interface ShopErrorBody {
  error?: { code?: string }
}

const SHOP_ERROR_MESSAGES: Record<string, string> = {
  PRODUCT_NOT_FOUND: 'Este regalo no existe o ya no está disponible.',
  CATEGORY_NOT_FOUND: 'Esta categoría no existe o ya no está disponible.',
}

/** Código de error del Shop, si la respuesta lo trae. */
export const shopErrorCode = (error: unknown): string | undefined =>
  axios.isAxiosError<ShopErrorBody>(error) ? error.response?.data?.error?.code : undefined

/** Traduce los errores conocidos del Shop; los demás siguen su curso (red, servidor…). */
function translate(error: unknown): never {
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
  shipping: { status: string }
  limits: { maxUnitsPerSkuPerOrder: number }
}

export const shopService = {
  async categories(): Promise<ShopCategory[]> {
    const { data } = await apiClient.get<{ items: ShopCategory[] }>('/shop/categories')
    return data.items
  },

  async products(query: CatalogApiQuery): Promise<ProductPage> {
    const { data } = await apiClient
      .get<ProductPage & { items: RawProduct[] }>('/shop/products', { params: toParams(query) })
      .catch(translate)
    return { ...data, items: data.items.map(toProduct) }
  },

  async product(id: string): Promise<ShopProduct> {
    const { data } = await apiClient
      .get<RawProduct>(`/shop/products/${encodeURIComponent(id)}`)
      .catch((error: unknown) => {
        // Un ID mal formado (400) es, para el visitante, un regalo que no existe.
        if (axios.isAxiosError(error) && error.response?.status === 400) {
          throw new AppError(SHOP_ERROR_MESSAGES.PRODUCT_NOT_FOUND)
        }
        return translate(error)
      })
    return toProduct(data)
  },

  /** Límite vigente por SKU y envío: el ADMIN puede cambiarlos, así que no se fijan en el código. */
  async settings(): Promise<ShopSettings> {
    const { data } = await apiClient.get<RawSettings>('/shop/settings')
    return {
      maxUnitsPerSkuPerOrder: data.limits.maxUnitsPerSkuPerOrder,
      shippingFreeIncluded: data.shipping.status === 'FREE_INCLUDED',
    }
  },
}
