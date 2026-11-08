import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { AppError } from '../../lib/errors/AppError'
import { createHttpError } from '../../test/http'
import { renderWithProviders } from '../../test/renderWithProviders'
import { productPage, shopCategory, shopProduct, shopSettings } from '../../test/shopFixtures'
import { cartStorage } from './cart/cartStorage'
import { shopService } from './shopService'
import type { ProductPage, ShopProduct, ShopSettings } from './types'

const ROSES = shopProduct()
const MUG = shopProduct({
  id: 'p-taza',
  name: 'Taza personalizada',
  priceCents: 1250,
  isFeatured: true,
  category: shopCategory({ id: 'cat-tazas', name: 'Tazas' }),
})

interface ApiMocks {
  categories?: ReturnType<typeof shopCategory>[]
  products?: ProductPage | Error
  product?: ShopProduct | Error
  settings?: ShopSettings | Error
}

function mockShop({
  categories = [shopCategory(), shopCategory({ id: 'cat-vacia', name: 'Vacía', productCount: 0 })],
  products = productPage([ROSES, MUG]),
  product = ROSES,
  settings = shopSettings(),
}: ApiMocks = {}) {
  const result = <T,>(value: T | Error) =>
    value instanceof Error ? Promise.reject(value) : Promise.resolve(value)
  return {
    categories: vi.spyOn(shopService, 'categories').mockImplementation(() => result(categories)),
    products: vi.spyOn(shopService, 'products').mockImplementation(() => result(products)),
    product: vi.spyOn(shopService, 'product').mockImplementation(() => result(product)),
    settings: vi.spyOn(shopService, 'settings').mockImplementation(() => result(settings)),
  }
}

const renderShop = (route: string) => renderWithProviders(<App />, { route })

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('Shop · cabecera', () => {
  it('es pública, sin accesos del panel ADMIN, y el buscador lleva al catálogo', async () => {
    const api = mockShop()
    const { user } = renderShop('/shop')

    const header = screen.getByRole('banner')
    expect(within(header).getByRole('link', { name: 'REGALÍA' })).toBeInTheDocument()
    expect(within(header).getByRole('link', { name: 'Carrito' })).toBeInTheDocument()
    expect(within(header).queryByText('0')).not.toBeInTheDocument()
    for (const admin of ['Pedidos', 'Planificación', 'Urgencias', 'Cerrar sesión']) {
      expect(screen.queryByRole('link', { name: admin })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: admin })).not.toBeInTheDocument()
    }

    await user.type(within(header).getByRole('searchbox'), '  rosas  ')
    await user.click(within(header).getByRole('button', { name: 'Buscar' }))

    expect(
      await screen.findByRole('heading', { name: /Resultados para «rosas»/ }),
    ).toBeInTheDocument()
    expect(api.products).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'rosas' }))
  })
})

describe('Shop · inicio', () => {
  it.each([5, 8])('ocasiones: conserva las %i categorías reales y sus enlaces en la tira', async (count) => {
    const categories = Array.from({ length: count }, (_, index) => shopCategory({
      id: `cat-${index}`, name: `Ocasión ${index + 1}`, productCount: count - index,
    }))
    mockShop({ categories: [...categories, shopCategory({ name: 'Vacía', productCount: 0 })] })
    renderShop('/shop')
    const section = screen.getByRole('region', { name: 'Cada ocasión, un detalle.' })
    await waitFor(() => expect(section.querySelectorAll('.occasion-grid a')).toHaveLength(count))
    for (const category of categories) {
      expect(within(section).getByRole('link', { name: category.name })).toHaveAttribute(
        'href', `/shop/catalogo?categoria=${category.id}`,
      )
    }
    expect(within(section).queryByText('Vacía')).not.toBeInTheDocument()
    expect(section.closest('.shop-home')).toBeInTheDocument()
  })

  it('contenedores: eleva fotos reales con foco y selecciona en sitio sin navegar ni desplazar', async () => {
    const api = mockShop()
    const { user } = renderShop('/shop')
    const card = await screen.findByRole('button', { name: /Destacar Ramo de rosas/ })
    expect(within(card).getByRole('img')).toHaveAttribute('src', ROSES.primaryImageUrl)
    card.focus()
    expect(card).toHaveFocus()
    const scroll = vi.spyOn(window, 'scrollTo')
    await user.click(card)
    expect(card).toHaveAttribute('aria-pressed', 'true')
    expect(scroll).not.toHaveBeenCalled()
    expect(api.product).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hay regalos que lo dicen todo.')
    await user.click(screen.getByRole('button', { name: /Destacar Taza personalizada/ }))
    expect(card).toHaveAttribute('aria-pressed', 'false')
  })

  it('contenedores: limita el collage a tres fotos reales y retira imágenes fallidas sin dejar un hero vacío', async () => {
    mockShop({ products: productPage([
      ROSES, MUG,
      shopProduct({ id: 'p-3', name: 'Tercero' }),
      shopProduct({ id: 'p-4', name: 'Cuarto' }),
    ]) })
    renderShop('/shop')
    const collage = await screen.findByRole('group', { name: 'Regalos de la tienda' })
    expect(within(collage).getAllByRole('button')).toHaveLength(3)
    fireEvent.error(within(screen.getByRole('button', { name: 'Destacar Ramo de rosas' })).getByRole('img'))
    expect(screen.queryByRole('button', { name: 'Destacar Ramo de rosas' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Destacar Cuarto' })).toBeInTheDocument()
    for (const button of within(collage).getAllByRole('button')) {
      fireEvent.error(within(button).getByRole('img'))
    }
    expect(screen.queryByRole('group', { name: 'Regalos de la tienda' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver regalos' })).toBeInTheDocument()
  })

  it('muestra el llamado al catálogo, solo categorías con regalos y los destacados', async () => {
    mockShop()
    const { user } = renderShop('/shop')

    const flowerLinks = await screen.findAllByRole('link', { name: /Flores/ })
    expect(flowerLinks.length).toBeGreaterThan(0)
    for (const link of flowerLinks) {
      expect(link).toHaveAttribute('href', '/shop/catalogo?categoria=cat-flores')
    }
    expect(screen.queryByText('Vacía')).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Destacados' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Taza personalizada' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Ramo de rosas' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Ver regalos' }))
    expect(await screen.findByRole('heading', { name: 'Catálogo de regalos' })).toBeInTheDocument()
  })

  it('sin destacados muestra los regalos disponibles; sin datos lo dice sin inventar nada', async () => {
    mockShop({ products: productPage([ROSES]) })
    const first = renderShop('/shop')
    expect(await screen.findByRole('heading', { name: 'Regalos disponibles' })).toBeInTheDocument()
    first.unmount()

    vi.restoreAllMocks()
    mockShop({ categories: [], products: productPage([]) })
    renderShop('/shop')
    expect(
      await screen.findByText('Todavía no hay categorías con regalos publicados.'),
    ).toBeInTheDocument()
    expect(await screen.findByText('Todavía no hay regalos publicados.')).toBeInTheDocument()
  })

  it('si la API falla lo dice y permite reintentar', async () => {
    const api = mockShop({ products: createHttpError(500) })
    const { user } = renderShop('/shop')

    expect(await screen.findByText('No se pudieron cargar los regalos')).toBeInTheDocument()
    api.products.mockResolvedValue(productPage([MUG]))
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByRole('article', { name: 'Taza personalizada' })).toBeInTheDocument()
  })
})

describe('Shop · tarjeta de regalo', () => {
  it('muestra precio desde centavos, categoría, disponibilidad, envío y enlace al detalle', async () => {
    mockShop({ products: productPage([shopProduct({ isAvailable: false, stock: 0 })]) })
    renderShop('/shop/catalogo')

    const card = await screen.findByRole('article', { name: 'Ramo de rosas' })
    expect(within(card).getByText(/25,99/)).toBeInTheDocument()
    expect(within(card).getByText('Flores')).toBeInTheDocument()
    expect(within(card).getByText('Agotado')).toBeInTheDocument()
    expect(within(card).getByText('Envío gratis — incluido en el precio')).toBeInTheDocument()
    expect(within(card).getByRole('img', { name: 'Ramo de rosas rojas' })).toBeInTheDocument()
    expect(
      within(card).getByRole('link', { name: 'Ramo de rosas' }),
    ).toHaveAttribute('href', '/shop/productos/p-rosas')
    const link = within(card).getByRole('link', { name: 'Ramo de rosas' })
    expect(link).toContainElement(within(card).getByRole('img'))
    expect(link).toContainElement(within(card).getByRole('heading'))
    expect(within(card).queryByText('Ver detalle')).not.toBeInTheDocument()
    expect(within(link).queryByRole('button')).not.toBeInTheDocument()
  })

  it('encuadre: si la imagen falla o no existe muestra un reemplazo con texto alternativo', async () => {
    mockShop({
      products: productPage([
        ROSES,
        shopProduct({ id: 'p-sin', name: 'Sin foto', primaryImageUrl: null, images: [] }),
      ]),
    })
    renderShop('/shop/catalogo')

    const card = await screen.findByRole('article', { name: 'Ramo de rosas' })
    fireEvent.error(within(card).getByRole('img', { name: 'Ramo de rosas rojas' }))

    expect(within(card).getByText('Imagen no disponible')).toBeInTheDocument()
    expect(within(card).getByRole('img').parentElement).toHaveClass('product-figure')
    expect(within(card).getByRole('img', { name: 'Ramo de rosas rojas' })).toBeInTheDocument()
    const withoutImage = screen.getByRole('article', { name: 'Sin foto' })
    expect(within(withoutImage).getByRole('img', { name: 'Sin foto' })).toBeInTheDocument()
  })
})

describe('Shop · catálogo', () => {
  it('toma búsqueda, filtros, orden y página de la URL', async () => {
    const api = mockShop()
    renderShop(
      '/shop/catalogo?q=taza&categoria=cat-tazas&min=5&max=19,99&disponibles=1&orden=price_asc&pagina=2',
    )

    expect(
      await screen.findByRole('heading', { name: /Resultados para «taza»/ }),
    ).toBeInTheDocument()
    expect(api.products).toHaveBeenLastCalledWith({
      page: 2,
      pageSize: 12,
      sort: 'price_asc',
      search: 'taza',
      categoryId: 'cat-tazas',
      minPriceCents: 500,
      maxPriceCents: 1999,
      inStock: true,
    })
    const filters = screen.getByRole('form', { name: 'Filtrar regalos' })
    expect(within(filters).getByLabelText('Precio mínimo (USD)')).toHaveValue('5')
    expect(within(filters).getByLabelText('Solo disponibles')).toBeChecked()
  })

  it('combina filtros, los aplica al enviar y vuelve a la primera página', async () => {
    const api = mockShop()
    const { user } = renderShop('/shop/catalogo?pagina=3')
    await screen.findByRole('article', { name: 'Ramo de rosas' })
    const filters = screen.getByRole('form', { name: 'Filtrar regalos' })

    await user.type(within(filters).getByLabelText('Buscar por nombre o descripción'), 'rosas')
    await waitFor(() =>
      expect(within(filters).getByRole('option', { name: 'Flores' })).toBeInTheDocument(),
    )
    await user.selectOptions(within(filters).getByLabelText('Categoría'), 'cat-flores')
    await user.type(within(filters).getByLabelText('Precio mínimo (USD)'), '10')
    await user.type(within(filters).getByLabelText('Precio máximo (USD)'), '30,5')
    await user.click(within(filters).getByLabelText('Solo disponibles'))
    // Escribir no consulta: solo al aplicar.
    expect(api.products).toHaveBeenCalledTimes(1)
    await user.click(within(filters).getByRole('button', { name: 'Aplicar filtros' }))

    await waitFor(() =>
      expect(api.products).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 12,
        sort: 'featured',
        search: 'rosas',
        categoryId: 'cat-flores',
        minPriceCents: 1000,
        maxPriceCents: 3050,
        inStock: true,
      }),
    )
  })

  it('no aplica precios inválidos ni un mínimo mayor que el máximo', async () => {
    const api = mockShop()
    const { user } = renderShop('/shop/catalogo')
    await screen.findByRole('article', { name: 'Ramo de rosas' })
    const filters = screen.getByRole('form', { name: 'Filtrar regalos' })

    await user.type(within(filters).getByLabelText('Precio mínimo (USD)'), 'diez')
    await user.click(within(filters).getByRole('button', { name: 'Aplicar filtros' }))
    expect(within(filters).getByText(/Escribe un monto válido/)).toBeInTheDocument()

    await user.clear(within(filters).getByLabelText('Precio mínimo (USD)'))
    await user.type(within(filters).getByLabelText('Precio mínimo (USD)'), '40')
    await user.type(within(filters).getByLabelText('Precio máximo (USD)'), '20')
    await user.click(within(filters).getByRole('button', { name: 'Aplicar filtros' }))

    expect(
      within(filters).getByText('El precio máximo debe ser mayor o igual al mínimo'),
    ).toBeInTheDocument()
    expect(api.products).toHaveBeenCalledTimes(1)
  })

  it('cambiar el orden vuelve a la primera página; paginar conserva los criterios', async () => {
    const api = mockShop({ products: productPage([ROSES, MUG], { total: 30, totalPages: 3 }) })
    const { user } = renderShop('/shop/catalogo?q=taza&pagina=2')
    await screen.findByRole('article', { name: 'Ramo de rosas' })

    await user.selectOptions(screen.getByLabelText('Ordenar por'), 'price_desc')
    await waitFor(() =>
      expect(api.products).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, sort: 'price_desc', search: 'taza' }),
      ),
    )

    await user.click(await screen.findByRole('button', { name: 'Siguiente' }))
    await waitFor(() =>
      expect(api.products).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, sort: 'price_desc', search: 'taza' }),
      ),
    )
    expect(screen.getByText(/Página 2 de 3/)).toBeInTheDocument()
  })

  it('sin coincidencias lo dice y permite quitar los filtros y la búsqueda', async () => {
    const api = mockShop({ products: productPage([]) })
    const { user } = renderShop('/shop/catalogo?q=unicornio&min=5')

    expect(
      await screen.findByText('No encontramos regalos con esos criterios.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Quitar búsqueda' }))
    await waitFor(() =>
      expect(api.products).toHaveBeenLastCalledWith(
        expect.not.objectContaining({ search: expect.anything() }),
      ),
    )
    expect(api.products).toHaveBeenLastCalledWith(expect.objectContaining({ minPriceCents: 500 }))

    await user.click(
      within(screen.getByRole('region', { name: /Todos los regalos/ })).getByRole('button', {
        name: 'Quitar filtros',
      }),
    )
    await waitFor(() =>
      expect(api.products).toHaveBeenLastCalledWith({ page: 1, pageSize: 12, sort: 'featured' }),
    )
  })

  it('una página que ya no existe ofrece volver a la primera', async () => {
    const api = mockShop({ products: productPage([], { total: 5, page: 9 }) })
    const { user } = renderShop('/shop/catalogo?pagina=9')

    await user.click(await screen.findByRole('button', { name: 'Ir a la primera página' }))
    await waitFor(() =>
      expect(api.products).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 })),
    )
  })

  it('si falla la carga permite reintentar', async () => {
    const api = mockShop({ products: createHttpError(503) })
    const { user } = renderShop('/shop/catalogo')

    expect(await screen.findByText('No se pudieron cargar los regalos')).toBeInTheDocument()
    api.products.mockResolvedValue(productPage([ROSES]))
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('article', { name: 'Ramo de rosas' })).toBeInTheDocument()
  })

  it('al volver desde el detalle conserva búsqueda, filtros, orden y página', async () => {
    mockShop()
    const { user } = renderShop('/shop/catalogo?q=rosa&orden=price_asc&pagina=2')

    await user.click(await screen.findByRole('link', { name: 'Ramo de rosas' }))
    await screen.findByRole('heading', { name: 'Ramo de rosas', level: 1 })
    const breadcrumb = screen.getByRole('navigation', { name: 'Ruta de navegación' })
    expect(within(breadcrumb).getByRole('link', { name: 'Catálogo' })).toHaveAttribute(
      'href',
      '/shop/catalogo?q=rosa&orden=price_asc&pagina=2',
    )
  })
})

describe('Shop · detalle', () => {
  it('muestra categoría, precio, envío, stock y la descripción como texto (sin ejecutar HTML)', async () => {
    mockShop({
      product: shopProduct({ description: '<img src=x onerror="alert(1)">Rosas frescas' }),
    })
    renderShop('/shop/productos/p-rosas')

    const detail = await screen.findByRole('article', { name: 'Ramo de rosas' })
    expect(within(detail).getByRole('link', { name: 'Flores' })).toHaveAttribute(
      'href',
      '/shop/catalogo?categoria=cat-flores',
    )
    expect(within(detail).getByText(/25,99/)).toBeInTheDocument()
    expect(within(detail).getByText('Disponible · 20 en stock')).toBeInTheDocument()
    expect(within(detail).getByText('Envío gratis — incluido en el precio')).toBeInTheDocument()
    expect(
      within(detail).getByText('<img src=x onerror="alert(1)">Rosas frescas'),
    ).toBeInTheDocument()
    expect(detail.querySelector('img[src="x"]')).toBeNull()
  })

  it('encuadre: permite elegir entre las imágenes de la galería acotada', async () => {
    mockShop({
      product: shopProduct({
        images: [
          {
            id: 'a',
            secureUrl: 'https://x/a.jpg',
            altText: 'Vista frontal',
            position: 0,
            isPrimary: true,
          },
          {
            id: 'b',
            secureUrl: 'https://x/b.jpg',
            altText: 'Vista lateral',
            position: 1,
            isPrimary: false,
          },
        ],
      }),
    })
    const { user } = renderShop('/shop/productos/p-rosas')

    const mainImage = await screen.findByRole('img', { name: 'Vista frontal' })
    expect(mainImage.closest('.shop-page')).toHaveClass('product-detail-page')
    expect(mainImage.parentElement).toHaveClass('stage')
    await user.click(screen.getByRole('button', { name: 'Ver imagen 2 de 2' }))

    expect(screen.getByRole('img', { name: 'Vista lateral' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver imagen 2 de 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.error(screen.getByRole('img', { name: 'Vista lateral' }))
    expect(screen.getByRole('img', { name: 'Vista lateral' }).parentElement).toHaveClass('stage')
    expect(screen.getByText('Imagen no disponible')).toBeInTheDocument()
  })

  it('añade al carrito, confirma y actualiza el contador de la cabecera', async () => {
    mockShop()
    const { user } = renderShop('/shop/productos/p-rosas')

    await screen.findByText('Máximo 10 unidades de este regalo por pedido.')
    await user.click(screen.getByRole('button', { name: 'Agregar una unidad' }))
    await user.click(screen.getByRole('button', { name: 'Añadir al carrito' }))

    expect(screen.getByRole('status')).toHaveTextContent('Se añadieron 2 unidades al carrito.')
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Carrito: 2 unidades' })).toBeInTheDocument()
    expect(within(screen.getByRole('banner')).getByText('2')).toBeInTheDocument()
    expect(cartStorage.load()).toEqual([{ productId: 'p-rosas', quantity: 2 }])
    expect(screen.getByText(/ya tienes 2 en el carrito/)).toBeInTheDocument()
  })

  it('el máximo es el límite configurable por SKU (no un 10 fijo) y descuenta lo que ya está en el carrito', async () => {
    cartStorage.save([{ productId: 'p-rosas', quantity: 2 }])
    mockShop({ settings: shopSettings({ maxUnitsPerSkuPerOrder: 3 }) })
    const { user } = renderShop('/shop/productos/p-rosas')

    await screen.findByText(/Máximo 3 unidades de este regalo por pedido/)
    const input = screen.getByLabelText('Cantidad', { selector: 'input' })
    expect(input).toHaveAttribute('max', '1')
    expect(screen.getByRole('button', { name: 'Agregar una unidad' })).toBeDisabled()

    await user.clear(input)
    await user.type(input, '5')
    await user.click(screen.getByRole('button', { name: 'Añadir al carrito' }))
    expect(screen.getByText('Puedes añadir como máximo 1')).toBeInTheDocument()

    await user.clear(input)
    await user.type(input, '1')
    await user.click(screen.getByRole('button', { name: 'Añadir al carrito' }))
    expect(
      screen.getByText('Ya tienes en el carrito el máximo de 3 unidades por pedido.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Añadir al carrito' })).toBeDisabled()
  })

  it('con poco stock el máximo es el stock disponible', async () => {
    mockShop({ product: shopProduct({ stock: 2 }) })
    renderShop('/shop/productos/p-rosas')

    await screen.findByText(/Máximo 10 unidades/)
    expect(screen.getByLabelText('Cantidad', { selector: 'input' })).toHaveAttribute('max', '2')
  })

  it('rechaza cantidades no enteras', async () => {
    mockShop()
    const { user } = renderShop('/shop/productos/p-rosas')
    await screen.findByText(/Máximo 10 unidades/)
    const input = screen.getByLabelText('Cantidad', { selector: 'input' })

    fireEvent.change(input, { target: { value: '1.5' } })
    await user.click(screen.getByRole('button', { name: 'Añadir al carrito' }))

    expect(screen.getByText('Indica una cantidad entera desde 1')).toBeInTheDocument()
    expect(cartStorage.load()).toEqual([])
  })

  it('un regalo agotado no se puede añadir y explica por qué', async () => {
    mockShop({ product: shopProduct({ stock: 0, isAvailable: false }) })
    renderShop('/shop/productos/p-rosas')

    expect(await screen.findByText('Agotado')).toBeInTheDocument()
    expect(
      screen.getByText('Este regalo está agotado: no se puede añadir al carrito.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Añadir al carrito' })).toBeDisabled()
  })

  it('sin el límite vigente no deja añadir y permite reintentar', async () => {
    const api = mockShop({ settings: createHttpError(500) })
    const { user } = renderShop('/shop/productos/p-rosas')

    expect(await screen.findByText(/No se pudo consultar el límite por pedido/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Añadir al carrito' })).toBeDisabled()

    api.settings.mockResolvedValue(shopSettings({ maxUnitsPerSkuPerOrder: 4 }))
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText(/Máximo 4 unidades/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Añadir al carrito' })).toBeEnabled()
  })

  it('un regalo inexistente o despublicado se informa con un enlace de regreso', async () => {
    const notFound = new AppError('Este regalo no existe o ya no está disponible.')
    mockShop({ product: notFound })
    renderShop('/shop/productos/no-existe')

    expect(
      await screen.findByText('Este regalo no existe o ya no está disponible.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver al catálogo' })).toHaveAttribute(
      'href',
      '/shop/catalogo',
    )
  })
})
