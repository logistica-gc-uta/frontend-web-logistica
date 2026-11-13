import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { AxiosError } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { paths } from '../../app/paths'
import { savedCoverage } from '../../test/coverageFixtures'
import { adminSession, products, zones } from '../../test/fixtures'
import { createHttpError } from '../../test/http'
import { adminReceipt, orderContact, purchaseResult } from '../../test/purchaseFixtures'
import { renderWithProviders } from '../../test/renderWithProviders'
import { mockLossesPanel } from '../../test/lossFixtures'
import { shopSettings } from '../../test/shopFixtures'
import { productsService } from '../products/productsService'
import { shopService } from '../shop/shopService'
import { zonesService } from '../zones/zonesService'
import { adminClientsService, type AdminClient } from './adminClientsService'
import { ordersService } from './ordersService'

/** El mapa real no se dibuja en jsdom: se simula con botones (igual que en OrdersPage.test). */
vi.mock('../../components/map/LocationPicker', () => ({
  LocationPicker: ({
    value,
    isConfirmed,
    onChange,
    onConfirm,
    canConfirm = true,
  }: {
    value: unknown
    isConfirmed: boolean
    onChange: (point: { lat: number; lng: number }) => void
    onConfirm: () => void
    canConfirm?: boolean
  }) => (
    <div>
      <button type="button" onClick={() => onChange({ lat: -1.25, lng: -78.63 })}>
        Colocar marcador
      </button>
      {value !== null && !isConfirmed && (
        <button type="button" onClick={onConfirm} disabled={!canConfirm}>
          Confirmar ubicación
        </button>
      )}
    </div>
  ),
}))

const ANA: AdminClient = { id: 'client-1', name: 'Ana Cliente', email: 'ana@regalia.test' }
const ANDRES: AdminClient = { id: 'client-2', name: 'Andrés Mora', email: 'andres@regalia.test' }

const mockApi = () => {
  vi.spyOn(zonesService, 'list').mockResolvedValue(zones)
  vi.spyOn(productsService, 'list').mockResolvedValue(products)
  vi.spyOn(ordersService, 'list').mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 })
  vi.spyOn(shopService, 'settings').mockResolvedValue(shopSettings())
  vi.spyOn(shopService, 'storeCoverage').mockResolvedValue(savedCoverage())
  vi.spyOn(shopService, 'evaluateCoverage').mockResolvedValue({
    accepted: true,
    position: 'INTERIOR',
  })
  vi.spyOn(ordersService, 'receipt').mockResolvedValue(adminReceipt())
  mockLossesPanel()
  vi.spyOn(ordersService, 'contact').mockResolvedValue(orderContact())
  vi.spyOn(ordersService, 'contactHistory').mockResolvedValue([])
}

const mockClients = (items: AdminClient[] = [ANA, ANDRES], total = items.length) =>
  vi
    .spyOn(adminClientsService, 'search')
    .mockImplementation(async (_text, page = 1) => ({ items, total, page, pageSize: 20 }))

const renderOrdersPage = () =>
  renderWithProviders(<App />, { route: paths.orders, session: adminSession })

type User = ReturnType<typeof renderOrdersPage>['user']

const findForm = async () => within(await screen.findByRole('form', { name: 'Nueva venta' }))
const SEARCH = 'Buscar cliente por nombre o correo'

/** Completa una venta válida de invitado (nombre, teléfono, pago, entrega, producto y mapa). */
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
  return form
}

const chooseRegistered = async (user: User) => {
  const form = await findForm()
  await user.click(form.getByRole('radio', { name: 'Cliente con cuenta' }))
  return form
}

const submit = async (user: User) =>
  user.click((await findForm()).getByRole('button', { name: 'Registrar venta' }))

describe('Venta ADMIN a un cliente con cuenta (#34, backend #64)', () => {
  it('busca desde 2 letras y envía la cuenta elegida con el teléfono, sin nombre escrito', async () => {
    mockApi()
    const search = mockClients()
    const create = vi.spyOn(ordersService, 'createPurchase').mockResolvedValue(purchaseResult())
    const { user } = renderOrdersPage()
    await fillValidForm(user)
    const form = await chooseRegistered(user)

    expect(form.queryByLabelText('Nombre del comprador')).not.toBeInTheDocument()
    await user.type(form.getByLabelText(SEARCH), 'a')
    expect(form.getByText(/Escribe al menos 2 letras/)).toBeInTheDocument()
    await user.type(form.getByLabelText(SEARCH), 'n')
    await user.click(
      await form.findByRole('button', { name: 'Elegir a Ana Cliente (ana@regalia.test)' }),
    )

    expect(search).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledWith('an', 1)
    expect(form.getByRole('group', { name: 'Cliente elegido' })).toHaveTextContent(
      'Ana Cliente · ana@regalia.test',
    )
    await submit(user)

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create.mock.calls[0][0]).toEqual({
      buyer: { type: 'REGISTERED_CLIENT', clientId: 'client-1', contactPhone: '0991234567' },
      payment: { method: 'CASH' },
      deliveryAddress: 'Av. Los Chasquis',
      items: [{ productId: 'product-1', quantity: 2 }],
      scheduledDeliveryDate: '2099-01-15T10:30:00-05:00',
      deliveryLat: -1.25,
      deliveryLng: -78.63,
    })
    expect(await screen.findByText('Venta registrada. Este es su comprobante.')).toBeInTheDocument()
  })

  it('sin elegir una cuenta no envía la venta', async () => {
    mockApi()
    mockClients()
    const create = vi.spyOn(ordersService, 'createPurchase')
    const { user } = renderOrdersPage()
    await fillValidForm(user)
    const form = await chooseRegistered(user)

    await submit(user)

    expect(form.getByText('Busca y elige la cuenta del cliente')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('cambiar de cliente o volver a invitado no pierde lo escrito', async () => {
    mockApi()
    mockClients()
    const { user } = renderOrdersPage()
    await fillValidForm(user)
    const form = await chooseRegistered(user)
    await user.type(form.getByLabelText(SEARCH), 'an')
    await user.click(await form.findByRole('button', { name: /Elegir a Ana Cliente/ }))

    await user.click(form.getByRole('button', { name: 'Cambiar cliente' }))
    expect(form.getByLabelText(SEARCH)).toHaveValue('an')
    await user.click(await form.findByRole('button', { name: /Elegir a Andrés Mora/ }))
    expect(form.getByRole('group', { name: 'Cliente elegido' })).toHaveTextContent('Andrés Mora')

    await user.click(form.getByRole('radio', { name: 'Invitado (sin cuenta)' }))
    expect(form.getByLabelText('Nombre del comprador')).toHaveValue('María Pérez')
    expect(form.getByLabelText('Teléfono del comprador')).toHaveValue('0991234567')
  })

  it('avisa si no hay coincidencias y carga más resultados por páginas', async () => {
    mockApi()
    const search = mockClients([], 0)
    const { user } = renderOrdersPage()
    const form = await chooseRegistered(user)
    const input = form.getByLabelText(SEARCH)

    await user.type(input, 'zz')
    expect(await form.findByText(/No hay clientes con ese nombre o correo/)).toBeInTheDocument()

    search.mockImplementation(async (_text, page = 1) => ({
      items: [page === 1 ? ANA : ANDRES],
      total: 2,
      page,
      pageSize: 20,
    }))
    await user.clear(input)
    await user.type(input, 'an')
    await user.click(await form.findByRole('button', { name: 'Ver más clientes' }))

    expect(await form.findByRole('button', { name: /Elegir a Andrés Mora/ })).toBeInTheDocument()
    expect(form.getByRole('button', { name: /Elegir a Ana Cliente/ })).toBeInTheDocument()
    expect(search).toHaveBeenLastCalledWith('an', 2)
    expect(form.queryByRole('button', { name: 'Ver más clientes' })).not.toBeInTheDocument()
  })

  it('si la búsqueda falla se puede reintentar', async () => {
    mockApi()
    const search = vi
      .spyOn(adminClientsService, 'search')
      .mockRejectedValueOnce(new AxiosError('Network Error'))
      .mockResolvedValue({ items: [ANA], total: 1, page: 1, pageSize: 20 })
    const { user } = renderOrdersPage()
    const form = await chooseRegistered(user)

    await user.type(form.getByLabelText(SEARCH), 'an')
    expect(await form.findByText(/No se pudo conectar con el servidor/)).toBeInTheDocument()
    await user.click(form.getByRole('button', { name: 'Reintentar' }))

    expect(await form.findByRole('button', { name: /Elegir a Ana Cliente/ })).toBeInTheDocument()
    expect(search).toHaveBeenCalledTimes(2)
  })

  it('si la cuenta ya no existe lo explica y no muestra un comprobante', async () => {
    mockApi()
    mockClients()
    vi.spyOn(ordersService, 'createPurchase').mockRejectedValue(
      createHttpError(404, { data: { statusCode: 404, message: 'Registered client not found' } }),
    )
    const { user } = renderOrdersPage()
    await fillValidForm(user)
    const form = await chooseRegistered(user)
    await user.type(form.getByLabelText(SEARCH), 'an')
    await user.click(await form.findByRole('button', { name: /Elegir a Ana Cliente/ }))

    await submit(user)

    expect(
      await form.findByText(
        'No se registró la venta: la cuenta del cliente ya no existe. Búscala de nuevo.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Comprobante/ })).not.toBeInTheDocument()
  })
})
