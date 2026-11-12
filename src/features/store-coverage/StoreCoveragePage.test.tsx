import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { paths } from '../../app/paths'
import { AREA, STORE, savedCoverage } from '../../test/coverageFixtures'
import { mockDashboardServices } from '../../test/dashboardMocks'
import { adminSession } from '../../test/fixtures'
import { createHttpError } from '../../test/http'
import { renderWithProviders } from '../../test/renderWithProviders'
import type { GeoPoint } from '../../types/geo'
import type { MapMode, Probe } from './CoverageMap'
import { coverageService } from './coverageService'
import type { ConfiguredStoreCoverage, CoverageDraft } from './types'

/**
 * Leaflet no se dibuja en jsdom: el mapa se reemplaza por botones que disparan los mismos
 * eventos (clic en un punto, arrastrar la tienda o un vértice) y muestran lo que se dibujaría.
 */
const clicks = vi.hoisted(() => ({ next: [] as GeoPoint[] }))

vi.mock('./CoverageMap', () => ({
  CoverageMap: (props: {
    mode: MapMode
    draft: CoverageDraft
    saved: ConfiguredStoreCoverage | null
    probe: Probe | null
    onMapClick: (point: GeoPoint) => void
    onMoveStore: (point: GeoPoint) => void
    onMoveVertex: (index: number, point: GeoPoint) => void
  }) => (
    <div data-testid="map" data-mode={props.mode}>
      <span data-testid="saved-shape">{props.saved ? 'guardada' : 'sin guardar'}</span>
      <span data-testid="probe">{props.probe?.position ?? (props.probe ? 'consultando' : '')}</span>
      <button type="button" onClick={() => props.onMapClick(clicks.next.shift()!)}>
        Clic en el mapa
      </button>
      <button type="button" onClick={() => props.onMoveVertex(0, { lat: -1.28, lng: -78.64 })}>
        Arrastrar punto 1
      </button>
    </div>
  ),
}))

const renderPage = () =>
  renderWithProviders(<App />, { route: paths.storeCoverage, session: adminSession })

const clickMap = async (user: ReturnType<typeof renderPage>['user'], ...points: GeoPoint[]) => {
  for (const point of points) {
    clicks.next.push(point)
    await user.click(screen.getByRole('button', { name: 'Clic en el mapa' }))
  }
}

const saveButton = () => screen.getByRole('button', { name: 'Guardar tienda y cobertura' })
const vertexList = () => screen.getByRole('list', { name: 'Puntos del área en orden' })

describe('ADMIN · tienda y cobertura', () => {
  it('sin configuración no inventa tienda ni área y no deja probar puntos', async () => {
    vi.spyOn(coverageService, 'get').mockResolvedValue({ configured: false })
    renderPage()

    expect(
      await screen.findByText(/Todavía no hay tienda ni cobertura guardadas/),
    ).toBeInTheDocument()
    expect(screen.getByText('Sin ubicar.')).toBeInTheDocument()
    expect(screen.getByText(/Sin puntos/)).toBeInTheDocument()
    expect(screen.getByTestId('saved-shape')).toHaveTextContent('sin guardar')
    expect(screen.getByRole('radio', { name: 'Probar un punto' })).toBeDisabled()
    expect(saveButton()).toBeDisabled()
  })

  it('ubica la tienda, dibuja el área, guarda y muestra lo que confirmó el servidor', async () => {
    vi.spyOn(coverageService, 'get').mockResolvedValue({ configured: false })
    const save = vi.spyOn(coverageService, 'save').mockResolvedValue(savedCoverage())
    const { user } = renderPage()
    await screen.findByText(/Todavía no hay tienda/)

    await clickMap(user, STORE)
    await user.click(screen.getByRole('radio', { name: 'Dibujar área' }))
    await clickMap(user, ...AREA)

    expect(screen.getByText(/Cambios sin guardar/)).toBeInTheDocument()
    expect(within(vertexList()).getAllByRole('listitem')).toHaveLength(4)

    await user.click(saveButton())

    expect(save).toHaveBeenCalledWith({
      location: STORE,
      coverage: savedCoverage().coverage,
    })
    expect(
      await screen.findByText('Guardado. Esta es ahora la tienda y la cobertura activa.'),
    ).toBeInTheDocument()
    expect(screen.getByText(/Cobertura activa guardada el/)).toBeInTheDocument()
    expect(screen.getByTestId('saved-shape')).toHaveTextContent('guardada')
    expect(saveButton()).toBeDisabled()
  })

  it('con menos de 3 puntos no envía nada y explica qué falta', async () => {
    vi.spyOn(coverageService, 'get').mockResolvedValue({ configured: false })
    const save = vi.spyOn(coverageService, 'save')
    const { user } = renderPage()
    await screen.findByText(/Todavía no hay tienda/)

    await clickMap(user, STORE)
    await user.click(screen.getByRole('radio', { name: 'Dibujar área' }))
    await clickMap(user, AREA[0], AREA[1])
    await user.click(saveButton())

    expect(screen.getByRole('alert')).toHaveTextContent(/al menos 3 puntos; ahora tiene 2/)
    expect(save).not.toHaveBeenCalled()
  })

  it('si el servidor rechaza el área conserva el dibujo y no la presenta como activa', async () => {
    vi.spyOn(coverageService, 'get').mockResolvedValue(savedCoverage())
    vi.spyOn(coverageService, 'save').mockRejectedValue(
      createHttpError(400, {
        data: { error: { code: 'STORE_COVERAGE_INVALID', message: 'x', details: {} } },
      }),
    )
    const { user } = renderPage()
    await screen.findByText(/Cobertura activa guardada el/)

    await user.click(screen.getByRole('radio', { name: 'Dibujar área' }))
    await user.click(screen.getByRole('button', { name: 'Arrastrar punto 1' }))
    await user.click(saveButton())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/lados no se crucen/)
    expect(alert).toHaveTextContent(/la cobertura activa sigue siendo la anterior/)
    expect(
      screen.getByText(/Cambios sin guardar\. La cobertura activa sigue siendo/),
    ).toBeInTheDocument()
    expect(within(vertexList()).getByText('-1.280000, -78.640000')).toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
  })

  it('sin permisos lo explica y no da por guardado nada', async () => {
    vi.spyOn(coverageService, 'get').mockResolvedValue(savedCoverage())
    vi.spyOn(coverageService, 'save').mockRejectedValue(createHttpError(403))
    const { user } = renderPage()
    await screen.findByText(/Cobertura activa guardada el/)

    await user.click(screen.getByRole('radio', { name: 'Dibujar área' }))
    await user.click(screen.getByRole('button', { name: 'Quitar punto 4' }))
    await user.click(saveButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(/Solo un ADMIN/)
    expect(screen.queryByText(/Guardado\. Esta es ahora/)).not.toBeInTheDocument()
  })

  it('deshacer, borrar y descartar vuelven a lo guardado sin llamar al servidor', async () => {
    vi.spyOn(coverageService, 'get').mockResolvedValue(savedCoverage())
    const save = vi.spyOn(coverageService, 'save')
    const { user } = renderPage()
    await screen.findByText(/Cobertura activa guardada el/)

    await user.click(screen.getByRole('button', { name: 'Deshacer último punto' }))
    expect(within(vertexList()).getAllByRole('listitem')).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: 'Borrar área' }))
    expect(screen.getByText(/Sin puntos/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Descartar cambios' }))

    expect(within(vertexList()).getAllByRole('listitem')).toHaveLength(4)
    expect(screen.getByText(/Cobertura activa guardada el/)).toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
  })

  it('prueba un punto contra la cobertura guardada y muestra la respuesta del servidor', async () => {
    vi.spyOn(coverageService, 'get').mockResolvedValue(savedCoverage())
    const evaluate = vi
      .spyOn(coverageService, 'evaluate')
      .mockResolvedValueOnce({ accepted: true, position: 'BOUNDARY' })
      .mockResolvedValueOnce({ accepted: false, position: 'EXTERIOR' })
    const { user } = renderPage()
    await screen.findByText(/Cobertura activa guardada el/)

    expect(screen.getByTestId('map')).toHaveAttribute('data-mode', 'probe')
    await clickMap(user, { lat: -1.27, lng: -78.615 })
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('BOUNDARY'))
    await clickMap(user, { lat: -1.3, lng: -78.7 })
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('EXTERIOR'))

    expect(evaluate).toHaveBeenCalledWith({ lat: -1.27, lng: -78.615 })
    expect(screen.queryByText(/Cambios sin guardar/)).not.toBeInTheDocument()
  })

  it('si no puede consultar un punto lo dice sin inventar un resultado', async () => {
    vi.spyOn(coverageService, 'get').mockResolvedValue(savedCoverage())
    vi.spyOn(coverageService, 'evaluate').mockRejectedValue(
      createHttpError(409, {
        data: { error: { code: 'STORE_NOT_CONFIGURED', message: 'x', details: {} } },
      }),
    )
    const { user } = renderPage()
    await screen.findByText(/Cobertura activa guardada el/)

    await clickMap(user, STORE)

    expect(await screen.findByRole('alert')).toHaveTextContent(/guárdalas antes de probar/)
    expect(screen.getByTestId('probe')).toBeEmptyDOMElement()
  })

  it('si no carga la configuración lo dice y permite reintentar', async () => {
    const get = vi.spyOn(coverageService, 'get').mockRejectedValueOnce(createHttpError(500))
    get.mockResolvedValueOnce(savedCoverage())
    const { user } = renderPage()

    expect(
      await screen.findByText('No se pudo cargar la tienda y la cobertura'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText(/Cobertura activa guardada el/)).toBeInTheDocument()
  })

  it('aparece en el menú del panel, dentro de Territorio', () => {
    mockDashboardServices()
    vi.spyOn(coverageService, 'get').mockResolvedValue({ configured: false })
    renderPage()

    const nav = screen.getByRole('navigation', { name: 'Principal' })
    expect(within(nav).getByRole('link', { name: 'Tienda y cobertura' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})
