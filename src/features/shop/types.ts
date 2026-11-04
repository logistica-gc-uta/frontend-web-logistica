/** Categoría pública del Shop (`GET /shop/categories`), con el conteo real de regalos publicados. */
export interface ShopCategory {
  id: string
  name: string
  slug: string
  description: string | null
  productCount: number
  sortOrder: number
}

export interface ShopImage {
  id: string
  secureUrl: string
  altText: string | null
  position: number
  isPrimary: boolean
}

/** Regalo publicado (`GET /shop/products` y `/shop/products/:id`). Los precios van en centavos. */
export interface ShopProduct {
  id: string
  name: string
  description: string
  category: ShopCategory | null
  priceCents: number
  currency: 'USD'
  stock: number
  isFeatured: boolean
  isAvailable: boolean
  images: ShopImage[]
  primaryImageUrl: string | null
}

export type CatalogSort = 'featured' | 'recent' | 'price_asc' | 'price_desc'

/** Consulta del catálogo tal como la recibe la API (precios ya convertidos a centavos). */
export interface CatalogApiQuery {
  page: number
  pageSize: number
  search?: string
  categoryId?: string
  minPriceCents?: number
  maxPriceCents?: number
  inStock?: boolean
  sort: CatalogSort
}

export interface ProductPage {
  items: ShopProduct[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  sortApplied: string
}

/** Lo que el Shop usa de `GET /shop/settings`. */
export interface ShopSettings {
  maxUnitsPerSkuPerOrder: number
  shippingFreeIncluded: boolean
}
