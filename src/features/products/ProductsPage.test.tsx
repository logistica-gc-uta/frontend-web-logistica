import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { paths } from '../../app/paths'
import { adminSession, products } from '../../test/fixtures'
import { createHttpError } from '../../test/http'
import { renderWithProviders } from '../../test/renderWithProviders'
import { productsService } from './productsService'
import type { Product } from './types'

const newProduct: Product = {
  id: 'product-3',
  name: 'Teclado Mecánico RGB',
  description: null,
  price: 60,
  stock: 30,
  createdAt: '2026-10-09T12:00:00Z',
}

const renderProductsPage = () =>
  renderWithProviders(<App />, { route: paths.products, session: adminSession })

const findTable = () => screen.findByRole('table', { name: 'Productos disponibles' })
const getForm = () => screen.getByRole('form', { name: 'Nuevo producto' })
const field = (label: string) => within(getForm()).getByLabelText(label)
const submitButton = () => within(getForm()).getByRole('button', { name: 'Crear producto' })

describe('ProductsPage', () => {
  it('lista los productos con precio formateado y descripción opcional', async () => {
    vi.spyOn(productsService, 'list').mockResolvedValue(products)
    renderProductsPage()

    expect(screen.getByRole('status')).toHaveTextContent('Cargando productos...')
    const rows = within(await findTable()).getAllByRole('row')
    expect(rows).toHaveLength(products.length + 1)
    expect(within(rows[1]).getByText('Laptop HP Pavilion 15')).toBeInTheDocument()
    expect(within(rows[1]).getByText(/750,00/)).toBeInTheDocument()
    expect(within(rows[2]).getByText('—')).toBeInTheDocument()
  })

  it('indica cuando no hay productos con stock', async () => {
    vi.spyOn(productsService, 'list').mockResolvedValue([])
    renderProductsPage()

    expect(await screen.findByText('No hay productos con stock disponible')).toBeInTheDocument()
  })

  it('muestra un error si no se pueden cargar los productos', async () => {
    vi.spyOn(productsService, 'list').mockRejectedValue(createHttpError(500))
    renderProductsPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudieron cargar los productos',
    )
  })

  it('valida los campos sin llamar al backend', async () => {
    vi.spyOn(productsService, 'list').mockResolvedValue(products)
    const create = vi.spyOn(productsService, 'create')
    const { user } = renderProductsPage()

    await user.type(field('Precio (USD)'), '0')
    await user.type(field('Stock'), '-3')
    await user.click(submitButton())

    expect(screen.getByText('El nombre es obligatorio')).toBeInTheDocument()
    expect(screen.getByText('El precio debe ser mayor a 0')).toBeInTheDocument()
    expect(
      screen.getByText('El stock debe ser un número entero mayor o igual a 0'),
    ).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('crea un producto, muestra confirmación, limpia el formulario y actualiza la lista', async () => {
    vi.spyOn(productsService, 'list')
      .mockResolvedValueOnce(products)
      .mockResolvedValueOnce([...products, newProduct])
    const create = vi.spyOn(productsService, 'create').mockResolvedValue(newProduct)
    const { user } = renderProductsPage()
    await findTable()

    await user.type(field('Nombre'), 'Teclado Mecánico RGB')
    await user.type(field('Precio (USD)'), '60')
    await user.type(field('Stock'), '30')
    await user.click(submitButton())

    expect(create).toHaveBeenCalledWith({ name: 'Teclado Mecánico RGB', price: 60, stock: 30 })
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Producto "Teclado Mecánico RGB" creado correctamente',
    )
    expect(await within(await findTable()).findByText('Teclado Mecánico RGB')).toBeInTheDocument()
    expect(field('Nombre')).toHaveValue('')
  })

  it('muestra los errores de validación del backend', async () => {
    vi.spyOn(productsService, 'list').mockResolvedValue(products)
    vi.spyOn(productsService, 'create').mockRejectedValue(
      createHttpError(400, { data: { message: ['El precio debe ser un número válido'] } }),
    )
    const { user } = renderProductsPage()
    await findTable()

    await user.type(field('Nombre'), 'Producto')
    await user.type(field('Precio (USD)'), '10')
    await user.type(field('Stock'), '1')
    await user.click(submitButton())

    expect(await within(getForm()).findByRole('alert')).toHaveTextContent(
      'El precio debe ser un número válido',
    )
  })
})
