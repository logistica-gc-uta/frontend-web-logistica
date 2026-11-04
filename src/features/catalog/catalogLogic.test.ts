import { AxiosError } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { adminImage, adminProduct, adminSettings } from '../../test/catalogFixtures'
import { createHttpError, createHttpResponse } from '../../test/http'
import { apiClient } from '../../lib/http/apiClient'
import { describeCatalogError } from './catalogErrors'
import { catalogService } from './catalogService'
import { slugify, validateCategory } from './categoryForm'
import { checkImageFile } from './imageRules'
import {
  centsToDollars,
  formFromProduct,
  productChanges,
  publicationBlockers,
  validateProductForm,
} from './productEditorForm'
import {
  bpsToPercent,
  formFromSettings,
  percentToBps,
  settingsChanges,
  validateSettings,
} from './settingsForm'

describe('IVA simulado: porcentaje ↔ puntos básicos sin pérdida', () => {
  it.each([
    ['15', 1500],
    ['12,5', 1250],
    ['12.05', 1205],
    ['0', 0],
    ['100', 10000],
  ])('%s %% = %i bps', (percent, bps) => {
    expect(percentToBps(percent)).toBe(bps)
  })

  it.each([
    [1500, '15'],
    [1250, '12.5'],
    [1205, '12.05'],
    [0, '0'],
  ])('%i bps se muestra como %s', (bps, percent) => {
    expect(bpsToPercent(bps)).toBe(percent)
    expect(percentToBps(bpsToPercent(bps))).toBe(bps)
  })
})

describe('validación y cambios de la configuración', () => {
  const values = formFromSettings(adminSettings())

  it('parte de los valores actuales del servidor', () => {
    expect(values).toEqual({
      taxEnabled: true,
      taxPercent: '15',
      maxUnits: '10',
      startTime: '07:00',
      endTime: '17:00',
    })
    expect(validateSettings(values)).toEqual({})
  })

  it('rechaza tasa fuera de 0–100, máximo fuera de 1–100 y franjas invertidas o nocturnas', () => {
    expect(validateSettings({ ...values, taxPercent: '100.5' }).taxPercent).toBeDefined()
    expect(validateSettings({ ...values, taxPercent: '-1' }).taxPercent).toBeDefined()
    expect(validateSettings({ ...values, maxUnits: '0' }).maxUnits).toBeDefined()
    expect(validateSettings({ ...values, maxUnits: '101' }).maxUnits).toBeDefined()
    expect(validateSettings({ ...values, maxUnits: '2.5' }).maxUnits).toBeDefined()
    expect(validateSettings({ ...values, startTime: '17:00', endTime: '07:00' }).endTime).toMatch(
      /nocturnas/,
    )
    expect(
      validateSettings({ ...values, startTime: '09:00', endTime: '09:00' }).endTime,
    ).toBeDefined()
  })

  it('envía solo los grupos que cambiaron', () => {
    const saved = adminSettings()
    expect(settingsChanges(values, saved)).toEqual({})
    expect(settingsChanges({ ...values, taxEnabled: false }, saved)).toEqual({
      tax: { enabled: false, rateBps: 1500 },
    })
    expect(settingsChanges({ ...values, maxUnits: '4', endTime: '18:00' }, saved)).toEqual({
      limits: { maxUnitsPerSkuPerOrder: 4 },
      deliverySchedule: { startTime: '07:00', endTime: '18:00' },
    })
  })
})

describe('formulario de producto', () => {
  it('convierte centavos a dólares para editar', () => {
    expect(centsToDollars(2599)).toBe('25.99')
    expect(centsToDollars(5)).toBe('0.05')
    expect(centsToDollars(null)).toBe('')
  })

  it('valida los mismos límites que el backend', () => {
    const empty = validateProductForm(
      {
        sku: 'A',
        name: 'X',
        description: ' ',
        categoryId: '',
        price: '0',
        stock: '-1',
        isFeatured: false,
      },
      { isNew: true },
    )
    expect(Object.keys(empty).sort()).toEqual([
      'categoryId',
      'description',
      'name',
      'price',
      'sku',
      'stock',
    ])
    // Al editar, el SKU no se valida porque no se envía.
    expect(
      validateProductForm(formFromProduct(adminProduct({ sku: 'A' })), { isNew: false }),
    ).toEqual({})
  })

  it('al editar envía solo lo que cambió y nunca el SKU', () => {
    const saved = adminProduct()
    const form = formFromProduct(saved)
    expect(productChanges(form, saved)).toEqual({})
    expect(productChanges({ ...form, sku: 'OTRO', price: '30', stock: '0' }, saved)).toEqual({
      priceCents: 3000,
      stock: 0,
    })
  })

  it('explica qué falta para publicar', () => {
    const active = new Set(['cat-flores'])
    expect(publicationBlockers(adminProduct(), active)).toEqual(['una imagen principal'])
    expect(
      publicationBlockers(
        adminProduct({
          categoryId: null,
          description: null,
          priceCents: null,
          images: [adminImage('a', 0, true)],
        }),
        active,
      ),
    ).toEqual(['una categoría activa', 'una descripción', 'un precio'])
    expect(
      publicationBlockers(adminProduct({ images: [adminImage('a', 0, true)] }), new Set()),
    ).toEqual(['una categoría activa'])
  })
})

describe('categorías e imágenes', () => {
  it('genera el slug sin tildes ni símbolos', () => {
    expect(slugify('Día de la Madre')).toBe('dia-de-la-madre')
    expect(slugify('  ¡Navidad 2026!  ')).toBe('navidad-2026')
  })

  it('valida nombre, slug y descripción', () => {
    expect(validateCategory({ name: 'Flores', slug: 'flores', description: '' }, true)).toEqual({})
    expect(validateCategory({ name: 'F', slug: 'Con Espacios', description: '' }, true)).toEqual({
      name: expect.any(String),
      slug: expect.any(String),
    })
    expect(validateCategory({ name: 'Flores', slug: '', description: '' }, false)).toEqual({})
  })

  it('acepta JPEG, PNG y WebP de hasta 5 MiB', () => {
    const file = (type: string, size: number) => new File([new Uint8Array(size)], 'f', { type })
    expect(checkImageFile(file('image/png', 1024))).toBeNull()
    expect(checkImageFile(file('image/webp', 5 * 1024 * 1024))).toBeNull()
    expect(checkImageFile(file('image/gif', 10))).toMatch(/Formato no admitido/)
    expect(checkImageFile(file('image/jpeg', 5 * 1024 * 1024 + 1))).toMatch(/5 MiB/)
  })
})

describe('catalogService', () => {
  it('lista con los filtros activos y sin el publicId interno', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(
      createHttpResponse({
        items: [
          {
            ...adminProduct({ images: [adminImage('b', 1), adminImage('a', 0, true)] }),
            images: [
              { ...adminImage('b', 1), publicId: 'x' },
              { ...adminImage('a', 0, true), publicId: 'y' },
            ],
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      }),
    )
    const page = await catalogService.listProducts({
      page: 1,
      pageSize: 20,
      search: 'rosa',
      status: 'out_of_stock',
    })

    expect(get).toHaveBeenCalledWith('/admin/catalog/products', {
      params: { page: 1, pageSize: 20, search: 'rosa', status: 'out_of_stock' },
    })
    expect(page.items[0].images.map((image) => image.id)).toEqual(['a', 'b'])
    expect(page.items[0].images[0]).not.toHaveProperty('publicId')

    await catalogService.listProducts({ page: 2, pageSize: 20, status: 'all' })
    expect(get).toHaveBeenLastCalledWith('/admin/catalog/products', {
      params: { page: 2, pageSize: 20 },
    })
  })

  it('crea despublicado y sube la imagen como multipart informando el avance', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue(createHttpResponse({ ...adminProduct(), uploadId: 'up-1' }))
    await catalogService.createProduct({
      sku: 'S',
      name: 'N',
      description: 'D',
      categoryId: 'c',
      priceCents: 100,
      stock: 1,
      isFeatured: false,
    })
    expect(post.mock.calls[0][1]).toEqual(expect.objectContaining({ isPublished: false }))

    const progress = vi.fn()
    const uploadId = await catalogService.uploadImage(
      new File(['x'], 'a.png', { type: 'image/png' }),
      progress,
    )
    const [url, body, config] = post.mock.calls[1]
    expect(url).toBe('/admin/catalog/uploads')
    expect((body as FormData).get('file')).toBeInstanceOf(File)
    config!.onUploadProgress!({ loaded: 50, total: 100 } as never)
    expect(progress).toHaveBeenCalledWith(50)
    expect(uploadId).toBe('up-1')
  })

  it('guarda la configuración con la versión leída', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue(
      createHttpResponse({
        version: 6,
        shipping: { status: 'FREE_INCLUDED' },
        tax: { enabled: true, rateBps: 1200 },
        limits: { maxUnitsPerSkuPerOrder: 10 },
        deliverySchedule: { timeZone: 'America/Guayaquil', startTime: '07:00', endTime: '17:00' },
        updatedAt: 'x',
        updatedById: 'admin-1',
      }),
    )
    const saved = await catalogService.saveSettings(5, { tax: { enabled: true, rateBps: 1200 } })

    expect(patch).toHaveBeenCalledWith('/admin/shop-settings', {
      expectedVersion: 5,
      tax: { enabled: true, rateBps: 1200 },
    })
    expect(saved).toEqual(
      expect.objectContaining({ version: 6, tax: { enabled: true, rateBps: 1200 } }),
    )
  })
})

describe('catalogService · rutas del contrato', () => {
  it('usa los endpoints de ADMIN para productos, categorías e imágenes', async () => {
    const product = { ...adminProduct(), images: [] }
    const get = vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) =>
      url.endsWith('/categories')
        ? createHttpResponse({
            items: [
              {
                id: 'c1',
                name: 'Flores',
                slug: 'flores',
                description: null,
                isActive: true,
                sortOrder: 0,
                createdAt: 'x',
              },
            ],
          })
        : url.endsWith('/shop-settings')
          ? createHttpResponse({
              version: 1,
              shipping: { status: 'FREE_INCLUDED' },
              tax: { enabled: true, rateBps: 1500 },
              limits: { maxUnitsPerSkuPerOrder: 10 },
              deliverySchedule: {
                timeZone: 'America/Guayaquil',
                startTime: '07:00',
                endTime: '17:00',
              },
              updatedAt: 'x',
              updatedById: null,
            })
          : createHttpResponse({ ...product, total: 7 }),
    )
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue(createHttpResponse(product))
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue(createHttpResponse(adminImage('i', 0, true)))
    const del = vi.spyOn(apiClient, 'delete').mockResolvedValue(createHttpResponse(undefined))

    await catalogService.getProduct('p 1')
    expect(get).toHaveBeenLastCalledWith('/admin/catalog/products/p%201')
    expect(await catalogService.countProducts('c1')).toBe(7)
    expect(get).toHaveBeenLastCalledWith('/admin/catalog/products', {
      params: { categoryId: 'c1', page: 1, pageSize: 1 },
    })
    expect(await catalogService.listCategories()).toEqual([
      { id: 'c1', name: 'Flores', slug: 'flores', description: null, isActive: true, sortOrder: 0 },
    ])
    expect((await catalogService.getSettings()).maxUnitsPerSkuPerOrder).toBe(10)

    await catalogService.updateProduct('p1', { stock: 3 })
    expect(patch).toHaveBeenLastCalledWith('/admin/catalog/products/p1', { stock: 3 })
    await catalogService.setPublication('p1', true)
    expect(patch).toHaveBeenLastCalledWith('/admin/catalog/products/p1/publication', {
      isPublished: true,
    })
    await catalogService.updateCategory('c1', { isActive: false })
    expect(patch).toHaveBeenLastCalledWith('/admin/catalog/categories/c1', { isActive: false })
    await catalogService.updateImage('p1', 'i1', { position: 2 })
    expect(patch).toHaveBeenLastCalledWith('/admin/catalog/products/p1/images/i1', { position: 2 })

    await catalogService.createCategory({ name: 'F', slug: 'f', description: null, isActive: true })
    expect(post).toHaveBeenLastCalledWith('/admin/catalog/categories', {
      name: 'F',
      slug: 'f',
      description: null,
      isActive: true,
    })
    const image = await catalogService.attachImage('p1', {
      uploadId: 'u',
      altText: 'a',
      isPrimary: true,
      position: 0,
    })
    expect(post).toHaveBeenLastCalledWith('/admin/catalog/products/p1/images', {
      uploadId: 'u',
      altText: 'a',
      isPrimary: true,
      position: 0,
    })
    expect(image).not.toHaveProperty('publicId')
    await catalogService.removeImage('p1', 'i1')
    expect(del).toHaveBeenCalledWith('/admin/catalog/products/p1/images/i1')
  })
})

describe('describeCatalogError', () => {
  const shopError = (status: number, code: string) =>
    createHttpError(status, { data: { error: { code, message: 'x' } } })

  it.each([
    ['SKU_ALREADY_EXISTS', 'Ya existe un producto con ese SKU.'],
    ['PRODUCT_PUBLICATION_INVALID', 'No se puede publicar'],
    ['IMAGE_TOO_LARGE', '5 MiB'],
    ['IMAGE_UNSUPPORTED', 'Formato no admitido'],
    ['UPLOAD_FAILED', 'servicio de imágenes'],
    ['SETTINGS_VERSION_CONFLICT', 'Otro administrador'],
  ])('%s', (code, text) => {
    expect(describeCatalogError(shopError(409, code), 'x')).toContain(text)
  })

  it('explica 401, 403 y la falta de conexión', () => {
    expect(describeCatalogError(createHttpError(401), 'x')).toMatch(/sesión venció/)
    expect(describeCatalogError(createHttpError(403), 'x')).toMatch(/Solo un ADMIN/)
    expect(describeCatalogError(new AxiosError('net', 'ERR_NETWORK'), 'x')).toMatch(/conectar/)
    expect(describeCatalogError(createHttpError(500), 'Otro')).toBe('Otro')
  })
})
