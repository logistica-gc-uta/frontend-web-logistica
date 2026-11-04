import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { shopService } from '../features/shop/shopService'
import type { ShopProduct } from '../features/shop/types'
import { authStorage } from '../lib/auth/authStorage'
import { loginAsAdmin, uniqueSuffix } from './support/session'
import { createShopCategory, createShopProduct, setMaxUnitsPerSku } from './support/shopCatalog'

/**
 * Tienda pública contra la API real: el catálogo de prueba se crea con la API de ADMIN y su imagen
 * se sube a Cloudinary a través del backend. Las consultas del Shop se hacen sin sesión, como un
 * visitante. Requiere las claves de Cloudinary en el `.env` del backend.
 */
const TERM = `it${uniqueSuffix().toLowerCase()}`

let category: { id: string; name: string }
const published: { id: string; name: string; priceCents: number }[] = []
let soldOut: { id: string }
let hidden: { id: string }

const asVisitor = () => authStorage.clear()
const inMyCategory = (query: Partial<Parameters<typeof shopService.products>[0]> = {}) =>
  shopService.products({
    page: 1,
    pageSize: 12,
    sort: 'featured',
    categoryId: category.id,
    ...query,
  })

describe('Integración real · Shop público (/shop)', () => {
  beforeAll(async () => {
    await loginAsAdmin()
    category = await createShopCategory('IT Ocasión')
    const prices = [1500, 2599, 999, 4000, 3250]
    for (const [index, priceCents] of prices.entries()) {
      const product = await createShopProduct({
        categoryId: category.id,
        name: `IT Regalo ${index + 1}`,
        description: index === 0 ? `Caja especial ${TERM} con tarjeta` : 'Regalo de prueba',
        priceCents,
        stock: 5,
        isFeatured: index === 1,
        color: [40 * index, 120, 200],
      })
      published.push({ ...product, priceCents })
    }
    soldOut = await createShopProduct({
      categoryId: category.id,
      name: 'IT Regalo agotado',
      description: 'Sin stock',
      priceCents: 1800,
      stock: 0,
    })
    hidden = await createShopProduct({
      categoryId: category.id,
      name: 'IT Regalo sin publicar',
      description: 'Borrador',
      priceCents: 1200,
      stock: 5,
      publish: false,
    })
    asVisitor()
  }, 120_000)

  it('un visitante ve la categoría con el número real de regalos publicados', async () => {
    asVisitor()
    const found = (await shopService.categories()).find(({ id }) => id === category.id)

    expect(found).toEqual(expect.objectContaining({ name: category.name, productCount: 6 }))
  })

  it('pagina en el servidor sin repetir ni perder regalos y sin los no publicados', async () => {
    asVisitor()
    const first = await inMyCategory({ pageSize: 4, page: 1 })
    const second = await inMyCategory({ pageSize: 4, page: 2 })

    expect(first.total).toBe(6)
    expect(first.totalPages).toBe(2)
    expect(first.items).toHaveLength(4)
    expect(second.items).toHaveLength(2)
    const ids = [...first.items, ...second.items].map(({ id }) => id)
    expect(new Set(ids).size).toBe(6)
    expect(ids).toEqual(expect.arrayContaining([...published.map(({ id }) => id), soldOut.id]))
    expect(ids).not.toContain(hidden.id)
  })

  it('cada regalo trae precio en centavos, imagen principal de Cloudinary y disponibilidad', async () => {
    asVisitor()
    const { items } = await inMyCategory()
    const byId = new Map(items.map((item) => [item.id, item]))

    for (const { id, priceCents } of published) {
      const item = byId.get(id) as ShopProduct
      expect(item.priceCents).toBe(priceCents)
      expect(item.isAvailable).toBe(true)
      expect(item.primaryImageUrl).toMatch(/^https:\/\/res\.cloudinary\.com\//)
      expect(item.images[0]).toEqual(
        expect.objectContaining({ isPrimary: true, altText: expect.stringContaining('Foto de') }),
      )
    }
    expect(byId.get(soldOut.id)).toEqual(expect.objectContaining({ stock: 0, isAvailable: false }))
  })

  it('combina búsqueda en la descripción, rango de precios, disponibilidad y orden', async () => {
    asVisitor()
    const bySearch = await shopService.products({
      page: 1,
      pageSize: 12,
      sort: 'featured',
      search: TERM,
    })
    expect(bySearch.items.map(({ id }) => id)).toEqual([published[0].id])

    const inRange = await inMyCategory({
      minPriceCents: 1500,
      maxPriceCents: 3250,
      sort: 'price_asc',
    })
    expect(inRange.items.map(({ priceCents }) => priceCents)).toEqual([1500, 1800, 2599, 3250])

    const available = await inMyCategory({ inStock: true, sort: 'price_desc' })
    expect(available.items.map(({ id }) => id)).not.toContain(soldOut.id)
    expect(available.items.map(({ priceCents }) => priceCents)).toEqual([
      4000, 3250, 2599, 1500, 999,
    ])

    const none = await inMyCategory({ search: `${TERM}-nada` })
    expect(none).toEqual(expect.objectContaining({ total: 0, items: [] }))
  })

  it('el detalle de un regalo publicado existe; uno sin publicar o inexistente no', async () => {
    asVisitor()
    const detail = await shopService.product(published[1].id)
    expect(detail).toEqual(
      expect.objectContaining({
        name: 'IT Regalo 2',
        isFeatured: true,
        category: expect.objectContaining({ id: category.id }),
      }),
    )

    for (const id of [hidden.id, '00000000-0000-4000-8000-000000000000', 'no-es-un-id']) {
      await expect(shopService.product(id)).rejects.toThrow(
        'Este regalo no existe o ya no está disponible.',
      )
    }
  })

  describe('límite por SKU', () => {
    let original: number

    afterAll(async () => {
      if (original === undefined) return
      await loginAsAdmin()
      await setMaxUnitsPerSku(original)
      authStorage.clear()
    })

    it('un cambio del ADMIN se refleja al volver a consultar la configuración', async () => {
      asVisitor()
      const before = (await shopService.settings()).maxUnitsPerSkuPerOrder

      await loginAsAdmin()
      original = await setMaxUnitsPerSku(before === 7 ? 6 : 7)
      asVisitor()

      expect(original).toBe(before)
      expect((await shopService.settings()).maxUnitsPerSkuPerOrder).toBe(before === 7 ? 6 : 7)
      expect((await shopService.settings()).shippingFreeIncluded).toBe(true)
    })
  })
})
