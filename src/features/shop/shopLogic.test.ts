import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../../lib/http/apiClient'
import { createHttpError, createHttpResponse } from '../../test/http'
import { cartStorage } from './cart/cartStorage'
import {
  catalogSearch,
  hasActiveFilters,
  parseCatalogParams,
  toApiQuery,
  toCatalogParams,
  validateFilters,
  type CatalogState,
} from './catalogQuery'
import { dollarsToCents, formatCents } from './money'
import { shopService } from './shopService'

const state = (overrides: Partial<CatalogState> = {}): CatalogState => ({
  search: '',
  categoryId: '',
  minPrice: '',
  maxPrice: '',
  inStock: false,
  sort: 'featured',
  page: 1,
  ...overrides,
})

describe('precios en centavos', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12,50', 1250],
    ['0.1', 10],
    ['0,07', 7],
    [' 19.99 ', 1999],
    ['1000000', 100000000],
  ])('%s dólares son %i centavos, sin errores de decimales', (text, cents) => {
    expect(dollarsToCents(text)).toBe(cents)
  })

  it.each(['', 'abc', '-5', '1.999', '1e3', '12.', '$10', '1 000'])(
    '«%s» no es un monto válido',
    (text) => {
      expect(dollarsToCents(text)).toBeNull()
    },
  )

  it('muestra los centavos como dólares', () => {
    expect(formatCents(2599)).toMatch(/25,99/)
    expect(formatCents(5)).toMatch(/0,05/)
  })
})

describe('consulta del catálogo en la URL', () => {
  it('lee todos los criterios y vuelve a escribirlos igual', () => {
    const params = new URLSearchParams(
      'q=rosas&categoria=cat-1&min=10&max=40,5&disponibles=1&orden=price_desc&pagina=3',
    )
    const parsed = parseCatalogParams(params)

    expect(parsed).toEqual({
      search: 'rosas',
      categoryId: 'cat-1',
      minPrice: '10',
      maxPrice: '40,5',
      inStock: true,
      sort: 'price_desc',
      page: 3,
    })
    expect(toCatalogParams(parsed).toString()).toBe(params.toString())
  })

  it('ignora un orden o una página que no existen y no escribe los valores por defecto', () => {
    const parsed = parseCatalogParams(new URLSearchParams('orden=best_selling&pagina=-2'))

    expect(parsed.sort).toBe('featured')
    expect(parsed.page).toBe(1)
    expect(toCatalogParams(parsed).toString()).toBe('')
  })

  it('convierte los precios a centavos y solo envía los filtros activos', () => {
    expect(
      toApiQuery(state({ search: 'taza', minPrice: '5', maxPrice: '19,99', inStock: true })),
    ).toEqual({
      page: 1,
      pageSize: 12,
      sort: 'featured',
      search: 'taza',
      minPriceCents: 500,
      maxPriceCents: 1999,
      inStock: true,
    })
    expect(toApiQuery(state())).toEqual({ page: 1, pageSize: 12, sort: 'featured' })
  })

  it('no envía precios inválidos ni un mínimo mayor que el máximo escritos a mano en la URL', () => {
    expect(toApiQuery(state({ minPrice: 'abc', maxPrice: '20' }))).toEqual(
      expect.objectContaining({ maxPriceCents: 2000 }),
    )
    expect(toApiQuery(state({ minPrice: 'abc' }))).not.toHaveProperty('minPriceCents')
    const inverted = toApiQuery(state({ minPrice: '50', maxPrice: '10' }))
    expect(inverted).not.toHaveProperty('minPriceCents')
    expect(inverted).not.toHaveProperty('maxPriceCents')
  })

  it('valida los precios del formulario', () => {
    expect(validateFilters(state({ minPrice: '10', maxPrice: '20' }))).toEqual({})
    expect(validateFilters(state({ minPrice: 'diez' }))).toHaveProperty('minPrice')
    expect(validateFilters(state({ maxPrice: '1.234' }))).toHaveProperty('maxPrice')
    expect(validateFilters(state({ minPrice: '30', maxPrice: '20' })).maxPrice).toBe(
      'El precio máximo debe ser mayor o igual al mínimo',
    )
  })

  it('arma enlaces filtrados y sabe si hay filtros activos', () => {
    expect(catalogSearch({ categoryId: 'cat-1' })).toBe('?categoria=cat-1')
    expect(catalogSearch({ search: '' })).toBe('')
    expect(hasActiveFilters(state())).toBe(false)
    expect(hasActiveFilters(state({ inStock: true }))).toBe(true)
  })
})

describe('shopService', () => {
  afterEach(() => vi.restoreAllMocks())

  const rawProduct = {
    id: 'p1',
    sku: 'SKU-1',
    name: 'Taza',
    description: null,
    categoryId: 'c1',
    category: null,
    priceCents: 1500,
    currency: 'USD',
    stock: 3,
    isPublished: true,
    isFeatured: true,
    isAvailable: true,
    images: [
      {
        id: 'i1',
        secureUrl: 'https://x/taza.jpg',
        publicId: 'interno',
        altText: null,
        position: 0,
        isPrimary: true,
      },
    ],
    primaryImageUrl: 'https://x/taza.jpg',
    createdAt: '2026-11-01T00:00:00Z',
  }

  it('consulta el catálogo con los parámetros de la API y copia solo lo que se muestra', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(
      createHttpResponse({
        items: [rawProduct],
        total: 1,
        page: 2,
        pageSize: 12,
        totalPages: 1,
        sortApplied: 'price_asc',
      }),
    )

    const page = await shopService.products({
      page: 2,
      pageSize: 12,
      sort: 'price_asc',
      search: 'taza',
      minPriceCents: 500,
      inStock: true,
    })

    expect(get).toHaveBeenCalledWith('/shop/products', {
      params: {
        page: 2,
        pageSize: 12,
        sort: 'price_asc',
        search: 'taza',
        minPriceCents: 500,
        inStock: 'true',
      },
    })
    expect(page.items[0]).toEqual(
      expect.objectContaining({ id: 'p1', description: '', priceCents: 1500, isFeatured: true }),
    )
    expect(page.items[0].images[0]).not.toHaveProperty('publicId')
    expect(page.items[0]).not.toHaveProperty('sku')
  })

  it('traduce un regalo inexistente (404) o un ID mal formado (400)', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValueOnce(
      createHttpError(404, {
        data: { error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found' } },
      }),
    )
    await expect(shopService.product('p1')).rejects.toThrow(
      'Este regalo no existe o ya no está disponible.',
    )

    vi.spyOn(apiClient, 'get').mockRejectedValueOnce(createHttpError(400))
    await expect(shopService.product('no-es-uuid')).rejects.toThrow(
      'Este regalo no existe o ya no está disponible.',
    )
  })

  it('deja pasar los demás errores tal cual', async () => {
    const serverError = createHttpError(500)
    vi.spyOn(apiClient, 'get').mockRejectedValue(serverError)

    await expect(shopService.products({ page: 1, pageSize: 12, sort: 'featured' })).rejects.toBe(
      serverError,
    )
  })

  it('lee las categorías y el límite vigente por SKU', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) =>
      url === '/shop/categories'
        ? createHttpResponse({ items: [{ id: 'c1', name: 'Tazas', productCount: 2 }] })
        : createHttpResponse({
            version: 3,
            shipping: { status: 'FREE_INCLUDED', amountCents: 0 },
            tax: { mode: 'SIMULATED', enabled: false, rateBps: 1200, ratePercent: 12 },
            limits: { maxUnitsPerSkuPerOrder: 4 },
            deliverySchedule: {
              timeZone: 'America/Guayaquil',
              startTime: '08:00',
              endTime: '16:30',
              boundariesInclusive: true,
            },
          }),
    )

    expect(await shopService.categories()).toEqual([
      expect.objectContaining({ id: 'c1', name: 'Tazas' }),
    ])
    expect(await shopService.settings()).toEqual({
      version: 3,
      maxUnitsPerSkuPerOrder: 4,
      shippingFreeIncluded: true,
      tax: { enabled: false, rateBps: 1200, ratePercent: 12 },
      deliverySchedule: { timeZone: 'America/Guayaquil', startTime: '08:00', endTime: '16:30' },
    })
  })
})

describe('cartStorage', () => {
  afterEach(() => localStorage.clear())

  it('guarda y recupera productos y cantidades', () => {
    cartStorage.save([{ productId: 'p1', quantity: 2 }])
    expect(cartStorage.load()).toEqual([{ productId: 'p1', quantity: 2 }])
  })

  it('descarta datos dañados o inválidos', () => {
    localStorage.setItem('regalia.cart', '{no es json')
    expect(cartStorage.load()).toEqual([])

    localStorage.setItem(
      'regalia.cart',
      JSON.stringify([{ productId: 'p1', quantity: 0 }, { productId: 'p2', quantity: 1 }, 'x']),
    )
    expect(cartStorage.load()).toEqual([{ productId: 'p2', quantity: 1 }])
  })

  it('si el navegador no permite guardar, no falla', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    expect(() => cartStorage.save([{ productId: 'p1', quantity: 1 }])).not.toThrow()
    vi.restoreAllMocks()
  })
})
