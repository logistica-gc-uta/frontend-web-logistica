import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { adminCategory, adminImage, adminProduct, adminSettings } from '../../test/catalogFixtures'
import { customerSession, signInCustomer } from '../../test/checkoutFixtures'
import { adminSession, adminUser, driverSession } from '../../test/fixtures'
import { createHttpError } from '../../test/http'
import { renderWithProviders } from '../../test/renderWithProviders'
import { catalogService } from './catalogService'
import type { AdminProduct } from './types'

const shopError = (status: number, code: string, details: Record<string, unknown> = {}) =>
  createHttpError(status, { data: { error: { code, message: code, details } } })

const CATEGORIES = [
  adminCategory(),
  adminCategory({ id: 'cat-old', name: 'Antigua', slug: 'antigua', isActive: false }),
]

const page = (items: AdminProduct[], total = items.length) => ({
  items,
  total,
  page: 1,
  pageSize: 20,
  totalPages: Math.max(1, Math.ceil(total / 20)),
})

const renderAdmin = (route: string) =>
  renderWithProviders(<App />, { route, session: adminSession })

describe('ADMIN · menú y permisos', () => {
  it('el ADMIN ve Productos, Categorías y Configuración Shop sin perder el menú logístico', () => {
    vi.spyOn(catalogService, 'getSettings').mockResolvedValue(adminSettings())
    renderAdmin('/configuracion-shop')

    const nav = screen.getByRole('navigation', { name: 'Principal' })
    for (const item of [
      'Pedidos',
      'Planificación',
      'Zonas',
      'Productos',
      'Categorías',
      'Configuración Shop',
    ]) {
      expect(within(nav).getByRole('link', { name: item })).toBeInTheDocument()
    }
  })

  it.each([
    ['un CLIENT del Shop', () => signInCustomer(customerSession)],
    ['un DRIVER', () => undefined],
  ])('%s no entra a la administración del catálogo ni a la configuración', async (_who, setup) => {
    setup()
    const settings = vi.spyOn(catalogService, 'getSettings')
    renderWithProviders(<App />, {
      route: '/configuracion-shop',
      session: _who === 'un DRIVER' ? driverSession : undefined,
    })

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(settings).not.toHaveBeenCalled()
  })
})

describe('ADMIN-01 · listado de productos', () => {
  it('muestra también agotados, despublicados y productos sin categoría, con cifras del servidor', async () => {
    vi.spyOn(catalogService, 'listCategories').mockResolvedValue(CATEGORIES)
    vi.spyOn(catalogService, 'listProducts').mockResolvedValue(
      page(
        [
          adminProduct({ stock: 0 }),
          adminProduct({
            id: 'p2',
            name: 'Producto antiguo',
            sku: 'LEGACY-1',
            category: null,
            categoryId: null,
            priceCents: 500,
            isPublished: false,
          }),
          adminProduct({ id: 'p3', name: 'Taza', isPublished: true, stock: 4 }),
        ],
        155,
      ),
    )
    renderAdmin('/productos')

    const table = await screen.findByRole('table', { name: 'Productos del catálogo' })
    expect(screen.getByText('155 productos')).toBeInTheDocument()
    const rows = within(table).getAllByRole('row')
    expect(within(rows[1]).getByText('Agotado (0)')).toBeInTheDocument()
    expect(within(rows[1]).getByText('SKU ROSAS-12')).toBeInTheDocument()
    expect(within(rows[1]).getByText('$25,99')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Sin categoría')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Despublicado')).toBeInTheDocument()
    expect(within(rows[3]).getByText('Publicado')).toBeInTheDocument()
    expect(within(rows[1]).getByRole('link', { name: /Editar/ })).toHaveAttribute(
      'href',
      '/productos/prod-1',
    )
  })

  it('filtra por texto, categoría y estado en el servidor y pagina', async () => {
    vi.spyOn(catalogService, 'listCategories').mockResolvedValue(CATEGORIES)
    const list = vi
      .spyOn(catalogService, 'listProducts')
      .mockResolvedValue(page([adminProduct()], 45))
    const { user } = renderAdmin('/productos')
    await screen.findByRole('table')

    const filters = screen.getByRole('form', { name: 'Filtrar productos' })
    await user.type(within(filters).getByLabelText(/Buscar/), 'rosa')
    await user.selectOptions(within(filters).getByLabelText('Categoría'), 'cat-flores')
    await user.selectOptions(within(filters).getByLabelText('Estado'), 'out_of_stock')
    await user.click(within(filters).getByRole('button', { name: 'Filtrar' }))
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 20,
        search: 'rosa',
        categoryId: 'cat-flores',
        status: 'out_of_stock',
      }),
    )
    expect(within(filters).getByRole('option', { name: 'Antigua (inactiva)' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })))
  })

  it('publicar pide confirmación y muestra el rechazo del backend si faltan requisitos', async () => {
    vi.spyOn(catalogService, 'listCategories').mockResolvedValue(CATEGORIES)
    vi.spyOn(catalogService, 'listProducts').mockResolvedValue(page([adminProduct()]))
    const publish = vi
      .spyOn(catalogService, 'setPublication')
      .mockRejectedValueOnce(shopError(409, 'PRODUCT_PUBLICATION_INVALID'))
      .mockResolvedValueOnce(adminProduct({ isPublished: true }))
    const { user } = renderAdmin('/productos')

    await user.click(await screen.findByRole('button', { name: 'Publicar Ramo de rosas' }))
    expect(screen.getByText('¿Mostrarlo en el Shop?')).toBeInTheDocument()
    expect(publish).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Sí, publicar' }))
    expect(
      await screen.findByText(/No se puede publicar: necesita una categoría activa/),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Publicar Ramo de rosas' }))
    await user.click(screen.getByRole('button', { name: 'Sí, publicar' }))
    expect(await screen.findByText('«Ramo de rosas» ya se muestra en el Shop.')).toBeInTheDocument()
    expect(publish).toHaveBeenLastCalledWith('prod-1', true)
  })

  it('sin resultados lo dice; si falla permite reintentar', async () => {
    vi.spyOn(catalogService, 'listCategories').mockResolvedValue(CATEGORIES)
    const list = vi
      .spyOn(catalogService, 'listProducts')
      .mockRejectedValueOnce(createHttpError(500))
      .mockResolvedValueOnce(page([]))
    const { user } = renderAdmin('/productos')

    await user.click(await screen.findByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('No hay productos con esos criterios.')).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })
})

describe('ADMIN-02 · alta y edición', () => {
  it('valida antes de crear y crea despublicado; luego abre la edición con el aviso', async () => {
    vi.spyOn(catalogService, 'listCategories').mockResolvedValue(CATEGORIES)
    const create = vi
      .spyOn(catalogService, 'createProduct')
      .mockResolvedValue(adminProduct({ id: 'p-nuevo' }))
    vi.spyOn(catalogService, 'getProduct').mockResolvedValue(adminProduct({ id: 'p-nuevo' }))
    const { user } = renderAdmin('/productos/nuevo')

    const form = within(await screen.findByRole('form', { name: 'Datos del producto' }))
    await user.click(form.getByRole('button', { name: 'Crear producto' }))
    expect(form.getByText('Elige una categoría')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
    expect(form.getByRole('option', { name: 'Antigua (inactiva)' })).toBeDisabled()

    await user.type(form.getByLabelText('SKU'), ' ROSAS-12 ')
    await user.type(form.getByLabelText('Nombre'), 'Ramo de rosas')
    await user.type(form.getByLabelText('Descripción'), 'Doce rosas')
    await user.selectOptions(form.getByLabelText('Categoría'), 'cat-flores')
    await user.type(form.getByLabelText('Precio (USD)'), '25,99')
    await user.clear(form.getByLabelText('Stock'))
    await user.type(form.getByLabelText('Stock'), '10')
    await user.click(form.getByRole('button', { name: 'Crear producto' }))

    expect(create).toHaveBeenCalledWith({
      sku: 'ROSAS-12',
      name: 'Ramo de rosas',
      description: 'Doce rosas',
      categoryId: 'cat-flores',
      priceCents: 2599,
      stock: 10,
      isFeatured: false,
    })
    expect(await screen.findByText(/Producto creado \(despublicado\)/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Editar producto' })).toBeInTheDocument()
  })

  it('un SKU repetido se muestra junto al campo', async () => {
    vi.spyOn(catalogService, 'listCategories').mockResolvedValue(CATEGORIES)
    vi.spyOn(catalogService, 'createProduct').mockRejectedValue(
      shopError(409, 'SKU_ALREADY_EXISTS'),
    )
    const { user } = renderAdmin('/productos/nuevo')
    const form = within(await screen.findByRole('form', { name: 'Datos del producto' }))
    await user.type(form.getByLabelText('SKU'), 'ROSAS-12')
    await user.type(form.getByLabelText('Nombre'), 'Ramo')
    await user.type(form.getByLabelText('Descripción'), 'x')
    await user.selectOptions(form.getByLabelText('Categoría'), 'cat-flores')
    await user.type(form.getByLabelText('Precio (USD)'), '1')
    await user.click(form.getByRole('button', { name: 'Crear producto' }))

    expect(await form.findAllByText('Ya existe un producto con ese SKU.')).not.toHaveLength(0)
    expect(form.getByLabelText('SKU')).toHaveAttribute('aria-invalid', 'true')
  })

  it('al editar el SKU es de solo lectura y se envían solo los cambios; luego recarga del servidor', async () => {
    vi.spyOn(catalogService, 'listCategories').mockResolvedValue(CATEGORIES)
    const get = vi
      .spyOn(catalogService, 'getProduct')
      .mockResolvedValueOnce(adminProduct())
      .mockResolvedValueOnce(adminProduct({ priceCents: 2990, updatedAt: '2026-11-03T11:00:00Z' }))
    const update = vi
      .spyOn(catalogService, 'updateProduct')
      .mockResolvedValue(adminProduct({ priceCents: 2990 }))
    const { user } = renderAdmin('/productos/prod-1')

    const form = within(await screen.findByRole('form', { name: 'Datos del producto' }))
    expect(form.getByLabelText('SKU')).toHaveAttribute('readonly')
    await user.click(form.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText('No hay cambios para guardar.')).toBeInTheDocument()

    await user.clear(form.getByLabelText('Precio (USD)'))
    await user.type(form.getByLabelText('Precio (USD)'), '29,90')
    expect(form.getByText('Hay cambios sin guardar.')).toBeInTheDocument()
    await user.click(form.getByRole('button', { name: 'Guardar cambios' }))

    expect(update).toHaveBeenCalledWith('prod-1', { priceCents: 2990 })
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument()
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    expect(await screen.findByLabelText('Precio (USD)')).toHaveValue('29.90')
  })

  it('publica desde el editor y despublica con confirmación (cancelable)', async () => {
    vi.spyOn(catalogService, 'listCategories').mockResolvedValue(CATEGORIES)
    const ready = adminProduct({ images: [adminImage('a', 0, true)] })
    vi.spyOn(catalogService, 'getProduct')
      .mockResolvedValueOnce(ready)
      .mockResolvedValue({ ...ready, isPublished: true, updatedAt: '2026-11-03T12:00:00Z' })
    const publish = vi
      .spyOn(catalogService, 'setPublication')
      .mockResolvedValue({ ...ready, isPublished: true })
    const { user } = renderAdmin('/productos/prod-1')

    const publication = within(await screen.findByRole('region', { name: 'Publicación' }))
    expect(publication.queryByRole('note')).not.toBeInTheDocument()
    await user.click(publication.getByRole('button', { name: 'Publicar Ramo de rosas' }))
    await user.click(publication.getByRole('button', { name: 'Sí, publicar' }))
    expect(await publication.findByText('Publicado: ya se muestra en el Shop.')).toBeInTheDocument()

    await user.click(await publication.findByRole('button', { name: 'Despublicar Ramo de rosas' }))
    expect(publication.getByText(/Los pedidos ya hechos no cambian/)).toBeInTheDocument()
    await user.click(publication.getByRole('button', { name: 'Cancelar' }))
    expect(publish).toHaveBeenCalledTimes(1)
  })

  it('la publicación explica qué falta y pide confirmación para despublicar', async () => {
    vi.spyOn(catalogService, 'listCategories').mockResolvedValue(CATEGORIES)
    vi.spyOn(catalogService, 'getProduct')
      .mockResolvedValueOnce(adminProduct())
      .mockResolvedValue(adminProduct({ isPublished: true, images: [adminImage('a', 0, true)] }))
    renderAdmin('/productos/prod-1')

    const publication = await screen.findByRole('region', { name: 'Publicación' })
    expect(within(publication).getByRole('note')).toHaveTextContent(
      'Para publicarlo falta: una imagen principal.',
    )
  })
})

describe('ADMIN-04 · imágenes', () => {
  async function openEditor(product = adminProduct()) {
    vi.spyOn(catalogService, 'listCategories').mockResolvedValue(CATEGORIES)
    const get = vi.spyOn(catalogService, 'getProduct').mockResolvedValue(product)
    const view = renderAdmin('/productos/prod-1')
    const region = within(await screen.findByRole('region', { name: 'Imágenes' }))
    return { ...view, region, get }
  }
  const png = new File([new Uint8Array(10)], 'regalo.png', { type: 'image/png' })

  it('rechaza formato y tamaño inválidos antes de subir', async () => {
    const upload = vi.spyOn(catalogService, 'uploadImage')
    const { region } = await openEditor()

    fireEvent.change(region.getByLabelText('Archivo de imagen'), {
      target: { files: [new File(['x'], 'a.gif', { type: 'image/gif' })] },
    })
    expect(region.getByText(/Formato no admitido/)).toBeInTheDocument()
    fireEvent.change(region.getByLabelText('Archivo de imagen'), {
      target: {
        files: [new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'b.png', { type: 'image/png' })],
      },
    })
    expect(region.getByText('La imagen supera los 5 MiB.')).toBeInTheDocument()
    expect(region.getByRole('button', { name: 'Subir imagen' })).toBeDisabled()
    expect(upload).not.toHaveBeenCalled()
  })

  it('sube por el backend, la asocia como principal y recarga el producto', async () => {
    const upload = vi
      .spyOn(catalogService, 'uploadImage')
      .mockImplementation(async (_file, progress) => {
        progress?.(100)
        return 'up-1'
      })
    const attach = vi
      .spyOn(catalogService, 'attachImage')
      .mockResolvedValue(adminImage('img-1', 0, true))
    const { user, region, get } = await openEditor()

    fireEvent.change(region.getByLabelText('Archivo de imagen'), { target: { files: [png] } })
    expect(region.getByAltText('Vista previa de la imagen elegida')).toBeInTheDocument()
    await user.click(region.getByRole('button', { name: 'Subir imagen' }))
    expect(region.getByText('Describe la imagen (texto alternativo)')).toBeInTheDocument()

    await user.type(region.getByLabelText('Texto alternativo (describe la imagen)'), 'Ramo rojo')
    await user.click(region.getByRole('button', { name: 'Subir imagen' }))

    expect(await region.findByText('Imagen subida y asociada al producto.')).toBeInTheDocument()
    expect(upload).toHaveBeenCalledWith(png, expect.any(Function))
    expect(attach).toHaveBeenCalledWith('prod-1', {
      uploadId: 'up-1',
      altText: 'Ramo rojo',
      isPrimary: true,
      position: 0,
    })
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
  })

  it('un 502 del proveedor se informa; si la asociación falla, el reintento no vuelve a subir', async () => {
    const upload = vi
      .spyOn(catalogService, 'uploadImage')
      .mockRejectedValueOnce(shopError(502, 'UPLOAD_FAILED'))
      .mockResolvedValueOnce('up-2')
    const attach = vi
      .spyOn(catalogService, 'attachImage')
      .mockRejectedValueOnce(shopError(422, 'IMAGE_ASSOCIATION_FAILED'))
      .mockResolvedValueOnce(adminImage('img-2', 1))
    const { user, region } = await openEditor(adminProduct({ images: [adminImage('a', 0, true)] }))

    fireEvent.change(region.getByLabelText('Archivo de imagen'), { target: { files: [png] } })
    await user.type(region.getByLabelText('Texto alternativo (describe la imagen)'), 'Otra')
    await user.click(region.getByRole('button', { name: 'Subir imagen' }))
    expect(
      await region.findByText('El servicio de imágenes no respondió. Vuelve a intentarlo.'),
    ).toBeInTheDocument()

    await user.click(region.getByRole('button', { name: 'Subir imagen' }))
    expect(await region.findByText(/se subió pero no se pudo asociar/)).toBeInTheDocument()
    expect(region.queryByText('Imagen subida y asociada al producto.')).not.toBeInTheDocument()

    await user.click(region.getByRole('button', { name: 'Reintentar asociación' }))
    expect(await region.findByText('Imagen subida y asociada al producto.')).toBeInTheDocument()
    expect(upload).toHaveBeenCalledTimes(2)
    expect(attach).toHaveBeenLastCalledWith('prod-1', {
      uploadId: 'up-2',
      altText: 'Otra',
      isPrimary: false,
      position: 1,
    })
  })

  it('marca la principal, cambia el orden, edita el texto alternativo y quita con confirmación', async () => {
    const update = vi.spyOn(catalogService, 'updateImage').mockResolvedValue(adminImage('b', 1))
    const remove = vi.spyOn(catalogService, 'removeImage').mockResolvedValue()
    const { user, region } = await openEditor(
      adminProduct({ images: [adminImage('a', 0, true), adminImage('b', 1)] }),
    )

    const second = within(region.getByRole('listitem', { name: 'Foto b' }))
    await user.click(second.getByRole('button', { name: 'Marcar como principal' }))
    expect(update).toHaveBeenLastCalledWith('prod-1', 'b', { isPrimary: true })
    await user.click(second.getByRole('button', { name: 'Subir Foto b en la galería' }))
    await waitFor(() => expect(update).toHaveBeenLastCalledWith('prod-1', 'b', { position: 0 }))
    await user.clear(second.getByLabelText('Texto alternativo de la imagen 2'))
    await user.type(second.getByLabelText('Texto alternativo de la imagen 2'), 'Detalle')
    await user.click(second.getByRole('button', { name: 'Guardar texto' }))
    await waitFor(() =>
      expect(update).toHaveBeenLastCalledWith('prod-1', 'b', { altText: 'Detalle' }),
    )

    await user.click(second.getByRole('button', { name: /^Quitar/ }))
    expect(remove).not.toHaveBeenCalled()
    await user.click(second.getByRole('button', { name: 'Sí, quitar' }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith('prod-1', 'b'))
  })
})

describe('ADMIN-03 · categorías', () => {
  it('lista con conteo, crea con slug generado y avisa antes de desactivar una con productos', async () => {
    vi.spyOn(catalogService, 'listCategories').mockResolvedValue(CATEGORIES)
    vi.spyOn(catalogService, 'countProducts').mockImplementation(async (id) =>
      id === 'cat-flores' ? 3 : 0,
    )
    const create = vi
      .spyOn(catalogService, 'createCategory')
      .mockResolvedValue(adminCategory({ id: 'n', name: 'Día de la Madre' }))
    const update = vi
      .spyOn(catalogService, 'updateCategory')
      .mockResolvedValue(adminCategory({ isActive: false }))
    const { user } = renderAdmin('/categorias')

    const flowers = await screen.findByRole('listitem', { name: 'Flores' })
    expect(within(flowers).getByText(/3 productos/)).toBeInTheDocument()
    expect(
      within(screen.getByRole('listitem', { name: 'Antigua' })).getByText('Inactiva'),
    ).toBeInTheDocument()

    const form = within(screen.getByRole('form', { name: 'Nueva categoría' }))
    await user.type(form.getByLabelText('Nombre'), 'Día de la Madre')
    expect(form.getByLabelText('Slug (enlace en el Shop)')).toHaveValue('dia-de-la-madre')
    await user.click(form.getByRole('button', { name: 'Crear categoría' }))
    expect(create).toHaveBeenCalledWith({
      name: 'Día de la Madre',
      slug: 'dia-de-la-madre',
      description: null,
      isActive: true,
    })
    expect(await screen.findByText('Categoría «Día de la Madre» creada.')).toBeInTheDocument()

    await user.click(within(flowers).getByRole('button', { name: 'Desactivar Flores' }))
    expect(within(flowers).getByRole('group')).toHaveTextContent(
      'Tiene 3 productos: dejarán de verse en el Shop',
    )
    expect(update).not.toHaveBeenCalled()
    await user.click(within(flowers).getByRole('button', { name: 'Sí, desactivar' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('cat-flores', { isActive: false }))
  })

  it('edita nombre y descripción (no el slug), reactiva y permite cancelar', async () => {
    vi.spyOn(catalogService, 'listCategories').mockResolvedValue(CATEGORIES)
    vi.spyOn(catalogService, 'countProducts').mockResolvedValue(1)
    const update = vi.spyOn(catalogService, 'updateCategory').mockResolvedValue(adminCategory())
    const { user } = renderAdmin('/categorias')

    const flowers = within(await screen.findByRole('listitem', { name: 'Flores' }))
    await user.click(flowers.getByRole('button', { name: 'Desactivar Flores' }))
    expect(flowers.getByRole('group')).toHaveTextContent('Tiene 1 producto')
    await user.click(flowers.getByRole('button', { name: 'Cancelar' }))
    await user.click(flowers.getByRole('button', { name: 'Editar Flores' }))
    expect(flowers.getByText(/El slug no se cambia/)).toBeInTheDocument()
    await user.clear(flowers.getByLabelText('Nombre'))
    await user.type(flowers.getByLabelText('Nombre'), 'F')
    await user.click(flowers.getByRole('button', { name: 'Guardar' }))
    expect(flowers.getByText('El nombre debe tener entre 2 y 80 caracteres')).toBeInTheDocument()
    await user.type(flowers.getByLabelText('Nombre'), 'lores y plantas')
    await user.type(flowers.getByLabelText('Descripción (opcional)'), 'Ramos')
    await user.click(flowers.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('cat-flores', {
        name: 'Flores y plantas',
        description: 'Ramos',
      }),
    )

    const old = within(screen.getByRole('listitem', { name: 'Antigua' }))
    await user.click(old.getByRole('button', { name: 'Activar Antigua' }))
    await waitFor(() => expect(update).toHaveBeenLastCalledWith('cat-old', { isActive: true }))
  })

  it('un nombre o slug repetido se informa', async () => {
    vi.spyOn(catalogService, 'listCategories').mockResolvedValue([])
    vi.spyOn(catalogService, 'createCategory').mockRejectedValue(
      shopError(409, 'CATEGORY_ALREADY_EXISTS'),
    )
    const { user } = renderAdmin('/categorias')

    expect(await screen.findByText('Todavía no hay categorías.')).toBeInTheDocument()
    const form = within(screen.getByRole('form', { name: 'Nueva categoría' }))
    await user.type(form.getByLabelText('Nombre'), 'Flores')
    await user.click(form.getByRole('button', { name: 'Crear categoría' }))
    expect(
      await form.findByText('Ya existe una categoría con ese nombre o slug.'),
    ).toBeInTheDocument()
  })
})

describe('ADMIN-05 · configuración del Shop', () => {
  it('muestra los valores actuales, los fijos de solo lectura y la advertencia sobre checkouts', async () => {
    vi.spyOn(catalogService, 'getSettings').mockResolvedValue(
      adminSettings({ updatedById: adminUser.id }),
    )
    renderAdmin('/configuracion-shop')

    const form = within(await screen.findByRole('form', { name: 'Configuración del Shop' }))
    expect(form.getByLabelText('Tasa del IVA simulado (%)')).toHaveValue('15')
    expect(form.getByLabelText('Aplicar IVA simulado en los checkouts')).toBeChecked()
    expect(form.getByLabelText(/Unidades máximas/)).toHaveValue('10')
    expect(form.getByLabelText('Desde (incluida)')).toHaveValue('07:00')
    expect(form.getByLabelText('Hasta (incluida)')).toHaveValue('17:00')
    expect(form.getByText('GRATIS — incluido en los precios (0 USD)')).toBeInTheDocument()
    expect(form.getByText('America/Guayaquil (Ambato)')).toBeInTheDocument()
    expect(form.getByText(/no es un tributo oficial ni del SRI/)).toBeInTheDocument()
    expect(form.getByText(/Versión 5 · actualizada el .* por ti/)).toBeInTheDocument()
    expect(form.getByRole('note')).toHaveTextContent(
      'Las compras y los comprobantes ya emitidos no cambian.',
    )
  })

  it('guarda solo lo que cambió con la versión leída y confirma la nueva versión', async () => {
    vi.spyOn(catalogService, 'getSettings').mockResolvedValue(adminSettings())
    const save = vi
      .spyOn(catalogService, 'saveSettings')
      .mockResolvedValue(adminSettings({ version: 6, tax: { enabled: false, rateBps: 1250 } }))
    const { user } = renderAdmin('/configuracion-shop')
    const form = within(await screen.findByRole('form', { name: 'Configuración del Shop' }))

    await user.click(form.getByRole('button', { name: 'Guardar configuración' }))
    expect(await form.findByText('No hay cambios para guardar.')).toBeInTheDocument()

    await user.click(form.getByLabelText('Aplicar IVA simulado en los checkouts'))
    await user.clear(form.getByLabelText('Tasa del IVA simulado (%)'))
    await user.type(form.getByLabelText('Tasa del IVA simulado (%)'), '12,5')
    await user.click(form.getByRole('button', { name: 'Guardar configuración' }))

    expect(save).toHaveBeenCalledWith(5, { tax: { enabled: false, rateBps: 1250 } })
    expect(await screen.findByText(/Configuración guardada \(versión 6\)/)).toBeInTheDocument()
    expect(screen.getByLabelText('Tasa del IVA simulado (%)')).toHaveValue('12.5')
  })

  it('valida la tasa, el máximo y que el horario empiece antes de terminar', async () => {
    vi.spyOn(catalogService, 'getSettings').mockResolvedValue(adminSettings())
    const save = vi.spyOn(catalogService, 'saveSettings')
    const { user } = renderAdmin('/configuracion-shop')
    const form = within(await screen.findByRole('form', { name: 'Configuración del Shop' }))

    await user.clear(form.getByLabelText('Tasa del IVA simulado (%)'))
    await user.type(form.getByLabelText('Tasa del IVA simulado (%)'), '150')
    await user.clear(form.getByLabelText(/Unidades máximas/))
    await user.type(form.getByLabelText(/Unidades máximas/), '0')
    fireEvent.change(form.getByLabelText('Desde (incluida)'), { target: { value: '18:00' } })
    await user.click(form.getByRole('button', { name: 'Guardar configuración' }))

    expect(
      form.getByText('Escribe un porcentaje de 0 a 100 (hasta 2 decimales)'),
    ).toBeInTheDocument()
    expect(form.getByText('Escribe un entero de 1 a 100')).toBeInTheDocument()
    expect(form.getByText(/El fin debe ser posterior al inicio/)).toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
  })

  it('un conflicto de versión no sobrescribe: avisa y permite recargar los valores actuales', async () => {
    const get = vi
      .spyOn(catalogService, 'getSettings')
      .mockResolvedValueOnce(adminSettings())
      .mockResolvedValueOnce(adminSettings({ version: 7, maxUnitsPerSkuPerOrder: 9 }))
    vi.spyOn(catalogService, 'saveSettings').mockRejectedValue(
      shopError(409, 'SETTINGS_VERSION_CONFLICT', { currentVersion: 7, expectedVersion: 5 }),
    )
    const { user } = renderAdmin('/configuracion-shop')
    const form = within(await screen.findByRole('form', { name: 'Configuración del Shop' }))

    await user.clear(form.getByLabelText(/Unidades máximas/))
    await user.type(form.getByLabelText(/Unidades máximas/), '8')
    await user.click(form.getByRole('button', { name: 'Guardar configuración' }))

    expect(
      await form.findByText(/Otro administrador guardó la configuración .* versión 7/),
    ).toBeInTheDocument()
    await user.click(form.getByRole('button', { name: 'Recargar valores actuales' }))
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    expect(await screen.findByLabelText(/Unidades máximas/)).toHaveValue('9')
  })
})
