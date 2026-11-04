import axios from 'axios'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { env } from '../config/env'
import { catalogService } from '../features/catalog/catalogService'
import { customerService } from '../features/shop/account/customerService'
import { customerStorage } from '../features/shop/account/customerStorage'
import { checkoutService } from '../features/shop/checkout/checkoutService'
import { customerOrdersService } from '../features/shop/orders/customerOrdersService'
import { shopErrorInfo } from '../features/shop/shopError'
import { shopService } from '../features/shop/shopService'
import type { Zone } from '../features/zones/types'
import { authStorage } from '../lib/auth/authStorage'
import { apiClient } from '../lib/http/apiClient'
import { BUSINESS_TIME_ZONE } from '../lib/time/guayaquil'
import { solidPng } from './support/png'
import { loginAsAdmin, loginAsClient, uniqueSuffix } from './support/session'

/**
 * Administración del catálogo y de la configuración del Shop contra la API real: lo que hace el
 * panel ADMIN (con el mismo `catalogService`) y su efecto en el Shop público. Las imágenes se
 * suben a Cloudinary a través del backend; requiere sus claves en el `.env` del backend.
 */
const code = (error: unknown) => shopErrorInfo(error).code
const status = (error: unknown) => shopErrorInfo(error).status
const pngFile = (name: string) =>
  new File([solidPng([219, 39, 119]) as BlobPart], name, { type: 'image/png' })
const visible = (productId: string) =>
  shopService.product(productId).then(
    () => true,
    () => false,
  )

let categoryId: string
let product: { id: string; sku: string }

describe('Integración real · administración del catálogo (ADMIN)', () => {
  beforeAll(async () => {
    await loginAsAdmin()
    const suffix = uniqueSuffix().toLowerCase()
    categoryId = (
      await catalogService.createCategory({
        name: `IT Admin ${suffix}`,
        slug: `it-admin-${suffix}`,
        description: null,
        isActive: true,
      })
    ).id
    product = await catalogService.createProduct({
      sku: `IT-ADM-${suffix}`.toUpperCase(),
      name: 'IT Regalo administrado',
      description: 'Creado por la prueba de administración',
      categoryId,
      priceCents: 1234,
      stock: 0,
      isFeatured: false,
    })
  }, 60_000)

  afterAll(() => authStorage.clear())

  it('un producto nuevo queda despublicado y el ADMIN lo ve aunque tenga stock 0', async () => {
    await loginAsAdmin()
    const created = await catalogService.getProduct(product.id)
    expect(created).toEqual(
      expect.objectContaining({ isPublished: false, stock: 0, priceCents: 1234 }),
    )

    for (const status of ['unpublished', 'out_of_stock'] as const) {
      const page = await catalogService.listProducts({
        page: 1,
        pageSize: 50,
        search: product.sku,
        status,
      })
      expect(page.items.map(({ id }) => id)).toContain(product.id)
    }
    expect(await visible(product.id)).toBe(false)
  })

  it('el SKU y la categoría repetidos se rechazan con su código', async () => {
    await loginAsAdmin()
    const duplicate = await catalogService
      .createProduct({
        sku: product.sku,
        name: 'Repetido',
        description: 'x',
        categoryId,
        priceCents: 100,
        stock: 1,
        isFeatured: false,
      })
      .catch((error: unknown) => error)
    expect(code(duplicate)).toBe('SKU_ALREADY_EXISTS')

    const category = await catalogService
      .listCategories()
      .then((list) => list.find(({ id }) => id === categoryId)!)
    const repeated = await catalogService
      .createCategory({
        name: category.name,
        slug: category.slug,
        description: null,
        isActive: true,
      })
      .catch((error: unknown) => error)
    expect(code(repeated)).toBe('CATEGORY_ALREADY_EXISTS')
  })

  it('sin imagen principal no se publica; con una imagen subida por el backend sí y el Shop la muestra', async () => {
    await loginAsAdmin()
    await catalogService.updateProduct(product.id, { stock: 5 })
    const blocked = await catalogService
      .setPublication(product.id, true)
      .catch((error: unknown) => error)
    expect(code(blocked)).toBe('PRODUCT_PUBLICATION_INVALID')

    const uploadId = await catalogService.uploadImage(pngFile('regalo.png'))
    const image = await catalogService.attachImage(product.id, {
      uploadId,
      altText: 'IT Regalo rosado',
      isPrimary: true,
      position: 0,
    })
    expect(image.secureUrl).toMatch(/^https:\/\/res\.cloudinary\.com\//)
    await catalogService.updateImage(product.id, image.id, { altText: 'IT Regalo rosado editado' })

    const published = await catalogService.setPublication(product.id, true)
    expect(published.isPublished).toBe(true)
    authStorage.clear()
    const inShop = await shopService.product(product.id)
    expect(inShop).toEqual(
      expect.objectContaining({ priceCents: 1234, primaryImageUrl: image.secureUrl }),
    )
    expect(inShop.images[0].altText).toBe('IT Regalo rosado editado')
  }, 60_000)

  it('un archivo que no es imagen se rechaza en el backend (415)', async () => {
    await loginAsAdmin()
    const rejected = await catalogService
      .uploadImage(new File(['no soy imagen'], 'falso.png', { type: 'image/png' }))
      .catch((error: unknown) => error)
    expect(code(rejected)).toBe('IMAGE_UNSUPPORTED')
  })

  it('despublicar o desactivar la categoría lo oculta del Shop sin borrarlo', async () => {
    await loginAsAdmin()
    await catalogService.setPublication(product.id, false)
    expect(await visible(product.id)).toBe(false)
    await loginAsAdmin()
    await catalogService.setPublication(product.id, true)
    expect(await visible(product.id)).toBe(true)

    await loginAsAdmin()
    await catalogService.updateCategory(categoryId, { isActive: false })
    expect(await visible(product.id)).toBe(false)
    await loginAsAdmin()
    expect((await catalogService.getProduct(product.id)).isPublished).toBe(true)
    await catalogService.updateCategory(categoryId, { isActive: true })
    expect(await visible(product.id)).toBe(true)
  })

  it('un cambio de precio posterior a una compra no reescribe su comprobante', async () => {
    authStorage.clear()
    const email = `it-adm-${uniqueSuffix().toLowerCase()}@regalia.test`
    await customerService.register({ name: 'IT Compradora', email, password: 'Clave12345' })
    customerStorage.save(await customerService.login({ email, password: 'Clave12345' }))
    await loginAsAdmin()
    const zone = (await apiClient.get<Zone[]>('/zones')).data.find(
      (candidate) => candidate.depotLocation,
    )!
    const tomorrow = new Intl.DateTimeFormat('sv-SE', { timeZone: BUSINESS_TIME_ZONE }).format(
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    )
    const items = [{ productId: product.id, quantity: 1 }]
    const delivery = {
      recipient: { name: 'IT Destinataria', phone: '0991234567' },
      zoneId: zone.id,
      deliveryAddress: 'IT Dirección de prueba',
      deliveryLocation: zone.depotLocation!,
      scheduledDeliveryDate: `${tomorrow}T10:00:00-05:00`,
    }
    const quote = await checkoutService.quote(items, delivery)
    const paid = await checkoutService.pay(crypto.randomUUID(), {
      items,
      delivery,
      quoteToken: quote.quoteToken,
      paymentCard: {
        number: '9000 0000 0000 0001',
        holderName: 'PRUEBA APROBADA',
        expiresMonth: 12,
        expiresYear: 2030,
        cvv: '111',
      },
    })

    await catalogService.updateProduct(product.id, { priceCents: 9999 })
    const receipt = await customerOrdersService.receipt(paid.order.id)
    expect(receipt.items[0].unitPriceCents).toBe(1234)
    expect(receipt.totalCents).toBe(paid.order.totalCents)
    customerStorage.clear()
  }, 60_000)
})

describe('Integración real · configuración del Shop (ADMIN)', () => {
  let original: { maxUnitsPerSkuPerOrder: number; version: number }

  beforeAll(async () => {
    await loginAsAdmin()
    const current = await catalogService.getSettings()
    original = { maxUnitsPerSkuPerOrder: current.maxUnitsPerSkuPerOrder, version: current.version }
  })

  afterAll(async () => {
    await loginAsAdmin()
    const current = await catalogService.getSettings()
    if (current.maxUnitsPerSkuPerOrder !== original.maxUnitsPerSkuPerOrder) {
      await catalogService.saveSettings(current.version, {
        limits: { maxUnitsPerSkuPerOrder: original.maxUnitsPerSkuPerOrder },
      })
    }
    authStorage.clear()
  })

  it('guardar con la versión leída la incrementa y el Shop público ve el nuevo valor', async () => {
    await loginAsAdmin()
    const before = await catalogService.getSettings()
    const next = before.maxUnitsPerSkuPerOrder === 7 ? 6 : 7
    const saved = await catalogService.saveSettings(before.version, {
      limits: { maxUnitsPerSkuPerOrder: next },
    })

    expect(saved.version).toBe(before.version + 1)
    authStorage.clear()
    expect((await shopService.settings()).maxUnitsPerSkuPerOrder).toBe(next)
  })

  it('dos ADMIN con la misma versión: el segundo recibe SETTINGS_VERSION_CONFLICT y no sobrescribe', async () => {
    await loginAsAdmin()
    const read = await catalogService.getSettings()
    const first = read.maxUnitsPerSkuPerOrder === 5 ? 4 : 5
    await catalogService.saveSettings(read.version, { limits: { maxUnitsPerSkuPerOrder: first } })

    const second = await catalogService
      .saveSettings(read.version, { limits: { maxUnitsPerSkuPerOrder: first + 1 } })
      .catch((error: unknown) => error)
    expect(code(second)).toBe('SETTINGS_VERSION_CONFLICT')
    expect(shopErrorInfo(second).details).toEqual(
      expect.objectContaining({ expectedVersion: read.version }),
    )
    expect((await catalogService.getSettings()).maxUnitsPerSkuPerOrder).toBe(first)
  })
})

describe('Integración real · permisos del catálogo y la configuración', () => {
  it('un visitante recibe 401 y un CLIENT 403 en las mutaciones de productos, imágenes y configuración', async () => {
    const visitor = axios.create({ baseURL: env.apiUrl })
    for (const request of [
      visitor.get('/admin/catalog/products'),
      visitor.post('/admin/catalog/categories', { name: 'X', slug: 'x', isActive: true }),
      visitor.patch('/admin/shop-settings', {
        expectedVersion: 1,
        limits: { maxUnitsPerSkuPerOrder: 3 },
      }),
    ]) {
      expect(status(await request.catch((error: unknown) => error))).toBe(401)
    }

    await loginAsClient()
    const asClient = async (call: () => Promise<unknown>) =>
      status(await call().catch((error: unknown) => error))
    expect(await asClient(() => catalogService.listProducts({ page: 1, pageSize: 1 }))).toBe(403)
    expect(
      await asClient(() =>
        catalogService.createCategory({
          name: 'X',
          slug: 'x-cliente',
          description: null,
          isActive: true,
        }),
      ),
    ).toBe(403)
    expect(await asClient(() => catalogService.uploadImage(pngFile('cliente.png')))).toBe(403)
    expect(await asClient(() => catalogService.getSettings())).toBe(403)
    expect(
      await asClient(() =>
        catalogService.saveSettings(1, { limits: { maxUnitsPerSkuPerOrder: 3 } }),
      ),
    ).toBe(403)
    authStorage.clear()
  })
})
