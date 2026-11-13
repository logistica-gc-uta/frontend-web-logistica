import { render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { paths } from '../../app/paths'
import { formatDuration } from '../../lib/format/formatDistance'
import { describePlanningReason } from '../../lib/planning/planningReasons'
import { adminSession, zones } from '../../test/fixtures'
import { createHttpError } from '../../test/http'
import { firstProposal, proposalsResponse } from '../../test/planningFixtures'
import { renderWithProviders } from '../../test/renderWithProviders'
import { zonesService } from '../zones/zonesService'
import { DistanceNotice } from './DistanceNotice'
import { driversService } from './driversService'
import { planningService } from './planningService'
import { ProposalCard } from './ProposalCard'
import { describeRoadError, ROAD_ERROR_SAFE } from './roadErrors'
import type { RoadEngineStatus, RouteProposal, RouteProposalsResponse } from './types'

/** Lo que recibe el mapa: se guarda para revisar si llegó el trazado por calles. */
const mapProps = vi.hoisted(() => ({ routes: [] as { id: string; trace?: unknown[] }[] }))
vi.mock('../../components/map/RoutesMap', () => ({
  RoutesMap: ({ routes }: { routes: { id: string; trace?: unknown[] }[] }) => {
    mapProps.routes = routes
    return <div data-testid="routes-map" />
  },
}))

const engine = (patch: Partial<RoadEngineStatus> = {}): RoadEngineStatus => ({
  engine: 'OSRM',
  configured: true,
  available: true,
  profile: 'car',
  latencyMs: 12,
  checkedAt: '2030-02-14T12:00:00Z',
  message: 'Motor vial disponible',
  ...patch,
})

/** La primera propuesta medida por calles: 3 paradas con sus tramos y el regreso. */
const roadProposal: RouteProposal = {
  ...firstProposal,
  totalDistanceKm: 4.213,
  straightLineKm: 3.01,
  totalDurationSeconds: 812,
  returnLegDistanceKm: 1.9,
  returnLegDurationSeconds: 260,
  stops: firstProposal.stops.map((stop, index) => ({
    ...stop,
    legDistanceKm: [1.482, 0.4, 0.431][index],
    legDurationSeconds: [214, 60, 278][index],
  })),
  geometry: {
    type: 'LineString',
    coordinates: [
      [-78.62, -1.24],
      [-78.61, -1.25],
      [-78.62, -1.24],
    ],
  },
}

const roadResponse: RouteProposalsResponse = {
  ...proposalsResponse,
  distanceMethod: 'OSRM_ROAD_NETWORK',
  roadMetrics: {
    provider: 'OSRM',
    profile: 'car',
    distanceUnit: 'km',
    durationUnit: 's',
    directional: true,
    trafficAware: false,
    estimate: true,
    maxSnapDistanceM: 500,
  },
  proposals: [roadProposal],
}

const roadError = (status: number, code: string, details: Record<string, unknown> = {}) =>
  createHttpError(status, { data: { statusCode: status, error: 'x', code, message: 'x', details } })

const mockPage = (status: RoadEngineStatus = engine()) => {
  vi.spyOn(zonesService, 'list').mockResolvedValue(zones)
  vi.spyOn(planningService, 'listRoutes').mockResolvedValue([])
  vi.spyOn(driversService, 'list').mockResolvedValue([])
  vi.spyOn(driversService, 'listForDay').mockResolvedValue([])
  const roadEngine = vi.spyOn(planningService, 'roadEngine').mockResolvedValue(status)
  const proposals = vi.spyOn(planningService, 'getProposals').mockResolvedValue(roadResponse)
  return { roadEngine, proposals }
}

const renderPlanning = () =>
  renderWithProviders(<App />, { route: paths.planning, session: adminSession })

const preview = async (user: ReturnType<typeof renderPlanning>['user']) => {
  await screen.findByRole('option', { name: /Ficoa/ })
  await user.click(screen.getByRole('button', { name: 'Previsualizar rutas' }))
}

describe('motor vial · formato y errores', () => {
  it('la duración se redondea al minuto y siempre se marca como estimada', () => {
    expect(formatDuration(214)).toBe('≈ 4 min')
    expect(formatDuration(10)).toBe('≈ 1 min')
    expect(formatDuration(3_900)).toBe('≈ 1 h 05 min')
  })

  it('explica cada rechazo del motor, cuenta los pedidos afectados y aclara que nada cambió', () => {
    expect(describeRoadError(roadError(503, 'ROAD_ENGINE_UNAVAILABLE'))).toBe(
      `El motor vial no responde ahora, así que no se pueden calcular recorridos por calles. Vuelve a intentarlo en unos minutos. ${ROAD_ERROR_SAFE}`,
    )
    expect(
      describeRoadError(roadError(422, 'ROAD_POINT_OFF_NETWORK', { orderIds: ['o1', 'o2'] })),
    ).toMatch(/lejos de cualquier calle\. Pedidos afectados: 2\. Revisa su ubicación en Pedidos\./)
    expect(describeRoadError(roadError(422, 'ROAD_MATRIX_TOO_LARGE'))).toMatch(/planifica por zona/)
    expect(describeRoadError(roadError(502, 'ROAD_ENGINE_BAD_RESPONSE'))).toMatch(/incompletos/)
    expect(describeRoadError(roadError(422, 'ROAD_ROUTE_NOT_FOUND'))).toMatch(/No hay un recorrido/)
    expect(describeRoadError(createHttpError(500))).toBeNull()
    expect(describeRoadError(new Error('x'))).toBeNull()
  })

  it('una urgencia bloqueada por el motor explica el motivo', () => {
    expect(describePlanningReason('ROAD_ENGINE_UNAVAILABLE')).toBe(
      'el motor vial no responde: no se puede medir por calles ahora',
    )
  })
})

describe('motor vial · avisos y tarjeta', () => {
  it('con red vial el aviso habla de calles y duraciones estimadas sin tráfico en vivo', () => {
    render(<DistanceNotice method="OSRM_ROAD_NETWORK" />)

    const notice = screen.getByRole('note')
    expect(notice).toHaveTextContent('Distancias y duraciones estimadas por calles')
    expect(notice).toHaveTextContent('sin tráfico en vivo')
    expect(notice).toHaveTextContent('no es una hora de llegada garantizada')
  })

  it('la tarjeta muestra km por calles, la línea recta, la duración y cada tramo', () => {
    render(
      <ProposalCard
        proposal={roadProposal}
        label="Ruta 1"
        color="#2563eb"
        capacity={4}
        method="OSRM_ROAD_NETWORK"
        isSelected={false}
        confirmation={undefined}
        onSelect={() => {}}
        onConfirm={() => {}}
      />,
    )

    const card = within(screen.getByRole('article', { name: 'Ruta 1' }))
    expect(card.getByText('Distancia por calles').nextSibling).toHaveTextContent('4,21 km')
    expect(card.getByText('En línea recta').nextSibling).toHaveTextContent('3,01 km')
    expect(card.getByText('Duración estimada').nextSibling).toHaveTextContent('≈ 14 min')
    const stops = card.getAllByRole('listitem')
    expect(stops[0]).toHaveTextContent('1,48 km, ≈ 4 min desde el depósito')
    expect(stops[1]).toHaveTextContent('0,40 km, ≈ 1 min desde la parada anterior')
    expect(card.getByText(/Regreso al depósito/)).toHaveTextContent(
      'Regreso al depósito: 1,90 km, ≈ 4 min',
    )
  })

  it('sin motor vial la tarjeta no muestra duración ni tramos', () => {
    render(
      <ProposalCard
        proposal={firstProposal}
        label="Ruta 1"
        color="#2563eb"
        capacity={4}
        method="HAVERSINE_STRAIGHT_LINE"
        isSelected={false}
        confirmation={undefined}
        onSelect={() => {}}
        onConfirm={() => {}}
      />,
    )

    expect(screen.getByText('Distancia en línea recta')).toBeInTheDocument()
    expect(screen.queryByText('Duración estimada')).not.toBeInTheDocument()
    expect(screen.queryByText(/Regreso al depósito/)).not.toBeInTheDocument()
  })
})

describe('motor vial · pantalla de planificación', () => {
  it('con el motor activo lo avisa, pide el trazado y lo pasa al mapa', async () => {
    const { proposals } = mockPage()
    const { user } = renderPlanning()

    expect(await screen.findByText('Motor vial activo.')).toBeInTheDocument()
    await preview(user)

    await screen.findByText('Km propuestos (por calles)')
    expect(proposals).toHaveBeenCalledTimes(1)
    expect(mapProps.routes[0].trace).toEqual([
      { lat: -1.24, lng: -78.62 },
      { lat: -1.25, lng: -78.61 },
      { lat: -1.24, lng: -78.62 },
    ])
  })

  it('con el motor desactivado avisa que se usa la línea recta', async () => {
    mockPage(engine({ engine: 'HAVERSINE', configured: false, profile: null }))
    renderPlanning()

    expect(await screen.findByText('Motor vial desactivado.')).toBeInTheDocument()
    expect(screen.getByText(/no muestra recorridos por calles/)).toBeInTheDocument()
  })

  it('si el motor no responde lo advierte y permite volver a comprobar', async () => {
    const { roadEngine } = mockPage(
      engine({ available: false, message: 'No se pudo conectar con el motor vial' }),
    )
    const { user } = renderPlanning()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('El motor vial no responde.')
    expect(alert).toHaveTextContent('no se usa la línea recta como reemplazo')
    expect(alert).toHaveTextContent('No se pudo conectar con el motor vial')
    roadEngine.mockResolvedValue(engine())
    await user.click(within(alert).getByRole('button', { name: 'Volver a comprobar' }))

    expect(await screen.findByText('Motor vial activo.')).toBeInTheDocument()
  })

  it('si el cálculo falla por el motor no inventa rutas y se puede reintentar', async () => {
    const { proposals } = mockPage()
    proposals.mockRejectedValueOnce(roadError(503, 'ROAD_ENGINE_UNAVAILABLE'))
    const { user } = renderPlanning()
    await preview(user)

    expect(await screen.findByText(/El motor vial no responde ahora/)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(ROAD_ERROR_SAFE))).toBeInTheDocument()
    expect(screen.queryByTestId('routes-map')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    await waitFor(() => expect(proposals).toHaveBeenCalledTimes(2))
    expect(await screen.findByTestId('routes-map')).toBeInTheDocument()
  })
})
