import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { paths } from '../../app/paths'
import { auditRecord, urgencyProposal } from '../../test/dispatchFixtures'
import { adminSession, adminUser, orders } from '../../test/fixtures'
import { createHttpError } from '../../test/http'
import { availableDriver, busyDriver, savedRouteDetail } from '../../test/planningFixtures'
import { renderWithProviders } from '../../test/renderWithProviders'
import { ordersService } from '../orders/ordersService'
import { driversService } from '../planning/driversService'
import { planningService } from '../planning/planningService'
import { dispatchService } from './dispatchService'
import type { UrgencyInbox } from './types'

const TODAY = '2030-02-14'
const order = orders[0]
const TITLE = order.deliveryAddress

const inboxWith = (overrides: Partial<UrgencyInbox> = {}): UrgencyInbox => ({
  date: TODAY,
  urgencies: [urgencyProposal(order.id)],
  failedDeliveries: 0,
  ...overrides,
})

const mockApi = (inbox: UrgencyInbox = inboxWith()) => {
  const inboxSpy = vi.spyOn(dispatchService, 'inbox').mockResolvedValue(inbox)
  vi.spyOn(ordersService, 'listAll').mockResolvedValue([order])
  const listRoutes = vi
    .spyOn(planningService, 'listRoutes')
    .mockResolvedValue([savedRouteDetail('route-1')])
  vi.spyOn(ordersService, 'get').mockResolvedValue(order)
  vi.spyOn(driversService, 'list').mockResolvedValue([availableDriver, busyDriver])
  const audit = vi.spyOn(dispatchService, 'audit').mockResolvedValue([
    auditRecord({
      action: 'PRIORITIZE',
      orderId: order.id,
      actorId: adminUser.id,
      recordedAt: new Date().toISOString(),
    }),
  ])
  return { inboxSpy, listRoutes, audit }
}

const renderPage = () =>
  renderWithProviders(<App />, { route: paths.urgencies, session: adminSession })

const findCard = async () =>
  within(await screen.findByRole('article', { name: `Urgencia ${TITLE}` }))

describe('UrgenciesPage', () => {
  it('muestra la bandeja del día, las rutas de hoy y las decisiones registradas', async () => {
    mockApi(inboxWith({ failedDeliveries: 2 }))
    renderPage()

    const card = await findCard()
    expect(card.getByText('Ruta guardada 1 · FIC-02')).toBeInTheDocument()
    expect(
      screen.getByText(/Hay 2 pedidos con una entrega fallida esperando revisión/),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('listitem', { name: 'Ruta guardada 1 · FIC-02' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('Tú · Motivo: Calle cerrada', { exact: false }),
    ).toBeInTheDocument()
    expect(screen.getByText(`Pedido: ${TITLE} · Ruta guardada 1 · FIC-02`)).toBeInTheDocument()
  })

  it('no muestra como urgencia un pedido que ya está en una ruta, solo lo cuenta', async () => {
    mockApi(
      inboxWith({
        urgencies: [
          urgencyProposal('ya-en-ruta', { kind: 'BLOCKED', reasons: ['ACTIVE_ROUTE_CLAIM'] }),
        ],
      }),
    )
    renderPage()

    expect(
      await screen.findByText('1 pedido de hoy ya está en una ruta: se ve en "Rutas de hoy".'),
    ).toBeInTheDocument()
    expect(screen.getByText('No hay pedidos urgentes por despachar hoy.')).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('indica cuando no hay urgencias hoy', async () => {
    mockApi(inboxWith({ urgencies: [] }))
    renderPage()

    expect(
      await screen.findByText('No hay pedidos urgentes por despachar hoy.'),
    ).toBeInTheDocument()
  })

  it('si no se puede cargar la bandeja lo dice y permite reintentar', async () => {
    const { inboxSpy } = mockApi()
    inboxSpy.mockRejectedValueOnce(createHttpError(500))
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Reintentar' }))

    expect(await findCard()).toBeTruthy()
    expect(inboxSpy).toHaveBeenCalledTimes(2)
  })

  it('insertar una urgencia la confirma con su propuesta y vuelve a consultar todo', async () => {
    const { inboxSpy, listRoutes, audit } = mockApi()
    const confirm = vi
      .spyOn(dispatchService, 'confirm')
      .mockResolvedValue(auditRecord({ action: 'CONFIRM' }))
    const { user } = renderPage()
    const card = await findCard()

    await user.type(card.getByLabelText(`Motivo de la decisión para ${TITLE}`), 'Cabe hoy')
    await user.click(card.getByRole('button', { name: 'Insertar en la ruta' }))

    await waitFor(() => expect(inboxSpy).toHaveBeenCalledTimes(2))
    expect(confirm).toHaveBeenCalledWith(urgencyProposal(order.id), 'Cabe hoy', undefined)
    expect(listRoutes).toHaveBeenCalledTimes(2)
    expect(audit).toHaveBeenCalledTimes(2)
  })

  it.each([
    {
      caso: 'una propuesta vieja (409)',
      error: createHttpError(409, { data: { message: 'Stale proposal' } }),
      mensaje: /Conflicto: Stale proposal\. La propuesta, la ruta o el chofer cambiaron/,
    },
    {
      caso: 'falta de permisos (403)',
      error: createHttpError(403),
      mensaje: 'No tienes permisos para despachar urgencias.',
    },
  ])('ante $caso explica el error y el pedido sigue en la bandeja', async ({ error, mensaje }) => {
    const { inboxSpy } = mockApi()
    vi.spyOn(dispatchService, 'confirm').mockRejectedValue(error)
    const { user } = renderPage()
    const card = await findCard()

    await user.type(card.getByLabelText(`Motivo de la decisión para ${TITLE}`), 'x')
    await user.click(card.getByRole('button', { name: 'Insertar en la ruta' }))

    expect(await card.findByRole('alert')).toHaveTextContent(mensaje)
    expect(card.getByText('Pendiente (PENDING)')).toBeInTheDocument()
    expect(inboxSpy).toHaveBeenCalledOnce()
  })

  it('rechazar y priorizar llegan al servicio de despacho, cada una con su propio motivo', async () => {
    mockApi()
    const reject = vi
      .spyOn(dispatchService, 'reject')
      .mockResolvedValue(auditRecord({ action: 'REJECT', outcome: 'REJECTED' }))
    const prioritize = vi
      .spyOn(dispatchService, 'prioritize')
      .mockResolvedValue(auditRecord({ action: 'PRIORITIZE' }))
    const { user } = renderPage()
    const card = await findCard()
    await user.type(card.getByLabelText(`Motivo de la decisión para ${TITLE}`), 'Esperar')

    await user.click(card.getByRole('button', { name: 'Rechazar propuesta' }))
    await waitFor(() => expect(reject).toHaveBeenCalledOnce())
    const refreshed = await findCard()
    await waitFor(() =>
      expect(refreshed.getByLabelText(`Motivo de la decisión para ${TITLE}`)).toHaveValue(''),
    )
    await user.type(refreshed.getByLabelText(`Motivo de la decisión para ${TITLE}`), 'Urgente')
    await user.click(refreshed.getByRole('button', { name: 'Priorizar' }))

    await waitFor(() => expect(prioritize).toHaveBeenCalledWith(order.id, 'Urgente'))
  })

  it('cambiar el chofer de una ruta de hoy usa la reasignación auditada', async () => {
    mockApi()
    vi.spyOn(planningService, 'listRoutes').mockResolvedValue([
      savedRouteDetail('route-1', {
        status: 'ASSIGNED',
        driverId: 'driver-9',
        driverName: 'Chofer Actual',
      }),
    ])
    const reassign = vi
      .spyOn(dispatchService, 'reassignDriver')
      .mockResolvedValue(auditRecord({ action: 'REASSIGN_DRIVER' }))
    const { user } = renderPage()
    const route = within(await screen.findByRole('listitem', { name: 'Ruta guardada 1 · FIC-02' }))

    await user.selectOptions(
      route.getByLabelText('Nuevo chofer para Ruta guardada 1 · FIC-02'),
      'driver-1',
    )
    await user.type(
      route.getByLabelText('Motivo del cambio de chofer de Ruta guardada 1 · FIC-02'),
      'Chofer enfermo',
    )
    await user.click(route.getByRole('button', { name: 'Cambiar chofer' }))

    await waitFor(() =>
      expect(reassign).toHaveBeenCalledWith('route-1', 'driver-1', 'Chofer enfermo'),
    )
  })

  it('las rutas de hoy en curso no permiten ninguna acción', async () => {
    mockApi()
    vi.spyOn(planningService, 'listRoutes').mockResolvedValue([
      savedRouteDetail('route-1', { status: 'IN_PROGRESS', driverName: 'Ana' }),
    ])
    renderPage()

    const route = within(await screen.findByRole('listitem', { name: 'Ruta guardada 1 · FIC-02' }))
    expect(route.getByText('En curso (IN_PROGRESS)')).toBeInTheDocument()
    expect(route.queryByRole('button')).not.toBeInTheDocument()
    expect(route.queryByRole('combobox')).not.toBeInTheDocument()
  })
})
