import { act, render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { paths } from '../../app/paths'
import { adminSession } from '../../test/fixtures'
import { createHttpError } from '../../test/http'
import { createFakeSocket } from '../../test/fakeSocket'
import { monitorRoute, stopWith, threeDeliveredOneFailed } from '../../test/monitorFixtures'
import { availableDriver } from '../../test/planningFixtures'
import { renderWithProviders } from '../../test/renderWithProviders'
import { dispatchService } from '../dispatch/dispatchService'
import { driversService } from '../planning/driversService'
import { MonitorRouteCard } from './MonitorRouteCard'
import { monitorService } from './monitorService'
import type { MonitorRoute } from './types'

let socket = createFakeSocket()
vi.mock('../../lib/realtime/realtimeClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/realtime/realtimeClient')>()),
  createRealtimeSocket: () => socket,
}))

const TODAY = new Date().toISOString()
const today = (overrides: Partial<MonitorRoute> = {}) =>
  monitorRoute({ date: TODAY, createdAt: TODAY, ...overrides })

const mockApi = (...responses: MonitorRoute[][]) => {
  const listRoutes = vi.spyOn(monitorService, 'listRoutes')
  responses.forEach((routes) => listRoutes.mockResolvedValueOnce(routes))
  listRoutes.mockResolvedValue(responses.at(-1) ?? [])
  vi.spyOn(driversService, 'list').mockResolvedValue([availableDriver])
  return listRoutes
}

const renderPage = () =>
  renderWithProviders(<App />, { route: paths.monitor, session: adminSession })

/** La tarjeta enlaza al pedido, a Entregas fallidas y a Emergencias (#67): necesita un router. */
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: MemoryRouter })

const routeCard = () => within(screen.getByRole('article', { name: 'Ruta 1 · FIC-02' }))

// Los enlaces del tablero (#67) consultan la bandeja y las emergencias: sin datos por defecto.
beforeEach(() => {
  vi.spyOn(dispatchService, 'inbox').mockResolvedValue({
    date: '2026-10-21',
    urgencies: [],
    failedDeliveries: [],
  })
  vi.spyOn(dispatchService, 'emergencies').mockResolvedValue([])
})

describe('MonitorRouteCard', () => {
  it('3 entregas y 1 fallida: 75 % entregado, 4 de 4 resueltas y el motivo del fallo', () => {
    render(
      <MonitorRouteCard
        route={monitorRoute({ stops: threeDeliveredOneFailed() })}
        name="Ruta 1 · FIC-02"
        driver={availableDriver}
      />,
    )

    expect(screen.getByText('3 de 4 entregados')).toBeInTheDocument()
    // El avance son puntos, uno por parada: 3 entregadas de 4.
    const dots = screen.getByRole('progressbar', { name: 'Entregas exitosas de Ruta 1 · FIC-02' })
    expect(dots).toHaveAttribute('aria-valuenow', '3')
    expect(dots).toHaveAttribute('aria-valuemax', '4')
    expect(dots.querySelectorAll('.monitor-dot')).toHaveLength(4)
    expect(dots.querySelectorAll('.monitor-dot--successful')).toHaveLength(3)
    expect(dots.querySelectorAll('.monitor-dot--failed')).toHaveLength(1)
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '1Parada 1PedidoEntregado',
      '2Parada 2PedidoEntregado',
      '3Parada 3PedidoVisita fallida: destinatario ausente',
      '4Parada 4PedidoEntregado',
    ])
    expect(screen.getByText('Ocupado con esta ruta')).toBeInTheDocument()
  })

  it('una ruta completada sin regreso confirmado muestra al chofer retornando, no disponible', () => {
    render(
      <MonitorRouteCard
        route={monitorRoute({ status: 'COMPLETED', completedAt: '2026-10-21T16:00:00Z' })}
        name="Ruta 1 · FIC-02"
        driver={availableDriver}
      />,
    )

    expect(screen.getByText('Completada')).toBeInTheDocument()
    expect(
      screen.getByText('Retornando al depósito: todavía no está disponible'),
    ).toBeInTheDocument()
  })

  it('tras el regreso confirmado por el servidor, el chofer figura disponible', () => {
    render(
      <MonitorRouteCard
        route={monitorRoute({
          status: 'COMPLETED',
          completedAt: '2026-10-21T16:00:00Z',
          returnedAt: '2026-10-21T16:40:00Z',
        })}
        name="Ruta 1 · FIC-02"
        driver={availableDriver}
      />,
    )

    expect(screen.getByText('Regresó al depósito y está disponible')).toBeInTheDocument()
    expect(screen.getByText('21/10/2026, 11:40')).toBeInTheDocument()
  })

  it('muestra motivos desconocidos tal cual y paradas sin resultado como tales', () => {
    render(
      <MonitorRouteCard
        route={monitorRoute({
          stops: [stopWith(1, 'FAILED', 'CODIGO_NUEVO'), stopWith(2, null), stopWith(3, 'FAILED')],
        })}
        name="Ruta 1 · FIC-02"
        driver={undefined}
      />,
    )

    expect(screen.getByText('Visita fallida: CODIGO_NUEVO')).toBeInTheDocument()
    expect(screen.getByText('Sin resultado registrado')).toBeInTheDocument()
    expect(screen.getByText('Visita fallida: sin motivo registrado')).toBeInTheDocument()
  })
})

describe('MonitorPage', () => {
  beforeEach(() => {
    socket = createFakeSocket()
  })

  it('muestra las rutas de hoy, se conecta en vivo y dice cuándo se actualizó', async () => {
    mockApi([today(), today({ id: 'borrador', status: 'DRAFT', driverId: null })])
    renderPage()

    expect(await screen.findByText('0 de 4 entregados')).toBeInTheDocument()
    expect(screen.getByText(/Hay 1 ruta de hoy en borrador/)).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Conectando…')

    act(() => socket.fire('connect'))

    expect(await screen.findByText('En vivo')).toBeInTheDocument()
    expect(screen.getByText(/Última actualización: \d{2}:\d{2}:\d{2}/)).toBeInTheDocument()
    expect(socket.subscriptions).toEqual(
      expect.arrayContaining([
        { resource: 'incidents' },
        { resource: 'route', id: 'route-1' },
        { resource: 'driver', id: 'driver-1' },
        { resource: 'order', id: 'order-1' },
      ]),
    )
  })

  it('con más de cuatro rutas se ven de cuatro en cuatro, con navegación', async () => {
    mockApi([
      today({ id: 'r1', createdAt: '2026-10-21T10:00:00Z' }),
      today({ id: 'r2', createdAt: '2026-10-21T11:00:00Z' }),
      today({ id: 'r3', createdAt: '2026-10-21T12:00:00Z' }),
      today({ id: 'r4', createdAt: '2026-10-21T13:00:00Z' }),
      today({ id: 'r5', createdAt: '2026-10-21T14:00:00Z' }),
    ])
    const { user } = renderPage()

    expect(await screen.findByText('Rutas 1–4')).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(4)

    await user.click(screen.getByRole('button', { name: 'Siguiente' }))

    expect(screen.getByText('Ruta 5')).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(1)
  })

  it('una entrega registrada en la app se refleja sin recargar la página', async () => {
    const listRoutes = mockApi(
      [today()],
      [today()],
      [today({ stops: [stopWith(1, 'SUCCESSFUL'), ...today().stops.slice(1)] })],
    )
    renderPage()
    await screen.findByText('0 de 4 entregados')
    act(() => socket.fire('connect'))
    await waitFor(() => expect(listRoutes).toHaveBeenCalledTimes(2))

    act(() => socket.fire('order.status.updated', { data: { orderId: 'order-1' } }))

    expect(await screen.findByText('1 de 4 entregados')).toBeInTheDocument()
    expect(routeCard().getByText('Entregado')).toBeInTheDocument()
  })

  it('un evento repetido o atrasado no deshace el estado más reciente: manda lo que dice el servidor', async () => {
    const final = today({ stops: threeDeliveredOneFailed() })
    const listRoutes = mockApi([today()], [final])
    renderPage()
    await screen.findByText('0 de 4 entregados')
    act(() => socket.fire('connect'))
    expect(await screen.findByText('3 de 4 entregados')).toBeInTheDocument()

    // Llega tarde un aviso de la primera entrega (y repetido): solo provoca otra consulta.
    act(() => {
      socket.fire('order.status.updated', { data: { orderId: 'order-1', status: 'IN_TRANSIT' } })
      socket.fire('order.status.updated', { data: { orderId: 'order-1', status: 'IN_TRANSIT' } })
    })

    await waitFor(() => expect(listRoutes).toHaveBeenCalledTimes(3))
    expect(screen.getByText('3 de 4 entregados')).toBeInTheDocument()
  })

  it('al perder la conexión lo avisa; al recuperarla consulta de nuevo y toma el estado del servidor', async () => {
    const listRoutes = mockApi([today()], [today()], [today({ stops: threeDeliveredOneFailed() })])
    renderPage()
    await screen.findByText('0 de 4 entregados')
    act(() => socket.fire('connect'))
    await waitFor(() => expect(listRoutes).toHaveBeenCalledTimes(2))

    act(() => socket.fire('disconnect', 'transport close'))
    expect(await screen.findByText(/Conexión perdida: reintentando/)).toBeInTheDocument()

    // Mientras no había conexión se perdieron eventos: al volver, el estado sale de GET.
    act(() => socket.fire('connect'))

    expect(await screen.findByText(/Conexión recuperada/)).toBeInTheDocument()
    expect(await screen.findByText('3 de 4 entregados')).toBeInTheDocument()
  })

  it('si el servidor cierra la conexión ofrece reconectar', async () => {
    mockApi([today()])
    const { user } = renderPage()
    await screen.findByText('0 de 4 entregados')
    act(() => socket.fire('connect'))

    act(() => socket.fire('disconnect', 'io server disconnect'))
    await user.click(await screen.findByRole('button', { name: 'Reconectar' }))

    expect(socket.connect).toHaveBeenCalledTimes(2)
  })

  it('avisa cuando el backend rechaza seguir algún recurso', async () => {
    socket = createFakeSocket((payload) =>
      (payload as { resource: string }).resource === 'incidents'
        ? { ok: false, error: 'FORBIDDEN' }
        : { ok: true },
    )
    mockApi([today()])
    renderPage()
    await screen.findByText('0 de 4 entregados')

    act(() => socket.fire('connect'))

    expect(await screen.findByText(/No tienes permiso para seguir 1 recurso/)).toBeInTheDocument()
  })

  it('si no hay rutas con chofer hoy lo indica', async () => {
    mockApi([])
    renderPage()

    expect(await screen.findByText('Hoy no hay rutas con chofer para seguir.')).toBeInTheDocument()
  })

  it('si no se puede cargar lo dice y permite reintentar', async () => {
    mockApi()
    vi.spyOn(monitorService, 'listRoutes')
      .mockRejectedValueOnce(createHttpError(500))
      .mockResolvedValue([today()])
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('0 de 4 entregados')).toBeInTheDocument()
  })
})
