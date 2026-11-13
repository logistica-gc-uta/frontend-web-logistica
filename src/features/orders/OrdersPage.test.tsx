import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { AxiosError } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { paths } from '../../app/paths'
import { savedCoverage } from '../../test/coverageFixtures'
import { adminSession, orders, products, zones } from '../../test/fixtures'
import { createHttpError } from '../../test/http'
import { adminReceipt, orderContact, purchaseResult } from '../../test/purchaseFixtures'
import { renderWithProviders } from '../../test/renderWithProviders'
import { mockLossesPanel } from '../../test/lossFixtures'
import { shopSettings } from '../../test/shopFixtures'
import { productsService } from '../products/productsService'
import { shopService } from '../shop/shopService'
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
    status,
    canConfirm = true,
    area,
  }: {
    value: unknown
    isConfirmed: boolean
    onChange: (point: { lat: number; lng: number }) => void
    onConfirm: () => void
    error?: string
    status?: string
    canConfirm?: boolean
    area?: unknown[]
  }) => (
    <div data-testid="map" data-area-points={area?.length ?? 0}>
      <button type="button" onClick={() => onChange({ lat: -1.25, lng: -78.63 })}>
        Colocar marcador
      </button>
      <button type="button" onClick={() => onChange({ lat: -1.4, lng: -78.9 })}>
        Colocar marcador fuera
      </button>
      {value !== null && !isConfirmed && (
        <button type="button" onClick={onConfirm} disabled={!canConfirm}>
          Confirmar ubicación
        </button>
      )}
      {isConfirmed && <span>Ubicación confirmada</span>}
      {status && <p>{status}</p>}
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
  const settings = vi.spyOn(shopService, 'settings').mockResolvedValue(shopSettings())
  const coverage = vi.spyOn(shopService, 'storeCoverage').mockResolvedValue(savedCoverage())
  vi.spyOn(shopService, 'evaluateCoverage').mockImplementation(async ({ lat }) =>
    lat === -1.4
      ? { accepted: false, position: 'EXTERIOR' }
      : { accepted: true, position: 'INTERIOR' },
  )
  // El comprobante que se abre tras una venta confirmada.
  vi.spyOn(ordersService, 'receipt').mockResolvedValue(adminReceipt())
  mockLossesPanel()
  vi.spyOn(ordersService, 'contact').mockResolvedValue(orderContact())
  vi.spyOn(ordersService, 'contactHistory').mockResolvedValue([])
  return { zonesList, productsList, ordersList, settings, coverage }
}

const renderOrdersPage = () =>
  renderWithProviders(<App />, { route: paths.orders, session: adminSession })

type User = ReturnType<typeof renderOrdersPage>['user']

const findTable = () => screen.findByRole('table', { name: 'Pedidos registrados' })
const findForm = async () => within(await screen.findByRole('form', { name: 'Nueva venta' }))
const getForm = () => within(screen.getByRole('form', { name: 'Nueva venta' }))
const getFilters = () => within(screen.getByRole('form', { name: 'Filtros de pedidos' }))

const fillValidForm = async (user: User) => {
  const form = await findForm()
  await user.type(form.getByLabelText('Nombre del comprador'), 'María Pérez')
  await user.type(form.getByLabelText('Teléfono del comprador'), '0991234567')
  await user.click(form.getByRole('radio', { name: 'Efectivo' }))
  await user.type(form.getByLabelText('Dirección de entrega'), 'Av. Los Chasquis')
  fireEvent.change(form.getByLabelText('Fecha y hora aproximada de entrega (hora de Ecuador)'), {
    target: { value: '2099-01-15T10:30' },
  })
  await user.selectOptions(form.getByLabelText('Producto 1'), 'product-1')
  fireEvent.change(form.getByLabelText('Cantidad 1'), { target: { value: '2' } })
  await user.click(form.getByRole('button', { name: 'Colocar marcador' }))
  await waitFor(() =>
    expect(form.getByRole('button', { name: 'Confirmar ubicación' })).toBeEnabled(),
  )
  await user.click(form.getByRole('button', { name: 'Confirmar ubicación' }))
}

const submit = (user: User) =>
  user.click(getForm().getByRole('button', { name: 'Registrar venta' }))

const EXPECTED_BODY = {
  buyer: { type: 'GUEST', name: 'María Pérez', contactPhone: '0991234567' },
  payment: { method: 'CASH' },
  deliveryAddress: 'Av. Los Chasquis',
  items: [{ productId: 'product-1', quantity: 2 }],
  scheduledDeliveryDate: '2099-01-15T10:30:00-05:00',
  deliveryLat: -1.25,
  deliveryLng: -78.63,
}

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

describe('OrdersPage · listado sin zona (#42)', () => {
  it('un pedido sin zona muestra «—» y cada fila enlaza a su comprobante', async () => {
    mockApi(pageOf([{ ...orders[0], zoneId: null, zone: null }]))
    renderOrdersPage()

    const [, row] = within(await findTable()).getAllByRole('row')
    expect(within(row).getByText('—')).toBeInTheDocument()
    expect(
      within(row).getByRole('link', { name: 'Comprobante y contacto del pedido de María Pérez' }),
    ).toHaveAttribute('href', `/admin/pedidos/${orders[0].id}/comprobante`)
  })
})

describe('OrdersPage · nueva venta', () => {
  it('pide comprador, quién recibe, pago declarado y entrega; sin zona ni tarjeta', async () => {
    mockApi()
    renderOrdersPage()
    const form = await findForm()

    expect(form.queryByLabelText('Zona')).not.toBeInTheDocument()
    expect(form.getByRole('radio', { name: 'Invitado (sin cuenta)' })).toBeChecked()
    expect(form.getByRole('radio', { name: 'Cliente con cuenta' })).toBeEnabled()
    expect(form.getByRole('note')).toHaveTextContent(
      'Se registra el pago que declara el cliente. No se valida en el banco ni se cobra con tarjeta.',
    )
    expect(form.queryByLabelText(/tarjeta/i)).not.toBeInTheDocument()
    expect(form.getByTestId('map')).toHaveAttribute('data-area-points', '4')
    expect(form.getByText(/La hora es aproximada/)).toBeInTheDocument()
  })

  it('sin cobertura configurada no muestra el formulario y lleva a configurarla', async () => {
    mockApi().coverage.mockResolvedValue({ configured: false })
    renderOrdersPage()

    expect(await screen.findByText(/no se pueden registrar ventas/)).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Nueva venta' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Configurar tienda y cobertura' })).toHaveAttribute(
      'href',
      paths.storeCoverage,
    )
  })

  it('valida los campos obligatorios sin llamar al backend', async () => {
    mockApi()
    const create = vi.spyOn(ordersService, 'createPurchase')
    const { user } = renderOrdersPage()
    await findForm()

    await submit(user)

    const form = getForm()
    expect(form.getByText('Escribe el nombre del comprador')).toBeInTheDocument()
    expect(form.getByText('El teléfono del comprador es obligatorio')).toBeInTheDocument()
    expect(form.getByText('Elige cómo pagó: efectivo o transferencia')).toBeInTheDocument()
    expect(form.getByText('La dirección de entrega es obligatoria')).toBeInTheDocument()
    expect(form.getByText('Coloca el marcador en el mapa')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('un punto fuera de la cobertura no se puede confirmar ni registrar', async () => {
    mockApi()
    const create = vi.spyOn(ordersService, 'createPurchase')
    const { user } = renderOrdersPage()
    const form = await findForm()

    await user.click(form.getByRole('button', { name: 'Colocar marcador fuera' }))

    expect(
      await form.findByText(
        'Ese punto está fuera de la zona de entrega. Coloca el marcador dentro del área marcada.',
      ),
    ).toBeInTheDocument()
    expect(form.getByRole('button', { name: 'Confirmar ubicación' })).toBeDisabled()
    await submit(user)
    expect(create).not.toHaveBeenCalled()
  })

  it('registra la venta de un invitado con Idempotency-Key y abre su comprobante', async () => {
    mockApi()
    const create = vi.spyOn(ordersService, 'createPurchase').mockResolvedValue(purchaseResult())
    const { user } = renderOrdersPage()
    await fillValidForm(user)

    await submit(user)

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    const [body, key] = create.mock.calls[0]
    expect(body).toEqual(EXPECTED_BODY)
    expect(key).toMatch(/^[0-9a-f-]{36}$/)
    expect(await screen.findByText('Venta registrada. Este es su comprobante.')).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'Comprobante RG-2030-0007' }),
    ).toBeInTheDocument()
  })

  it('con regalo para otra persona envía su contacto aparte del comprador', async () => {
    mockApi()
    const create = vi.spyOn(ordersService, 'createPurchase').mockResolvedValue(purchaseResult())
    const { user } = renderOrdersPage()
    await fillValidForm(user)
    const form = getForm()
    await user.click(form.getByLabelText('El regalo lo recibe otra persona'))
    await user.type(form.getByLabelText('Nombre de quien recibe'), 'Ana Regalo')
    await user.type(form.getByLabelText('Teléfono de quien recibe'), '0987654321')

    await submit(user)

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        {
          ...EXPECTED_BODY,
          giftRecipient: { name: 'Ana Regalo', contactPhone: '0987654321' },
        },
        expect.any(String),
      ),
    )
  })

  it('un rechazo del servidor (stock) no muestra comprobante y conserva lo escrito', async () => {
    mockApi()
    vi.spyOn(ordersService, 'createPurchase').mockRejectedValue(
      createHttpError(400, {
        data: { message: "Stock insuficiente para el producto 'Laptop HP Pavilion 15'" },
      }),
    )
    const { user } = renderOrdersPage()
    await fillValidForm(user)

    await submit(user)

    expect(
      await screen.findByText(
        "No se registró la venta: Stock insuficiente para el producto 'Laptop HP Pavilion 15'",
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Venta registrada/)).not.toBeInTheDocument()
    expect(getForm().getByLabelText('Nombre del comprador')).toHaveValue('María Pérez')
  })

  it('un rechazo por cobertura u horario del servidor se explica por su código', async () => {
    mockApi()
    vi.spyOn(ordersService, 'createPurchase').mockRejectedValue(
      createHttpError(422, {
        data: { error: { code: 'DELIVERY_OUTSIDE_HOURS', message: 'x', details: {} } },
      }),
    )
    const { user } = renderOrdersPage()
    await fillValidForm(user)

    await submit(user)

    expect(
      await screen.findByText('La hora elegida está fuera del horario de reparto.'),
    ).toBeInTheDocument()
  })

  it('si se corta la red verifica el intento con la misma clave y abre la venta registrada', async () => {
    mockApi()
    const create = vi
      .spyOn(ordersService, 'createPurchase')
      .mockRejectedValue(new AxiosError('Network Error'))
    const attempt = vi.spyOn(ordersService, 'purchaseAttempt').mockResolvedValue({
      status: 'SUCCEEDED',
      orderId: purchaseResult().id,
      errorCode: null,
      result: purchaseResult(),
    })
    const { user } = renderOrdersPage()
    await fillValidForm(user)

    await submit(user)

    expect(await screen.findByText('Venta registrada. Este es su comprobante.')).toBeInTheDocument()
    expect(attempt).toHaveBeenCalledWith(create.mock.calls[0][1])
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('si la venta sigue en proceso no deja enviar otra hasta verificarla', async () => {
    mockApi()
    const create = vi.spyOn(ordersService, 'createPurchase').mockRejectedValue(createHttpError(500))
    const attempt = vi
      .spyOn(ordersService, 'purchaseAttempt')
      .mockResolvedValueOnce({ status: 'PROCESSING', orderId: null, errorCode: null })
      .mockResolvedValueOnce({
        status: 'SUCCEEDED',
        orderId: purchaseResult().id,
        errorCode: null,
        result: purchaseResult(),
      })
    const { user } = renderOrdersPage()
    await fillValidForm(user)

    await submit(user)

    expect(
      await screen.findByText(
        'La venta todavía se está registrando. Vuelve a verificar en unos segundos.',
      ),
    ).toBeInTheDocument()
    expect(getForm().getByRole('button', { name: 'Registrar venta' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Verificar ahora' }))

    expect(await screen.findByText('Venta registrada. Este es su comprobante.')).toBeInTheDocument()
    expect(attempt).toHaveBeenCalledTimes(2)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('si la venta nunca llegó, reenviarla usa la misma clave (no se duplica)', async () => {
    mockApi()
    const create = vi
      .spyOn(ordersService, 'createPurchase')
      .mockRejectedValueOnce(new AxiosError('Network Error'))
      .mockResolvedValueOnce(purchaseResult())
    vi.spyOn(ordersService, 'purchaseAttempt').mockRejectedValue(
      createHttpError(404, {
        data: { error: { code: 'ADMIN_PURCHASE_ATTEMPT_NOT_FOUND', message: 'x', details: {} } },
      }),
    )
    const { user } = renderOrdersPage()
    await fillValidForm(user)

    await submit(user)
    expect(
      await screen.findByText(
        'La venta no llegó a registrarse. Puedes volver a enviarla: no se registrará dos veces.',
      ),
    ).toBeInTheDocument()
    await submit(user)

    expect(await screen.findByText('Venta registrada. Este es su comprobante.')).toBeInTheDocument()
    expect(create.mock.calls[1][1]).toBe(create.mock.calls[0][1])
  })

  it('tras un rechazo, corregir y volver a enviar usa una clave nueva', async () => {
    mockApi()
    const create = vi
      .spyOn(ordersService, 'createPurchase')
      .mockRejectedValueOnce(createHttpError(400, { data: { message: 'Stock insuficiente' } }))
      .mockResolvedValueOnce(purchaseResult())
    const { user } = renderOrdersPage()
    await fillValidForm(user)
    await submit(user)
    await screen.findByText(/No se registró la venta/)

    fireEvent.change(getForm().getByLabelText('Cantidad 1'), { target: { value: '1' } })
    await submit(user)

    await screen.findByText('Venta registrada. Este es su comprobante.')
    expect(create.mock.calls[1][1]).not.toBe(create.mock.calls[0][1])
  })

  it('muestra el subtotal estimado y aclara que el total lo calcula el servidor', async () => {
    mockApi()
    const { user } = renderOrdersPage()
    await fillValidForm(user)

    expect(getForm().getByText(/Subtotal estimado/)).toHaveTextContent('1.500,00')
    expect(getForm().getByText(/El total con IVA lo calcula el servidor/)).toBeInTheDocument()
  })

  it('muestra el error si no se puede cargar lo necesario para vender', async () => {
    mockApi().coverage.mockRejectedValueOnce(createHttpError(500))
    renderOrdersPage()

    expect(
      await screen.findByText('No se pudo cargar lo necesario para registrar ventas'),
    ).toBeInTheDocument()
  })
})
