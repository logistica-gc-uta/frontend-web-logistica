import { expect, test } from '@playwright/test'
import { deflateSync } from 'node:zlib'
import { apiAs, type Api } from './support/api'
import { API_URL, uniqueSuffix } from './support/env'
import { evidence } from './support/evidence'
import { registerCustomer } from './support/shop'

/**
 * Panel ADMIN del Shop contra la API real: categoría → producto (despublicado) → imagen subida por
 * el backend a Cloudinary → publicación → visible en el Shop; configuración con su versión. Requiere
 * las claves de Cloudinary en el `.env` del backend.
 */
test.describe.configure({ mode: 'serial' })

const FOLDER = '21-admin-catalogo'
let admin: Api

/** PNG real de un color (el backend decodifica la imagen). */
function png(): Buffer {
  const size = 240
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    let crc = 0xffffffff
    for (const byte of body) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
    const sum = Buffer.alloc(4)
    sum.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
    return Buffer.concat([length, body, sum])
  }
  const row = Buffer.alloc(size * 3 + 1)
  for (let x = 0; x < size; x += 1) row.set([16, 185, 129], 1 + x * 3)
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

test.beforeAll(async () => {
  admin = await apiAs('ADMIN')
})

test.afterAll(async () => admin?.dispose())

test('el ADMIN crea, ilustra y publica un regalo, y el Shop lo muestra', async ({ page }) => {
  const suffix = uniqueSuffix()
  const category = `E2E Graduación ${suffix}`
  const name = `E2E Kit de graduación ${suffix}`

  await test.step('crea la categoría con su slug', async () => {
    await page.goto('/categorias')
    const form = page.getByRole('form', { name: 'Nueva categoría' })
    await form.getByLabel('Nombre').fill(category)
    await expect(form.getByLabel('Slug (enlace en el Shop)')).toHaveValue(
      `e2e-graduacion-${suffix.toLowerCase()}`,
    )
    await form.getByRole('button', { name: 'Crear categoría' }).click()
    await expect(page.getByText(`Categoría «${category}» creada.`)).toBeVisible()
  })

  await test.step('crea el producto: queda despublicado', async () => {
    await page.goto('/productos')
    await page.getByRole('link', { name: 'Nuevo producto' }).click()
    const form = page.getByRole('form', { name: 'Datos del producto' })
    await form.getByLabel('SKU').fill(`E2E-GRAD-${suffix}`)
    await form.getByLabel('Nombre').fill(name)
    await form.getByLabel('Descripción').fill('Birrete de chocolate y tarjeta.')
    await form.getByLabel('Categoría').selectOption({ label: category })
    await form.getByLabel('Precio (USD)').fill('19,50')
    await form.getByLabel('Stock').fill('6')
    await form.getByRole('button', { name: 'Crear producto' }).click()
    await expect(page.getByText(/Producto creado \(despublicado\)/)).toBeVisible()
    await expect(page.getByRole('note').filter({ hasText: 'Para publicarlo falta' })).toHaveText(
      'Para publicarlo falta: una imagen principal.',
    )
  })

  await test.step('sube la imagen por el backend y la deja como principal', async () => {
    const images = page.getByRole('region', { name: 'Imágenes' })
    await images.getByLabel('Archivo de imagen').setInputFiles({
      name: 'graduacion.png',
      mimeType: 'image/png',
      buffer: png(),
    })
    await images
      .getByLabel('Texto alternativo (describe la imagen)')
      .fill('Kit de graduación verde')
    await images.getByRole('button', { name: 'Subir imagen' }).click()
    await expect(images.getByText('Imagen subida y asociada al producto.')).toBeVisible({
      timeout: 60_000,
    })
    await expect(images.getByText('Imagen principal', { exact: true })).toBeVisible()
  })

  await test.step('publica con confirmación y el visitante lo ve en el Shop', async () => {
    const publication = page.getByRole('region', { name: 'Publicación' })
    await publication.getByRole('button', { name: /^Publicar/ }).click()
    await publication.getByRole('button', { name: 'Sí, publicar' }).click()
    await expect(publication.getByText('Publicado: ya se muestra en el Shop.')).toBeVisible()
    await evidence(page, 'e2e-01-editor-publicado', FOLDER)

    const productId = page.url().split('/').pop()!
    await page.goto(`/productos/${productId}`)
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible()
    await expect(page.getByRole('img', { name: 'Kit de graduación verde' })).toBeVisible()
    await expect(page.getByText('$19,50')).toBeVisible()
    await evidence(page, 'e2e-02-visible-en-el-shop', FOLDER)
  })
})

test('un cambio del límite por SKU en Configuración Shop se refleja en el Shop', async ({
  page,
}) => {
  const current = await admin.get<{ version: number; limits: { maxUnitsPerSkuPerOrder: number } }>(
    '/admin/shop-settings',
  )
  const original = current.limits.maxUnitsPerSkuPerOrder
  const next = original === 4 ? 3 : 4
  try {
    await page.goto('/configuracion-shop')
    const form = page.getByRole('form', { name: 'Configuración del Shop' })
    await form.getByLabel(/Unidades máximas/).fill(String(next))
    await form.getByRole('button', { name: 'Guardar configuración' }).click()
    await expect(
      page.getByText(`Configuración guardada (versión ${current.version + 1})`, { exact: false }),
    ).toBeVisible()
    await evidence(page, 'e2e-03-configuracion-guardada', FOLDER)

    const settings = (await (await fetch(`${API_URL}/shop/settings`)).json()) as {
      limits: { maxUnitsPerSkuPerOrder: number }
    }
    expect(settings.limits.maxUnitsPerSkuPerOrder).toBe(next)
  } finally {
    const latest = await admin.get<{ version: number }>('/admin/shop-settings')
    await admin.patch('/admin/shop-settings', {
      expectedVersion: latest.version,
      limits: { maxUnitsPerSkuPerOrder: original },
    })
  }
})

test('un CLIENT no ve ni abre la administración del catálogo', async ({ browser }) => {
  const buyer = await registerCustomer('admin21')
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await context.newPage()
  await page.addInitScript(
    (session) => {
      localStorage.setItem('regalia.session', JSON.stringify(session))
    },
    { token: buyer.token, user: { ...buyer.user, role: 'CLIENT' } },
  )

  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Productos' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Configuración Shop' })).toHaveCount(0)
  for (const route of ['/productos', '/categorias', '/configuracion-shop']) {
    await page.goto(route)
    await expect(page).toHaveURL(/\/login$/)
  }
  await context.close()
})
