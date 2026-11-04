import { apiClient } from '../../lib/http/apiClient'
import { concatBytes, solidPng } from './png'
import { uniqueSuffix } from './session'

/**
 * Catálogo de prueba creado con la API de ADMIN (la misma que usará #21): categoría, regalos e
 * imagen principal subida por el backend a Cloudinary. Requiere una sesión ADMIN activa.
 */
export async function createShopCategory(name: string): Promise<{ id: string; name: string }> {
  const suffix = uniqueSuffix().toLowerCase()
  const { data } = await apiClient.post<{ id: string; name: string }>('/admin/catalog/categories', {
    name: `${name} ${suffix}`,
    slug: `it-${suffix}`,
    isActive: true,
  })
  return data
}

/** Sube una imagen PNG por el backend (multipart armado a mano: no depende del FormData de jsdom). */
async function uploadImage(color: [number, number, number]): Promise<string> {
  const boundary = `----it${uniqueSuffix()}`
  const text = (value: string) => new TextEncoder().encode(value)
  const body = concatBytes([
    text(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="regalo.png"\r\n` +
        'Content-Type: image/png\r\n\r\n',
    ),
    solidPng(color),
    text(`\r\n--${boundary}--\r\n`),
  ])
  const { data } = await apiClient.post<{ uploadId: string }>('/admin/catalog/uploads', body, {
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
  })
  return data.uploadId
}

export interface NewShopProduct {
  categoryId: string
  name: string
  description: string
  priceCents: number
  stock: number
  isFeatured?: boolean
  /** Por defecto se publica; `false` deja el regalo creado pero fuera de la tienda. */
  publish?: boolean
  color?: [number, number, number]
}

export async function createShopProduct({
  publish = true,
  color = [236, 72, 153],
  ...product
}: NewShopProduct): Promise<{ id: string; name: string }> {
  const { data } = await apiClient.post<{ id: string; name: string }>('/admin/catalog/products', {
    sku: `IT-${uniqueSuffix()}`,
    isPublished: false,
    isFeatured: false,
    ...product,
  })
  const uploadId = await uploadImage(color)
  await apiClient.post(`/admin/catalog/products/${data.id}/images`, {
    uploadId,
    altText: `Foto de ${product.name}`,
    isPrimary: true,
    position: 0,
  })
  if (publish) {
    await apiClient.patch(`/admin/catalog/products/${data.id}/publication`, { isPublished: true })
  }
  return data
}

interface AdminSettings {
  version: number
  tax: { enabled: boolean; rateBps: number }
  limits: { maxUnitsPerSkuPerOrder: number }
}

/** Cambia el límite por SKU como ADMIN (con la versión vigente) y devuelve el valor anterior. */
export async function setMaxUnitsPerSku(maxUnitsPerSkuPerOrder: number): Promise<number> {
  const { data } = await apiClient.get<AdminSettings>('/admin/shop-settings')
  await apiClient.patch('/admin/shop-settings', {
    expectedVersion: data.version,
    limits: { maxUnitsPerSkuPerOrder },
  })
  return data.limits.maxUnitsPerSkuPerOrder
}

/** Cambia el IVA simulado como ADMIN y devuelve el valor anterior (para restaurarlo). */
export async function setSimulatedTax(tax: {
  enabled: boolean
  rateBps: number
}): Promise<{ enabled: boolean; rateBps: number }> {
  const { data } = await apiClient.get<AdminSettings>('/admin/shop-settings')
  const previous = { enabled: data.tax.enabled, rateBps: data.tax.rateBps }
  // El backend rechaza un cambio que no cambia nada.
  if (previous.enabled !== tax.enabled || previous.rateBps !== tax.rateBps) {
    await apiClient.patch('/admin/shop-settings', { expectedVersion: data.version, tax })
  }
  return previous
}

/** Cambia el precio de un regalo como ADMIN (para provocar `PRICE_CHANGED`). */
export const setProductPrice = (productId: string, priceCents: number) =>
  apiClient.patch(`/admin/catalog/products/${productId}`, { priceCents })
