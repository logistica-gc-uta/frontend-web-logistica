/** Categoría del Shop vista por el ADMIN (activas e inactivas). */
export interface AdminCategory {
  id: string
  name: string
  slug: string
  description: string | null
  isActive: boolean
  sortOrder: number
}

export interface AdminImage {
  id: string
  secureUrl: string
  altText: string | null
  /** Posición en la galería (0 a 5). */
  position: number
  isPrimary: boolean
}

/** Producto del catálogo para el ADMIN: incluye agotados, despublicados y productos antiguos. */
export interface AdminProduct {
  id: string
  sku: string
  name: string
  description: string | null
  categoryId: string | null
  category: { id: string; name: string; isActive?: boolean } | null
  /** `null` en productos antiguos creados antes del catálogo del Shop. */
  priceCents: number | null
  stock: number
  isPublished: boolean
  isFeatured: boolean
  images: AdminImage[]
  primaryImageUrl: string | null
  updatedAt: string
}

export type ProductStatusFilter = 'all' | 'published' | 'unpublished' | 'out_of_stock'

export interface AdminProductQuery {
  page: number
  pageSize: number
  search?: string
  categoryId?: string
  status?: ProductStatusFilter
}

export interface AdminProductPage {
  items: AdminProduct[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ProductInput {
  sku: string
  name: string
  description: string
  categoryId: string
  priceCents: number
  stock: number
  isFeatured: boolean
}

/** Lo que se puede cambiar al editar: el SKU no (identifica el producto en pedidos históricos). */
export type ProductChanges = Partial<Omit<ProductInput, 'sku'>>

export interface CategoryInput {
  name: string
  slug: string
  description: string | null
  isActive: boolean
}

/** Configuración comercial del Shop (`GET /admin/shop-settings`). */
export interface AdminShopSettings {
  version: number
  tax: { enabled: boolean; rateBps: number }
  maxUnitsPerSkuPerOrder: number
  deliverySchedule: { timeZone: string; startTime: string; endTime: string }
  shippingFreeIncluded: boolean
  updatedAt: string
  updatedById: string | null
}

export interface ShopSettingsChanges {
  tax?: { enabled: boolean; rateBps: number }
  limits?: { maxUnitsPerSkuPerOrder: number }
  deliverySchedule?: { startTime: string; endTime: string }
}
