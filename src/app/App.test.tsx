import { act, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dispatchService } from '../features/dispatch/dispatchService'
import { monitorService } from '../features/monitor/monitorService'
import { createFakeSocket } from '../test/fakeSocket'
import { planningService } from '../features/planning/planningService'
import { driversService } from '../features/planning/driversService'
import { ordersService } from '../features/orders/ordersService'
import { productsService } from '../features/products/productsService'
import { zonesService } from '../features/zones/zonesService'
import { authStorage } from '../lib/auth/authStorage'
import { handleResponseError } from '../lib/http/apiClient'
import { adminSession } from '../test/fixtures'
import { mockDashboardServices } from '../test/dashboardMocks'
import { createHttpError } from '../test/http'
import { renderWithProviders } from '../test/renderWithProviders'
import { App } from './App'
import { paths } from './paths'

// La pantalla de seguimiento abre una conexión en tiempo real: aquí se simula.
vi.mock('../lib/realtime/realtimeClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/realtime/realtimeClient')>()),
  createRealtimeSocket: () => createFakeSocket(),
}))

const homeHeading = () => screen.queryByRole('heading', { name: 'Sistema de Logística' })
const loginHeading = () => screen.queryByRole('heading', { name: 'Iniciar sesión' })

describe('App', () => {
  beforeEach(mockDashboardServices)

  it('redirige al login cuando no hay sesión', () => {
    renderWithProviders(<App />, { route: paths.home })

    expect(loginHeading()).toBeInTheDocument()
    expect(homeHeading()).not.toBeInTheDocument()
  })

  it('muestra el inicio con el encabezado del usuario cuando hay sesión', () => {
    renderWithProviders(<App />, { route: paths.home, session: adminSession })

    expect(homeHeading()).toBeInTheDocument()
    expect(screen.getByRole('banner')).toHaveTextContent(adminSession.user.name)
  })

  it('cierra sesión desde el encabezado y vuelve al login', async () => {
    const { user } = renderWithProviders(<App />, { route: paths.home, session: adminSession })

    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(loginHeading()).toBeInTheDocument()
    expect(authStorage.getSession()).toBeNull()
  })

  it('cierra sesión automáticamente cuando el backend rechaza el token', async () => {
    renderWithProviders(<App />, { route: paths.home, session: adminSession })
    const expiredToken = createHttpError(401, {
      requestHeaders: { Authorization: `Bearer ${adminSession.token}` },
    })

    await act(() => handleResponseError(expiredToken).catch(() => undefined))

    expect(loginHeading()).toBeInTheDocument()
    expect(authStorage.getSession()).toBeNull()
  })

  it.each([
    { link: 'Pedidos', heading: 'Pedidos' },
    { link: 'Planificación', heading: 'Planificación de rutas' },
    { link: 'Urgencias', heading: 'Urgencias' },
    { link: 'Entregas fallidas', heading: 'Entregas fallidas' },
    { link: 'Seguimiento', heading: 'Seguimiento de rutas' },
    { link: 'Zonas', heading: 'Zonas de entrega' },
    { link: 'Productos', heading: 'Productos' },
  ])(
    'navega a $link desde el menú principal y marca la opción activa',
    async ({ link, heading }) => {
      vi.spyOn(zonesService, 'list').mockResolvedValue([])
      vi.spyOn(productsService, 'list').mockResolvedValue([])
      vi.spyOn(dispatchService, 'inbox').mockResolvedValue({
        date: '2030-02-14',
        urgencies: [],
        failedDeliveries: [],
      })
      vi.spyOn(dispatchService, 'audit').mockResolvedValue([])
      vi.spyOn(planningService, 'listRoutes').mockResolvedValue([])
      vi.spyOn(monitorService, 'listRoutes').mockResolvedValue([])
      vi.spyOn(driversService, 'list').mockResolvedValue([])
      vi.spyOn(ordersService, 'list').mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
      })
      const { user } = renderWithProviders(<App />, { route: paths.home, session: adminSession })
      const nav = screen.getByRole('navigation', { name: 'Principal' })

      await user.click(within(nav).getByRole('link', { name: link }))

      expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
      expect(within(nav).getByRole('link', { name: link })).toHaveAttribute('aria-current', 'page')
    },
  )

  it('muestra la página 404 en rutas desconocidas', () => {
    renderWithProviders(<App />, { route: '/ruta-inexistente' })

    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
  })
})
