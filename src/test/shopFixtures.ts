import type { ProductPage, ShopCategory, ShopProduct, ShopSettings } from '../features/shop/types'

export const shopCategory = (overrides: Partial<ShopCategory> = {}): ShopCategory => ({
  id: 'cat-flores',
  name: 'Flores',
  slug: 'flores',
  description: null,
  productCount: 3,
  sortOrder: 0,
  ...overrides,
})

export const shopProduct = (overrides: Partial<ShopProduct> = {}): ShopProduct => ({
  id: 'p-rosas',
  name: 'Ramo de rosas',
  description: 'Doce rosas rojas.',
  category: shopCategory(),
  priceCents: 2599,
  currency: 'USD',
  stock: 20,
  isFeatured: false,
  isAvailable: true,
  images: [
    {
      id: 'img-1',
      secureUrl: 'https://res.cloudinary.com/demo/rosas.jpg',
      altText: 'Ramo de rosas rojas',
      position: 0,
      isPrimary: true,
    },
  ],
  primaryImageUrl: 'https://res.cloudinary.com/demo/rosas.jpg',
  ...overrides,
})

export const productPage = (
  items: ShopProduct[],
  overrides: Partial<ProductPage> = {},
): ProductPage => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 12,
  totalPages: Math.max(1, Math.ceil(items.length / 12)),
  sortApplied: 'featured',
  ...overrides,
})

export const shopSettings = (overrides: Partial<ShopSettings> = {}): ShopSettings => ({
  version: 1,
  maxUnitsPerSkuPerOrder: 10,
  shippingFreeIncluded: true,
  tax: { enabled: true, rateBps: 1500, ratePercent: 15 },
  deliverySchedule: { timeZone: 'America/Guayaquil', startTime: '07:00', endTime: '17:00' },
  ...overrides,
})
