import { apiClient } from '../../lib/http/apiClient'
import type {
  AdminCategory,
  AdminImage,
  AdminProduct,
  AdminProductPage,
  AdminProductQuery,
  AdminShopSettings,
  CategoryInput,
  ProductChanges,
  ProductInput,
  ShopSettingsChanges,
} from './types'

const BASE = '/admin/catalog'

/** Subir una imagen puede tardar (el backend la reenvía a Cloudinary). */
const UPLOAD_TIMEOUT_MS = 60_000

interface RawProduct extends Omit<AdminProduct, 'images'> {
  images: (AdminImage & { publicId?: string })[]
}

/** Copia solo lo que usa el panel (sin el `publicId` interno de Cloudinary). */
const toImage = ({ id, secureUrl, altText, position, isPrimary }: AdminImage): AdminImage => ({
  id,
  secureUrl,
  altText,
  position,
  isPrimary,
})

const toProduct = (raw: RawProduct): AdminProduct => ({
  id: raw.id,
  sku: raw.sku,
  name: raw.name,
  description: raw.description,
  categoryId: raw.categoryId,
  category: raw.category,
  priceCents: raw.priceCents,
  stock: raw.stock,
  isPublished: raw.isPublished,
  isFeatured: raw.isFeatured,
  images: [...raw.images].sort((a, b) => a.position - b.position).map(toImage),
  primaryImageUrl: raw.primaryImageUrl,
  updatedAt: raw.updatedAt,
})

interface RawSettings {
  version: number
  shipping: { status: string }
  tax: { enabled: boolean; rateBps: number }
  limits: { maxUnitsPerSkuPerOrder: number }
  deliverySchedule: { timeZone: string; startTime: string; endTime: string }
  /** Backend #48; un backend anterior no lo envía y se usa su valor por defecto. */
  routePlanning?: { timeWindowMarginMinutes: number }
  updatedAt: string
  updatedById: string | null
}

/** Margen de agrupación horaria por defecto del backend (#48). */
const DEFAULT_MARGIN_MINUTES = 30

const toSettings = (raw: RawSettings): AdminShopSettings => ({
  version: raw.version,
  tax: { enabled: raw.tax.enabled, rateBps: raw.tax.rateBps },
  maxUnitsPerSkuPerOrder: raw.limits.maxUnitsPerSkuPerOrder,
  deliverySchedule: {
    timeZone: raw.deliverySchedule.timeZone,
    startTime: raw.deliverySchedule.startTime,
    endTime: raw.deliverySchedule.endTime,
  },
  shippingFreeIncluded: raw.shipping.status === 'FREE_INCLUDED',
  routeTimeWindowMarginMinutes:
    raw.routePlanning?.timeWindowMarginMinutes ?? DEFAULT_MARGIN_MINUTES,
  updatedAt: raw.updatedAt,
  updatedById: raw.updatedById,
})

/**
 * Administración del catálogo y de la configuración del Shop (solo ADMIN). Usa el cliente del
 * panel, que envía el token ADMIN; el backend vuelve a comprobar el rol en cada petición.
 */
export const catalogService = {
  async listProducts({
    search,
    categoryId,
    status,
    ...query
  }: AdminProductQuery): Promise<AdminProductPage> {
    const { data } = await apiClient.get<AdminProductPage & { items: RawProduct[] }>(
      `${BASE}/products`,
      {
        params: {
          ...query,
          ...(search && { search }),
          ...(categoryId && { categoryId }),
          ...(status && status !== 'all' && { status }),
        },
      },
    )
    return { ...data, items: data.items.map(toProduct) }
  },

  async getProduct(id: string): Promise<AdminProduct> {
    const { data } = await apiClient.get<RawProduct>(`${BASE}/products/${encodeURIComponent(id)}`)
    return toProduct(data)
  },

  /** Los productos nuevos se crean despublicados: se publican aparte, cuando cumplen los requisitos. */
  async createProduct(input: ProductInput): Promise<AdminProduct> {
    const { data } = await apiClient.post<RawProduct>(`${BASE}/products`, {
      ...input,
      isPublished: false,
    })
    return toProduct(data)
  },

  async updateProduct(id: string, changes: ProductChanges): Promise<AdminProduct> {
    const { data } = await apiClient.patch<RawProduct>(
      `${BASE}/products/${encodeURIComponent(id)}`,
      changes,
    )
    return toProduct(data)
  },

  async setPublication(id: string, isPublished: boolean): Promise<AdminProduct> {
    const { data } = await apiClient.patch<RawProduct>(
      `${BASE}/products/${encodeURIComponent(id)}/publication`,
      { isPublished },
    )
    return toProduct(data)
  },

  async listCategories(): Promise<AdminCategory[]> {
    const { data } = await apiClient.get<{ items: AdminCategory[] }>(`${BASE}/categories`)
    return data.items.map(({ id, name, slug, description, isActive, sortOrder }) => ({
      id,
      name,
      slug,
      description,
      isActive,
      sortOrder,
    }))
  },

  /** Productos de una categoría (cualquier estado), para mostrar el conteo y advertir al desactivarla. */
  async countProducts(categoryId: string): Promise<number> {
    const { data } = await apiClient.get<{ total: number }>(`${BASE}/products`, {
      params: { categoryId, page: 1, pageSize: 1 },
    })
    return data.total
  },

  async createCategory(input: CategoryInput): Promise<AdminCategory> {
    const { data } = await apiClient.post<AdminCategory>(`${BASE}/categories`, input)
    return data
  },

  /** El slug no se cambia al editar: identifica la categoría en los enlaces del Shop. */
  async updateCategory(
    id: string,
    changes: Partial<Omit<CategoryInput, 'slug'>>,
  ): Promise<AdminCategory> {
    const { data } = await apiClient.patch<AdminCategory>(
      `${BASE}/categories/${encodeURIComponent(id)}`,
      changes,
    )
    return data
  },

  /**
   * Sube el archivo al backend (`multipart/form-data`), que lo verifica y lo envía a Cloudinary.
   * El navegador nunca recibe credenciales ni firmas: solo el `uploadId` para asociarlo.
   */
  async uploadImage(file: File, onProgress?: (percent: number) => void): Promise<string> {
    const body = new FormData()
    body.append('file', file)
    const { data } = await apiClient.post<{ uploadId: string }>(`${BASE}/uploads`, body, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: UPLOAD_TIMEOUT_MS,
      onUploadProgress: (event) => {
        if (onProgress && event.total) onProgress(Math.round((event.loaded / event.total) * 100))
      },
    })
    return data.uploadId
  },

  async attachImage(
    productId: string,
    image: { uploadId: string; altText: string; isPrimary: boolean; position: number },
  ): Promise<AdminImage> {
    const { data } = await apiClient.post<AdminImage>(
      `${BASE}/products/${encodeURIComponent(productId)}/images`,
      image,
    )
    return toImage(data)
  },

  async updateImage(
    productId: string,
    imageId: string,
    changes: { altText?: string; isPrimary?: boolean; position?: number },
  ): Promise<AdminImage> {
    const { data } = await apiClient.patch<AdminImage>(
      `${BASE}/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`,
      changes,
    )
    return toImage(data)
  },

  async removeImage(productId: string, imageId: string): Promise<void> {
    await apiClient.delete(
      `${BASE}/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`,
    )
  },

  async getSettings(): Promise<AdminShopSettings> {
    const { data } = await apiClient.get<RawSettings>('/admin/shop-settings')
    return toSettings(data)
  },

  /** Guarda con la versión leída: si otro ADMIN guardó antes, el backend responde 409. */
  async saveSettings(
    expectedVersion: number,
    changes: ShopSettingsChanges,
  ): Promise<AdminShopSettings> {
    const { data } = await apiClient.patch<RawSettings>('/admin/shop-settings', {
      expectedVersion,
      ...changes,
    })
    return toSettings(data)
  },
}
