import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { paths } from '../../app/paths'
import { auditRecord, failedDelivery, urgencyProposal } from '../../test/dispatchFixtures'
import { adminSession, adminUser, orders } from '../../test/fixtures'
import { createHttpError } from '../../test/http'
import { availableDriver, busyDriver, savedRouteDetail } from '../../test/planningFixtures'
import { renderWithProviders } from '../../test/renderWithProviders'
import { ordersService } from '../orders/ordersService'
import { driversService } from '../planning/driversService'
import { planningService } from '../planning/planningService'
import { shopService } from '../shop/shopService'
import { shopSettings } from '../../test/shopFixtures'
import { dispatchService } from './dispatchService'
import type { UrgencyInbox } from './types'
import { createFakeSocket } from '../../test/fakeSocket'

/** La bandeja sigue los cambios en vivo: el socket se simula para no abrir una conexión real. */
const socket = createFakeSocket()
vi.mock('../../lib/realtime/realtimeClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/realtime/realtimeClient')>()),
  createRealtimeSocket: () => socket,
}))

const TODAY = '2030-02-14'
const order = orders[0]
const TITLE = order.deliveryAddress

const inboxWith = (overrides: Partial<UrgencyInbox> = {}): UrgencyInbox => ({
  date: TODAY,
  urgencies: [urgencyProposal(order.id)],
  failedDeliveries: [],
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

// La disponibilidad por día (#36) se prueba aparte: aquí alcanza con el listado simulado.
beforeEach(() => {
  vi.spyOn(driversService, 'listForDay').mockImplementation(() => driversService.list())
  vi.spyOn(shopService, 'settings').mockResolvedValue(shopSettings())
})

/** Rutas de hoy y decisiones registradas viven en paneles laterales de la cabecera. */
const openRoutes = async (user: ReturnType<typeof renderPage>['user']) =>
  user.click(await screen.findByRole('button', { name: 'Ver rutas de hoy' }))
const openAudit = async (user: ReturnType<typeof renderPage>['user']) =>
  user.click(await screen.findByRole('button', { name: 'Ver decisiones registradas' }))

describe('UrgenciesPage', () => {
  it('muestra la bandeja del día, las rutas de hoy y las decisiones registradas', async () => {
    mockApi(inboxWith({ failedDeliveries: [failedDelivery('f1'), failedDelivery('f2')] }))
    const { user } = renderPage()

    const card = await findCard()
    expect(card.getByText('Ruta guardada 1 · FIC-02')).toBeInTheDocument()
    expect(
      screen.getByText(/Hay 2 pedidos con una entrega fallida esperando revisión/),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('note')).getByRole('link', { name: 'Entregas fallidas' }),
    ).toHaveAttribute('href', '/admin/entregas-fallidas')
    await openRoutes(user)
    expect(
      await screen.findByRole('listitem', { name: 'Ruta guardada 1 · FIC-02' }),
    ).toBeInTheDocument()
    await openAudit(user)
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
    await openRoutes(user)
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
    const { user } = renderPage()
    await openRoutes(user)

    const route = within(await screen.findByRole('listitem', { name: 'Ruta guardada 1 · FIC-02' }))
    expect(route.getByText('En curso (IN_PROGRESS)')).toBeInTheDocument()
    expect(route.queryByRole('button')).not.toBeInTheDocument()
    expect(route.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('cancela una ruta de hoy ASSIGNED con motivo, recarga todo y muestra la acción en decisiones', async () => {
    const { inboxSpy, audit } = mockApi()
    vi.spyOn(planningService, 'listRoutes').mockResolvedValue([
      savedRouteDetail('route-1', {
        status: 'ASSIGNED',
        driverId: 'driver-9',
        driverName: 'Chofer Actual',
        startedAt: null,
      }),
    ])
    audit.mockResolvedValue([
      auditRecord({
        action: 'CANCEL_ROUTE',
        orderId: null,
        routeId: 'route-1',
        actorId: adminUser.id,
        reason: 'Sin combustible',
        recordedAt: new Date().toISOString(),
      }),
    ])
    const cancelRoute = vi
      .spyOn(dispatchService, 'cancelRoute')
      .mockResolvedValue(auditRecord({ action: 'CANCEL_ROUTE', routeId: 'route-1' }))
    const { user } = renderPage()
    await openRoutes(user)

    const route = within(await screen.findByRole('listitem', { name: 'Ruta guardada 1 · FIC-02' }))
    await user.click(route.getByRole('button', { name: 'Cancelar ruta' }))
    const dialog = within(route.getByRole('group', { name: 'Cancelar Ruta guardada 1 · FIC-02' }))
    await user.type(
      dialog.getByLabelText('Motivo para cancelar Ruta guardada 1 · FIC-02'),
      'Sin combustible',
    )
    await user.click(dialog.getByRole('button', { name: 'Confirmar cancelación' }))

    await waitFor(() => expect(cancelRoute).toHaveBeenCalledWith('route-1', 'Sin combustible'))
    await waitFor(() => expect(inboxSpy).toHaveBeenCalledTimes(2))
    expect(audit).toHaveBeenCalledTimes(2)

    await openAudit(user)
    expect(await screen.findByText('Cancelar ruta')).toBeInTheDocument()
    expect(screen.getByText(/Motivo: Sin combustible/)).toBeInTheDocument()
  })

  it('si cancelar una ruta de hoy falla con 409 ROUTE_DRIVER_CHANGED revalida la bandeja, conserva el motivo si sigue elegible y muestra el error', async () => {
    const { inboxSpy, listRoutes, audit } = mockApi()
    const listDrivers = vi.spyOn(driversService, 'list')
    const assigned = savedRouteDetail('route-1', {
      status: 'ASSIGNED',
      driverId: 'driver-9',
      driverName: 'Chofer Actual',
      startedAt: null,
    })
    listRoutes
      .mockResolvedValueOnce([assigned])
      .mockResolvedValueOnce([{ ...assigned, driverId: 'driver-1', driverName: 'Carlos Chofer' }])
    vi.spyOn(dispatchService, 'cancelRoute').mockRejectedValue(
      createHttpError(409, {
        data: { statusCode: 409, code: 'ROUTE_DRIVER_CHANGED', message: 'Driver changed' },
      }),
    )
    const { user } = renderPage()
    await openRoutes(user)

    const route = within(await screen.findByRole('listitem', { name: 'Ruta guardada 1 · FIC-02' }))
    await user.click(route.getByRole('button', { name: 'Cancelar ruta' }))
    const dialog = within(route.getByRole('group', { name: 'Cancelar Ruta guardada 1 · FIC-02' }))
    const input = dialog.getByLabelText('Motivo para cancelar Ruta guardada 1 · FIC-02')
    await user.type(input, 'Falla mecánica')
    await user.click(dialog.getByRole('button', { name: 'Confirmar cancelación' }))

    await waitFor(() => expect(listRoutes).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(inboxSpy).toHaveBeenCalledTimes(2))
    expect(listDrivers).toHaveBeenCalledTimes(2)
    expect(audit).toHaveBeenCalledTimes(2)
    expect(await route.findByText('Chofer: Carlos Chofer')).toBeInTheDocument()
    expect(await dialog.findByRole('alert')).toHaveTextContent(/chofer asignado.*cambió/i)
    expect(input).toHaveValue('Falla mecánica')
  })

  it('si cancelar una ruta de hoy falla con 409 ROUTE_ALREADY_STARTED revalida todo, quita los controles al pasar a IN_PROGRESS y deja el error en la tarjeta', async () => {
    const { inboxSpy, listRoutes, audit } = mockApi()
    const listDrivers = vi.spyOn(driversService, 'list')
    const assigned = savedRouteDetail('route-1', {
      status: 'ASSIGNED',
      driverId: 'driver-9',
      driverName: 'Chofer Actual',
      startedAt: null,
    })
    listRoutes
      .mockResolvedValueOnce([assigned])
      .mockResolvedValueOnce([
        { ...assigned, status: 'IN_PROGRESS', startedAt: '2030-02-14T15:10:00Z' },
      ])
    vi.spyOn(dispatchService, 'cancelRoute').mockRejectedValue(
      createHttpError(409, {
        data: { statusCode: 409, code: 'ROUTE_ALREADY_STARTED', message: 'Route already started' },
      }),
    )
    const { user } = renderPage()
    await openRoutes(user)

    const route = within(await screen.findByRole('listitem', { name: 'Ruta guardada 1 · FIC-02' }))
    await user.click(route.getByRole('button', { name: 'Cancelar ruta' }))
    const dialog = within(route.getByRole('group', { name: 'Cancelar Ruta guardada 1 · FIC-02' }))
    await user.type(
      dialog.getByLabelText('Motivo para cancelar Ruta guardada 1 · FIC-02'),
      'Falla mecánica',
    )
    await user.click(dialog.getByRole('button', { name: 'Confirmar cancelación' }))

    await waitFor(() => expect(listRoutes).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(inboxSpy).toHaveBeenCalledTimes(2))
    expect(listDrivers).toHaveBeenCalledTimes(2)
    expect(audit).toHaveBeenCalledTimes(2)
    expect(await route.findByText('En curso (IN_PROGRESS)')).toBeInTheDocument()
    expect(
      route.queryByRole('group', { name: 'Cancelar Ruta guardada 1 · FIC-02' }),
    ).not.toBeInTheDocument()
    expect(route.queryByRole('button', { name: 'Cancelar ruta' })).not.toBeInTheDocument()
    expect(route.getByRole('alert')).toHaveTextContent(/ya se inició/)
  })

  it('si cancelar una ruta de hoy falla con 404 revalida todo y muestra el error en la superficie del panel', async () => {
    const { inboxSpy, listRoutes, audit } = mockApi()
    const listDrivers = vi.spyOn(driversService, 'list')
    const assigned = savedRouteDetail('route-1', {
      status: 'ASSIGNED',
      driverId: 'driver-9',
      driverName: 'Chofer Actual',
      startedAt: null,
    })
    listRoutes.mockResolvedValueOnce([assigned]).mockResolvedValueOnce([])
    vi.spyOn(dispatchService, 'cancelRoute').mockRejectedValue(createHttpError(404))
    const { user } = renderPage()
    await openRoutes(user)

    const route = within(await screen.findByRole('listitem', { name: 'Ruta guardada 1 · FIC-02' }))
    await user.click(route.getByRole('button', { name: 'Cancelar ruta' }))
    const dialog = within(route.getByRole('group', { name: 'Cancelar Ruta guardada 1 · FIC-02' }))
    await user.type(
      dialog.getByLabelText('Motivo para cancelar Ruta guardada 1 · FIC-02'),
      'Falla mecánica',
    )
    await user.click(dialog.getByRole('button', { name: 'Confirmar cancelación' }))

    await waitFor(() => expect(listRoutes).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(inboxSpy).toHaveBeenCalledTimes(2))
    expect(listDrivers).toHaveBeenCalledTimes(2)
    expect(audit).toHaveBeenCalledTimes(2)
    await waitFor(() =>
      expect(
        screen.queryByRole('listitem', { name: 'Ruta guardada 1 · FIC-02' }),
      ).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/No se encontró la ruta/)
  })
})
