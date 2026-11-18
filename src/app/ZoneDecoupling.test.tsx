import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { savedCoverage } from '../test/coverageFixtures'
import { adminSession, orders, products } from '../test/fixtures'
import { emptyProposalsResponse } from '../test/planningFixtures'
import { renderWithProviders } from '../test/renderWithProviders'
import { shopSettings } from '../test/shopFixtures'
import { ordersService } from '../features/orders/ordersService'
import { driversService } from '../features/planning/driversService'
import { planningService } from '../features/planning/planningService'
import { productsService } from '../features/products/productsService'
import { shopService } from '../features/shop/shopService'
import { zonesService } from '../features/zones/zonesService'
import { App } from './App'
import { paths } from './paths'

beforeEach(() => {
  vi.spyOn(zonesService, 'list').mockRejectedValue(new Error('Legacy zones unavailable'))
  vi.spyOn(zonesService, 'create').mockRejectedValue(new Error('Legacy zones disabled'))
})

describe('Legacy zone decoupling', () => {
  it.each([paths.zones, '/zonas'])(
    'disables direct access to %s without loading zones',
    async (route) => {
      renderWithProviders(<App />, { route, session: adminSession })

      expect(
        await screen.findByRole('heading', { name: 'Página no encontrada' }),
      ).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Zonas' })).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Tienda y cobertura' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Pedidos' })).toBeInTheDocument()
      expect(zonesService.list).not.toHaveBeenCalled()
      expect(zonesService.create).not.toHaveBeenCalled()
    },
  )

  it.each([paths.zones, '/zonas'])('keeps authentication required for %s', async (route) => {
    renderWithProviders(<App />, { route })

    expect(await screen.findByRole('heading', { name: /Iniciar sesión/ })).toBeInTheDocument()
    expect(zonesService.list).not.toHaveBeenCalled()
  })

  it('loads sales and historical orders without requesting or filtering zones', async () => {
    vi.spyOn(productsService, 'list').mockResolvedValue(products)
    vi.spyOn(shopService, 'settings').mockResolvedValue(shopSettings())
    vi.spyOn(shopService, 'storeCoverage').mockResolvedValue(savedCoverage())
    const list = vi.spyOn(ordersService, 'list').mockResolvedValue({
      items: orders,
      total: orders.length,
      page: 1,
      pageSize: 10,
    })
    renderWithProviders(<App />, { route: paths.orders, session: adminSession })

    expect(await screen.findByRole('form', { name: 'Nueva venta' })).toBeInTheDocument()
    const filters = within(screen.getByRole('form', { name: 'Filtros de pedidos' }))
    expect(filters.queryByLabelText('Zona')).not.toBeInTheDocument()
    expect(filters.getByLabelText('Estado')).toBeInTheDocument()
    expect(filters.getByLabelText('Fecha de entrega')).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: 'Pedidos registrados' })).toHaveTextContent(
      'FIC-02',
    )
    expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 10 })
    expect(zonesService.list).not.toHaveBeenCalled()
  })

  it('previews by date without a zone service or selector', async () => {
    vi.spyOn(planningService, 'roadEngine').mockResolvedValue({
      engine: 'HAVERSINE',
      configured: false,
      available: true,
      profile: null,
      latencyMs: null,
      checkedAt: '2030-02-14T12:00:00Z',
      message: 'Motor vial desactivado',
    })
    vi.spyOn(planningService, 'listRoutes').mockResolvedValue([])
    vi.spyOn(driversService, 'listForDay').mockResolvedValue([])
    const proposals = vi
      .spyOn(planningService, 'getProposals')
      .mockResolvedValue(emptyProposalsResponse)
    const confirm = vi.spyOn(planningService, 'confirmRoute')
    const { user } = renderWithProviders(<App />, { route: paths.planning, session: adminSession })

    fireEvent.change(await screen.findByLabelText('Día a planificar'), {
      target: { value: '2030-02-14' },
    })
    expect(screen.queryByLabelText('Zona')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Previsualizar rutas' }))

    await waitFor(() => expect(proposals).toHaveBeenCalledWith({ date: '2030-02-14' }))
    expect(
      await screen.findByText('No hay pedidos pendientes para planificar en esta fecha.'),
    ).toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
    expect(zonesService.list).not.toHaveBeenCalled()
  })
})
