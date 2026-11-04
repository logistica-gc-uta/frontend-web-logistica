import type { AdminCategory, AdminProduct, AdminShopSettings } from '../features/catalog/types'

export const adminCategory = (overrides: Partial<AdminCategory> = {}): AdminCategory => ({
  id: 'cat-flores',
  name: 'Flores',
  slug: 'flores',
  description: null,
  isActive: true,
  sortOrder: 0,
  ...overrides,
})

export const adminProduct = (overrides: Partial<AdminProduct> = {}): AdminProduct => ({
  id: 'prod-1',
  sku: 'ROSAS-12',
  name: 'Ramo de rosas',
  description: 'Doce rosas rojas.',
  categoryId: 'cat-flores',
  category: { id: 'cat-flores', name: 'Flores' },
  priceCents: 2599,
  stock: 10,
  isPublished: false,
  isFeatured: false,
  images: [],
  primaryImageUrl: null,
  updatedAt: '2026-11-03T10:00:00Z',
  ...overrides,
})

export const adminImage = (id: string, position: number, isPrimary = false) => ({
  id,
  secureUrl: `https://res.cloudinary.com/demo/${id}.png`,
  altText: `Foto ${id}`,
  position,
  isPrimary,
})

export const adminSettings = (overrides: Partial<AdminShopSettings> = {}): AdminShopSettings => ({
  version: 5,
  tax: { enabled: true, rateBps: 1500 },
  maxUnitsPerSkuPerOrder: 10,
  deliverySchedule: { timeZone: 'America/Guayaquil', startTime: '07:00', endTime: '17:00' },
  shippingFreeIncluded: true,
  updatedAt: '2026-11-03T10:00:00Z',
  updatedById: null,
  ...overrides,
})
