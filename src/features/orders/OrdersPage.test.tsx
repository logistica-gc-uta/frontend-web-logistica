import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { paths } from '../../app/paths'
import { adminSession, createdGuestOrder, orders, products, zones } from '../../test/fixtures'
import { createHttpError } from '../../test/http'
import { renderWithProviders } from '../../test/renderWithProviders'
import { productsService } from '../products/productsService'
import { zonesService } from '../zones/zonesService'
import { ordersService } from './ordersService'
import type { OrdersPage, OrdersQuery } from './types'

/** El mapa real no se dibuja en jsdom (se prueba aparte): aquí se simula con botones. */
vi.mock('../../components/map/LocationPicker', () => ({
  LocationPicker: ({
    value,
    isConfirmed,
    onChange,
    onConfirm,
    error,
  }: {
    value: unknown
    isConfirmed: boolean
    onChange: (point: { lat: number; lng: number }) => void
    onConfirm: () => void
    error?: string
  }) => (
    <div>
      <button type="button" onClick={() => onChange({ lat: -1.25, lng: -78.63 })}>
        Colocar marcador
      </button>
      {value !== null && !isConfirmed && (
        <button type="button" onClick={onConfirm}>
          Confirmar ubicación
        </button>
      )}
      {isConfirmed && <span>Ubicación confirmada</span>}
      {error && <p>{error}</p>}
    </div>
  ),
}))

const pageOf =
  (items = orders, total = items.length) =>
  (query: OrdersQuery): Promise<OrdersPage> =>
    Promise.resolve({ items, total, page: query.page, pageSize: query.pageSize })

const mockApi = (list: (query: OrdersQuery) => Promise<OrdersPage> = pageOf()) => {
  const zonesList = vi.spyOn(zonesService, 'list').mockResolvedValue(zones)
  const productsList = vi.spyOn(productsService, 'list').mockResolvedValue(products)
  const ordersList = vi.spyOn(ordersService, 'list').mockImplementation(list)
  return { zonesList, productsList, ordersList }
}

const renderOrdersPage = () =>
  renderWithProviders(<App />, { route: paths.orders, session: adminSession })

type User = ReturnType<typeof renderOrdersPage>['user']

const findTable = () => screen.findByRole('table', { name: 'Pedidos registrados' })
const getForm = () => within(screen.getByRole('form', { name: 'Nuevo pedido' }))
const getFilters = () => within(screen.getByRole('form', { name: 'Filtros de pedidos' }))

const fillValidForm = async (user: User) => {
  const form = getForm()
  await user.type(form.getByLabelText('Nombre del destinatario'), 'María Pérez')
  await user.type(form.getByLabelText('Teléfono de contacto'), '0991234567')
  await user.selectOptions(form.getByLabelText('Zona'), 'zone-1')
  await user.type(form.getByLabelText('Dirección de entrega'), 'Av. Los Chasquis')
  fireEvent.change(form.getByLabelText('Fecha y hora de entrega (hora de Guayaquil)'), {
    target: { value: '2099-01-15T10:30' },
  })
  await user.selectOptions(form.getByLabelText('Producto 1'), 'product-1')
  fireEvent.change(form.getByLabelText('Cantidad 1'), { target: { value: '2' } })
  await user.click(form.getByRole('button', { name: 'Colocar marcador' }))
  await user.click(form.getByRole('button', { name: 'Confirmar ubicación' }))
}

const submit = (user: User) =>
  user.click(getForm().getByRole('button', { name: 'Registrar pedido' }))

describe('OrdersPage · listado', () => {
  it('lista los pedidos persistidos con destinatario, estado, total y aptitud para planificar', async () => {
    mockApi()
    renderOrdersPage()

    expect(screen.getAllByRole('status')[0]).toHaveTextContent(/Cargando/)
    const rows = within(await findTable()).getAllByRole('row')

    const [, guestRow, clientRow] = rows
    expect(within(guestRow).getByText('María Pérez')).toBeInTheDocument()
    expect(within(guestRow).getByText(/14\/02\/2030.*10:00/)).toBeInTheDocument()
    expect(
      within(guestRow).getByText('1× Laptop HP Pavilion 15, 2× Mouse Inalámbrico Logitech'),
    ).toBeInTheDocument()
    expect(within(guestRow).getByText('Pendiente')).toBeInTheDocument()
    expect(within(guestRow).getByText(/801,00/)).toBeInTheDocument()
    expect(within(guestRow).getByText('Apto')).toBeInTheDocument()

    expect(within(clientRow).getByText('Ana Cliente')).toBeInTheDocument()
    expect(within(clientRow).getByText('Asignado a ruta')).toBeInTheDocument()
    expect(within(clientRow).getByText('No apto')).toBeInTheDocument()
    expect(
      within(clientRow).getByText('falta confirmar la ubicación de entrega'),
    ).toBeInTheDocument()
  })

  it('indica cuando no hay pedidos para los filtros elegidos', async () => {
    mockApi(pageOf([]))
    renderOrdersPage()

    expect(
      await screen.findByText('No hay pedidos para los filtros seleccionados'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Paginación' })).not.toBeInTheDocument()
  })

  it('muestra el error del backend al listar y permite reintentar', async () => {
    const { ordersList } = mockApi()
    ordersList.mockRejectedValueOnce(createHttpError(500))
    const { user } = renderOrdersPage()

    expect(await screen.findByText('No se pudieron cargar los pedidos')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await findTable()).toBeInTheDocument()
  })

  it('pagina el listado pidiendo cada página al backend', async () => {
    const { ordersList } = mockApi(pageOf(orders, 25))
    const { user } = renderOrdersPage()
    await findTable()
    expect(screen.getByText('Página 1 de 3 · 25 registros')).toBeInTheDocument()
    expect(ordersList).toHaveBeenLastCalledWith({ page: 1, pageSize: 10 })

    await user.click(screen.getByRole('button', { name: 'Siguiente' }))

    expect(await screen.findByText('Página 2 de 3 · 25 registros')).toBeInTheDocument()
    expect(ordersList).toHaveBeenLastCalledWith({ page: 2, pageSize: 10 })
  })

  it('aplica los filtros de fecha, zona y estado, y vuelve a la primera página', async () => {
    const { ordersList } = mockApi(pageOf(orders, 25))
    const { user } = renderOrdersPage()
    await findTable()
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await screen.findByText('Página 2 de 3 · 25 registros')

    await user.selectOptions(getFilters().getByLabelText('Zona'), 'zone-1')
    await waitFor(() =>
      expect(ordersList).toHaveBeenLastCalledWith({ page: 1, pageSize: 10, zoneId: 'zone-1' }),
    )

    fireEvent.change(getFilters().getByLabelText('Fecha de entrega'), {
      target: { value: '2030-02-14' },
    })
    await user.selectOptions(getFilters().getByLabelText('Estado'), 'PENDING')

    await waitFor(() =>
      expect(ordersList).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 10,
        date: '2030-02-14',
        zoneId: 'zone-1',
        status: 'PENDING',
      }),
    )

    await user.click(getFilters().getByRole('button', { name: 'Limpiar filtros' }))
    await waitFor(() => expect(ordersList).toHaveBeenLastCalledWith({ page: 1, pageSize: 10 }))
  })
})

describe('OrdersPage · formulario', () => {
  it('solo ofrece las zonas que tienen depósito configurado', async () => {
    mockApi()
    renderOrdersPage()
    await findTable()

    const options = within(getForm().getByLabelText('Zona')).getAllByRole('option')

    expect(options.map((option) => option.textContent)).toEqual([
      'Selecciona una zona',
      'FIC-02 · Ficoa',
    ])
  })

  it('avisa cuando ninguna zona tiene depósito', async () => {
    mockApi()
    vi.spyOn(zonesService, 'list').mockResolvedValue([zones[1]])
    renderOrdersPage()

    expect(await screen.findByText(/Ninguna zona tiene depósito configurado/)).toBeInTheDocument()
  })

  it('muestra el error si no se pueden cargar las zonas y los productos', async () => {
    mockApi()
    vi.spyOn(zonesService, 'list').mockRejectedValueOnce(createHttpError(500))
    const { user } = renderOrdersPage()

    expect(
      await screen.findByText('No se pudieron cargar las zonas y los productos'),
    ).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Reintentar' })[0])

    expect(await screen.findByRole('form', { name: 'Nuevo pedido' })).toBeInTheDocument()
  })

  it('valida los campos obligatorios sin llamar al backend', async () => {
    mockApi()
    const create = vi.spyOn(ordersService, 'createAsAdmin')
    const { user } = renderOrdersPage()
    await findTable()

    await submit(user)

    for (const message of [
      'El nombre del destinatario es obligatorio',
      'El teléfono de contacto es obligatorio',
      'Selecciona una zona',
      'La dirección de entrega es obligatoria',
      'La fecha y hora de entrega son obligatorias',
      'Producto 1: selecciona un producto',
      'Coloca el marcador en el mapa',
    ]) {
      // `selector: 'p'` evita confundir un error con la opción vacía de una lista del mismo texto.
      expect(getForm().getByText(message, { selector: 'p' })).toBeInTheDocument()
    }
    expect(create).not.toHaveBeenCalled()
  })

  it('exige una fecha futura y confirmar la ubicación antes de enviar', async () => {
    mockApi()
    const create = vi.spyOn(ordersService, 'createAsAdmin')
    const { user } = renderOrdersPage()
    await findTable()
    await fillValidForm(user)
    fireEvent.change(getForm().getByLabelText('Fecha y hora de entrega (hora de Guayaquil)'), {
      target: { value: '2001-01-01T10:00' },
    })
    await user.click(getForm().getByRole('button', { name: 'Colocar marcador' }))

    await submit(user)

    expect(
      screen.getByText('La entrega debe programarse para una fecha y hora futuras'),
    ).toBeInTheDocument()
    expect(screen.getByText('Confirma la ubicación en el mapa')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('al cambiar de zona descarta la ubicación confirmada y exige ubicarla de nuevo', async () => {
    mockApi()
    const otherZone = { ...zones[0], id: 'zone-3', name: 'Centro', code: 'CEN-01' }
    vi.spyOn(zonesService, 'list').mockResolvedValue([...zones, otherZone])
    const create = vi.spyOn(ordersService, 'createAsAdmin')
    const { user } = renderOrdersPage()
    await findTable()
    await fillValidForm(user)
    expect(getForm().getByText('Ubicación confirmada')).toBeInTheDocument()

    await user.selectOptions(getForm().getByLabelText('Zona'), 'zone-3')

    expect(getForm().queryByText('Ubicación confirmada')).not.toBeInTheDocument()
    expect(getForm().queryByRole('button', { name: 'Confirmar ubicación' })).not.toBeInTheDocument()
    await submit(user)
    expect(screen.getByText('Coloca el marcador en el mapa')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('muestra el total estimado según los productos elegidos', async () => {
    mockApi()
    const { user } = renderOrdersPage()
    await findTable()

    await user.selectOptions(getForm().getByLabelText('Producto 1'), 'product-2')
    fireEvent.change(getForm().getByLabelText('Cantidad 1'), { target: { value: '4' } })

    expect(screen.getByText(/Total estimado:/)).toHaveTextContent(/102,00/)
  })

  it('permite agregar y quitar líneas de producto', async () => {
    mockApi()
    const { user } = renderOrdersPage()
    await findTable()

    await user.click(getForm().getByRole('button', { name: 'Agregar producto' }))
    expect(getForm().getByLabelText('Producto 2')).toBeInTheDocument()

    await user.click(getForm().getByRole('button', { name: 'Quitar producto 2' }))
    expect(getForm().queryByLabelText('Producto 2')).not.toBeInTheDocument()
  })

  it('registra el pedido con la hora de Guayaquil y el punto confirmado, y actualiza los datos', async () => {
    const { zonesList, ordersList } = mockApi()
    const create = vi.spyOn(ordersService, 'createAsAdmin').mockResolvedValue(createdGuestOrder)
    const { user } = renderOrdersPage()
    await findTable()
    await fillValidForm(user)

    await submit(user)

    expect(create).toHaveBeenCalledWith({
      recipient: { type: 'GUEST', name: 'María Pérez', contactPhone: '0991234567' },
      zoneId: 'zone-1',
      deliveryAddress: 'Av. Los Chasquis',
      items: [{ productId: 'product-1', quantity: 2 }],
      scheduledDeliveryDate: '2099-01-15T10:30:00-05:00',
      deliveryLat: -1.25,
      deliveryLng: -78.63,
    })
    expect(
      await screen.findByText(/Pedido registrado correctamente\. Total: .*801,00/),
    ).toBeInTheDocument()
    expect(getForm().getByLabelText('Nombre del destinatario')).toHaveValue('')
    expect(getForm().queryByText('Ubicación confirmada')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(ordersList).toHaveBeenCalledTimes(2)
      expect(zonesList).toHaveBeenCalledTimes(2)
    })
  })

  it('oculta el aviso de éxito en cuanto se intenta registrar otro pedido', async () => {
    mockApi()
    vi.spyOn(ordersService, 'createAsAdmin').mockResolvedValue(createdGuestOrder)
    const { user } = renderOrdersPage()
    await findTable()
    await fillValidForm(user)
    await submit(user)
    const notice = await screen.findByText(/Pedido registrado correctamente/)

    await submit(user)

    expect(notice).not.toBeInTheDocument()
    expect(screen.getByText('El nombre del destinatario es obligatorio')).toBeInTheDocument()
  })

  it('muestra el error del backend y conserva lo escrito', async () => {
    mockApi()
    vi.spyOn(ordersService, 'createAsAdmin').mockRejectedValue(
      createHttpError(400, {
        data: { message: "Stock insuficiente para el producto 'Laptop HP Pavilion 15'" },
      }),
    )
    const { user } = renderOrdersPage()
    await findTable()
    await fillValidForm(user)

    await submit(user)

    expect(await getForm().findByRole('alert')).toHaveTextContent(
      "Stock insuficiente para el producto 'Laptop HP Pavilion 15'",
    )
    expect(getForm().getByLabelText('Nombre del destinatario')).toHaveValue('María Pérez')
    expect(screen.queryByText(/Pedido registrado correctamente/)).not.toBeInTheDocument()
  })
})
