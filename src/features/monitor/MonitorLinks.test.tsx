import { act, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import {
  emergencyRoutePath,
  failedDeliveryPath,
  monitorRoutePath,
  orderReceiptPath,
} from '../../app/paths'
import { failedDelivery } from '../../test/dispatchFixtures'
import { createFakeSocket } from '../../test/fakeSocket'
import { adminSession, guestOrder } from '../../test/fixtures'
import { createHttpError } from '../../test/http'
import { monitorRoute, stopWith } from '../../test/monitorFixtures'
import { availableDriver } from '../../test/planningFixtures'
import { renderWithProviders } from '../../test/renderWithProviders'
import { shopSettings } from '../../test/shopFixtures'
import { dispatchService } from '../dispatch/dispatchService'
import { isGoneEmergency, loadEmergencies } from '../emergencies/emergencyBoard'
import type { RouteEmergencyDetail } from '../emergencies/types'
import { ordersService } from '../orders/ordersService'
import { driversService } from '../planning/driversService'
import { shopService } from '../shop/shopService'
import { loadMonitorBoard, pageOfRoute } from './monitorBoard'
import { MonitorRouteCard } from './MonitorRouteCard'
import { monitorService } from './monitorService'
import type { MonitorRoute } from './types'

/** Una sola conexión simulada por pantalla: los avisos solo piden volver a consultar REST. */
let socket = createFakeSocket()
vi.mock('../../lib/realtime/realtimeClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/realtime/realtimeClient')>()),
  createRealtimeSocket: () => socket,
}))

const TODAY = new Date().toISOString()
const route = (id: string, overrides: Partial<MonitorRoute> = {}) =>
  monitorRoute({ id, date: TODAY, createdAt: `2026-10-21T12:0${id.slice(-1)}:00Z`, ...overrides })

const emergency = (routeId: string, id = `em-${routeId}`): RouteEmergencyDetail =>
  ({
    id,
    routeId,
    reason: 'Choque leve',
    declaredAt: '2030-02-14T15:00:00Z',
    declaredById: 'admin-1',
    closedAt: null,
    closedById: null,
    closeReason: null,
    driverId: 'driver-1',
    returnedAt: null,
    returnedById: null,
    counts: {
      totalUnits: 0,
      recoveredUnits: 0,
      lostPreparedUnits: 0,
      lostPendingUnits: 0,
      pendingUnits: 0,
    },
    pendingUnits: [],
    units: [],
  }) as unknown as RouteEmergencyDetail

function mockMonitor(
  routes: MonitorRoute[],
  extra: { failed?: string[]; emergencies?: string[] } = {},
) {
  const listRoutes = vi.spyOn(monitorService, 'listRoutes').mockResolvedValue(routes)
  vi.spyOn(driversService, 'list').mockResolvedValue([availableDriver])
  vi.spyOn(dispatchService, 'inbox').mockResolvedValue({
    date: '2030-02-14',
    urgencies: [],
    failedDeliveries: (extra.failed ?? []).map((orderId) => failedDelivery(orderId)),
  })
  vi.spyOn(dispatchService, 'emergencies').mockResolvedValue(
    (extra.emergencies ?? []).map((routeId) => emergency(routeId)),
  )
  return { listRoutes }
}

beforeEach(() => {
  socket = createFakeSocket()
})

describe('Seguimiento · enlaces por id estable (#67)', () => {
  it('cada parada enlaza a su pedido y, si tiene un caso, a Entregas fallidas; la ruta, a su emergencia', () => {
    const interrupted = route('r1', {
      status: 'INTERRUPTED',
      stops: [stopWith(1, 'FAILED', 'RECIPIENT_ABSENT'), stopWith(2, 'SUCCESSFUL')],
    })
    render(
      <MemoryRouter>
        <MonitorRouteCard
          route={interrupted}
          name="Ruta 1"
          driver={availableDriver}
          links={{
            failedOrderIds: new Set([interrupted.stops[0].orderId]),
            emergencyByRoute: new Map([['r1', 'em-r1']]),
          }}
        />
      </MemoryRouter>,
    )

    const [failedStop, deliveredStop] = screen.getAllByRole('listitem').map((item) => within(item))
    expect(failedStop.getByRole('link', { name: /Ver pedido/ })).toHaveAttribute(
      'href',
      orderReceiptPath(interrupted.stops[0].orderId),
    )
    expect(failedStop.getByRole('link', { name: /entrega fallida/ })).toHaveAttribute(
      'href',
      failedDeliveryPath(interrupted.stops[0].orderId),
    )
    expect(deliveredStop.queryByRole('link', { name: /entrega fallida/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'su emergencia' })).toHaveAttribute(
      'href',
      emergencyRoutePath('r1'),
    )
  })

  it('si no se pudieron consultar los casos, el tablero sigue funcionando sin esos enlaces', async () => {
    mockMonitor([route('r1')])
    vi.spyOn(dispatchService, 'inbox').mockRejectedValue(new Error('sin red'))

    const board = await loadMonitorBoard()

    expect(board.routes).toHaveLength(1)
    expect(board.links).toBeNull()
  })

  it('la página de una ruta sale de su id aunque las rutas cambien de orden', () => {
    const routes = ['a', 'b', 'c'].map((id, index) => ({
      route: route(id),
      name: `Ruta ${index + 1}`,
    }))
    expect(pageOfRoute(routes, 'c', 2)).toBe(1)
    expect(pageOfRoute([...routes].reverse(), 'c', 2)).toBe(0)
    expect(pageOfRoute(routes, 'zzz', 2)).toBeNull()
  })

  it('con ?ruta= abre la página de esa ruta, la resalta y la recuerda tras una recarga en vivo', async () => {
    const routes = ['r1', 'r2', 'r3'].map((id) => route(id))
    const { listRoutes } = mockMonitor(routes)
    const { user } = renderWithProviders(<App />, {
      route: monitorRoutePath('r3'),
      session: adminSession,
    })

    const target = await screen.findByRole('article', { name: 'Ruta 3 · FIC-02' })
    expect(target).toHaveAttribute('aria-current', 'true')
    expect(screen.queryByRole('article', { name: 'Ruta 1 · FIC-02' })).not.toBeInTheDocument()

    // Un aviso en vivo recarga por REST: la ruta enlazada sigue a la vista.
    act(() => socket.fire('connect'))
    act(() => socket.fire('route.updated', { data: { routeId: 'r3' } }))
    await waitFor(() => expect(listRoutes.mock.calls.length).toBeGreaterThanOrEqual(2))
    expect(await screen.findByRole('article', { name: 'Ruta 3 · FIC-02' })).toBeInTheDocument()

    // Al navegar por su cuenta se suelta la selección del enlace.
    await user.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(await screen.findByRole('article', { name: 'Ruta 1 · FIC-02' })).toBeInTheDocument()
  })

  it('un enlace a una ruta que ya no está ofrece una salida clara; si se canceló, lo explica', async () => {
    mockMonitor([
      route('r1'),
      route('r9', { status: 'CANCELLED', cancelReason: 'Vehículo con avería' }),
    ])
    renderWithProviders(<App />, { route: monitorRoutePath('r9'), session: adminSession })

    expect(
      await screen.findByText(/Esa ruta se canceló antes de salir \(motivo: Vehículo con avería\)/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Hoy se canceló 1 ruta antes de salir/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Revisar en Planificación' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Ruta 1 · FIC-02' })).toBeInTheDocument()
  })

  it('una cancelación en vivo saca la ruta del tablero sin recarga manual y sin abrir otra conexión', async () => {
    const { listRoutes } = mockMonitor([route('r1')])
    renderWithProviders(<App />, { route: '/admin/seguimiento', session: adminSession })
    expect(await screen.findByRole('article', { name: 'Ruta 1 · FIC-02' })).toBeInTheDocument()
    act(() => socket.fire('connect'))

    listRoutes.mockResolvedValue([route('r1', { status: 'CANCELLED' })])
    act(() => socket.fire('route.updated', { data: { routeId: 'r1', status: 'CANCELLED' } }))

    expect(await screen.findByText(/Hoy se canceló 1 ruta antes de salir/)).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Ruta 1 · FIC-02' })).not.toBeInTheDocument()
    expect(socket.connect).toHaveBeenCalledTimes(1)
  })
})

describe('Entregas fallidas · selección por pedido (#67)', () => {
  const orderOf = (id: string, address: string) => ({ ...guestOrder, id, deliveryAddress: address })

  function mockInbox(orderIds: string[]) {
    vi.spyOn(dispatchService, 'inbox').mockResolvedValue({
      date: '2030-02-15',
      urgencies: [],
      failedDeliveries: orderIds.map((id) => failedDelivery(id, { routeId: 'route-x' })),
    })
    vi.spyOn(monitorService, 'listRoutes').mockResolvedValue([])
    vi.spyOn(dispatchService, 'audit').mockResolvedValue([])
    vi.spyOn(ordersService, 'get').mockImplementation(async (id) =>
      orderOf(id, `Casa ${id.toUpperCase()}`),
    )
    vi.spyOn(shopService, 'settings').mockResolvedValue(shopSettings())
  }

  it('?pedido= selecciona ese caso aunque no sea el primero, con enlace a su pedido', async () => {
    mockInbox(['a', 'b', 'c'])
    renderWithProviders(<App />, { route: failedDeliveryPath('c'), session: adminSession })

    const card = within(await screen.findByRole('article', { name: 'Entrega fallida Casa C' }))
    expect(screen.getByText('Falla 3')).toBeInTheDocument()
    expect(card.getByRole('link', { name: 'Ver pedido' })).toHaveAttribute(
      'href',
      orderReceiptPath('c'),
    )
  })

  it('si el caso ya no está pendiente lo explica, enlaza al pedido y deja ver los demás', async () => {
    mockInbox(['a'])
    const { user } = renderWithProviders(<App />, {
      route: failedDeliveryPath('resuelto'),
      session: adminSession,
    })

    expect(
      await screen.findByText(/Ese pedido ya no tiene una entrega fallida pendiente de gestión/),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver el pedido' })).toHaveAttribute(
      'href',
      orderReceiptPath('resuelto'),
    )
    await user.click(screen.getByRole('button', { name: 'Ver los pendientes' }))
    expect(screen.queryByText(/Ese pedido ya no tiene/)).not.toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Entrega fallida Casa A' })).toBeInTheDocument()
  })
})

describe('Emergencias · selección por ruta y destinos inexistentes (#67)', () => {
  function mockEmergencies(routeIds: string[], gone: string[] = []) {
    vi.spyOn(dispatchService, 'emergencies').mockResolvedValue(routeIds.map((id) => emergency(id)))
    vi.spyOn(dispatchService, 'routeEmergency').mockImplementation(async (routeId) => {
      if (gone.includes(routeId)) {
        throw createHttpError(404, {
          data: { statusCode: 404, code: 'ROUTE_EMERGENCY_NOT_FOUND', message: 'x' },
        })
      }
      return emergency(routeId)
    })
    vi.spyOn(monitorService, 'listRoutes').mockResolvedValue([])
    vi.spyOn(ordersService, 'get').mockResolvedValue(guestOrder)
  }

  it('?ruta= abre la emergencia de esa ruta, con enlace de vuelta a Seguimiento', async () => {
    mockEmergencies(['ra', 'rb'])
    renderWithProviders(<App />, { route: emergencyRoutePath('rb'), session: adminSession })

    expect(await screen.findByText('Emergencia 2')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver la ruta en Seguimiento' })).toHaveAttribute(
      'href',
      monitorRoutePath('rb'),
    )
  })

  it('una ruta sin emergencia se explica, y un 404 del detalle no rompe el tablero', async () => {
    mockEmergencies(['ra', 'rgone'], ['rgone'])
    renderWithProviders(<App />, { route: emergencyRoutePath('rgone'), session: adminSession })

    expect(
      await screen.findByText(/Esa ruta no tiene una emergencia registrada o la ruta ya no existe/),
    ).toBeInTheDocument()
    // Solo queda la emergencia que sí existe; la del 404 se omite sin romper la pantalla.
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('article', { name: /Emergencia de Ruta ra/ })).toBeInTheDocument()
  })

  it('solo omite los 404 de una emergencia que ya no está; otros errores se informan', async () => {
    expect(
      isGoneEmergency(createHttpError(404, { data: { code: 'ROUTE_NOT_FOUND', message: 'x' } })),
    ).toBe(true)
    expect(isGoneEmergency(createHttpError(500))).toBe(false)

    vi.spyOn(dispatchService, 'emergencies').mockResolvedValue([emergency('ra')])
    vi.spyOn(dispatchService, 'routeEmergency').mockRejectedValue(createHttpError(500))
    vi.spyOn(monitorService, 'listRoutes').mockResolvedValue([])
    await expect(loadEmergencies()).rejects.toBeDefined()
  })
})
