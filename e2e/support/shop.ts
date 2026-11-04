import { deflateSync } from 'node:zlib'
import type { Api } from './api'
import { API_URL, uniqueSuffix } from './env'

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  let crc = 0xffffffff
  for (const byte of body) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return Buffer.concat([length, body, checksum])
}

/** PNG de un color: el backend decodifica la imagen, así que tiene que ser real. */
function solidPng([red, green, blue]: [number, number, number], size = 200): Buffer {
  const row = Buffer.alloc(size * 3 + 1)
  for (let x = 0; x < size; x += 1) row.set([red, green, blue], 1 + x * 3)
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: size }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * Regalo publicado de esta ejecución (categoría propia e imagen subida por el backend a
 * Cloudinary). Requiere las claves de Cloudinary en el `.env` del backend.
 */
export async function createShopProduct(
  admin: Api,
  { name, priceCents, stock }: { name: string; priceCents: number; stock: number },
): Promise<{ id: string; name: string }> {
  const suffix = uniqueSuffix().toLowerCase()
  const category = await admin.post<{ id: string }>('/admin/catalog/categories', {
    name: `E2E Ocasión ${suffix}`,
    slug: `e2e-${suffix}`,
    isActive: true,
  })
  const product = await admin.post<{ id: string; name: string }>('/admin/catalog/products', {
    sku: `E2E-${suffix}`.toUpperCase(),
    name,
    description: 'Regalo de prueba E2E.',
    categoryId: category.id,
    priceCents,
    stock,
    isPublished: false,
  })
  const { uploadId } = await admin.upload<{ uploadId: string }>('/admin/catalog/uploads', {
    name: 'regalo.png',
    mimeType: 'image/png',
    buffer: solidPng([236, 72, 153]),
  })
  await admin.post(`/admin/catalog/products/${product.id}/images`, {
    uploadId,
    altText: name,
    isPrimary: true,
    position: 0,
  })
  await admin.patch(`/admin/catalog/products/${product.id}/publication`, { isPublished: true })
  return product
}

/** Cliente nuevo registrado por la API pública (rol CLIENT asignado por el backend). */
export async function registerCustomer(label: string) {
  const email = `e2e-${label}-${uniqueSuffix().toLowerCase()}@regalia.test`
  const password = 'Clave12345'
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: `E2E Cliente ${label}`, email, password }),
  })
  if (!response.ok) throw new Error(`No se pudo registrar al cliente (HTTP ${response.status})`)
  const login = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = (await login.json()) as { access_token: string; user: { id: string } }
  return { email, password, token: data.access_token, user: data.user }
}

/** Tarjetas de demostración del contrato (solo existen en el simulador de pagos). */
export const CARDS = {
  approved: { number: '9000 0000 0000 0001', holder: 'PRUEBA APROBADA', cvv: '111' },
  empty: { number: '9000 0000 0000 0003', holder: 'PRUEBA SIN SALDO', cvv: '333' },
} as const
