import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GeoPoint } from '../../types/geo'
import { MAX_ROUTES_DRAWN_AT_ONCE, RoutesMap, type MapRoute } from './RoutesMap'

/** Leaflet no se dibuja en jsdom: se simula react-leaflet con elementos que exponen sus propiedades. */
const leaflet = vi.hoisted(() => {
  // Como en react-leaflet, `useMap` devuelve siempre la misma instancia del mapa.
  const map = { fitBounds: vi.fn() }
  return { map, fitBounds: map.fitBounds }
})

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Marker: ({
    position,
    interactive,
    eventHandlers,
    children,
  }: {
    position: [number, number]
    interactive?: boolean
    eventHandlers?: { click?: () => void }
    children?: ReactNode
  }) => (
    <button
      type="button"
      data-testid={interactive === false ? 'depot-marker' : 'stop-marker'}
      data-position={position.join(',')}
      onClick={() => eventHandlers?.click?.()}
    >
      {children}
    </button>
  ),
  Polyline: ({
    positions,
    pathOptions,
    eventHandlers,
  }: {
    positions: [number, number][]
    pathOptions: { color: string; weight: number; opacity: number; dashArray?: string }
    eventHandlers?: { click?: () => void }
  }) => (
    <button
      type="button"
      data-testid={pathOptions.dashArray ? 'return-line' : 'route-line'}
      data-positions={JSON.stringify(positions)}
      data-color={pathOptions.color}
      data-weight={pathOptions.weight}
      data-opacity={pathOptions.opacity}
      onClick={() => eventHandlers?.click?.()}
    />
  ),
  useMap: () => leaflet.map,
}))

const depotA: GeoPoint = { lat: -1.249, lng: -78.632 }
const depotB: GeoPoint = { lat: -1.271, lng: -78.629 }

const makeRoute = (index: number, patch: Partial<MapRoute> = {}): MapRoute => ({
  id: `route-${index}`,
  label: `Ruta ${index + 1}`,
  color: `#00000${index % 10}`,
  depot: depotA,
  depotLabel: 'Depósito FIC-02',
  stops: [1, 2].map((sequence) => ({
    sequence,
    location: {
      lat: depotA.lat + index / 100 + sequence / 1000,
      lng: depotA.lng + sequence / 1000,
    },
    description: `Dirección ${index}-${sequence}`,
  })),
  ...patch,
})

const renderMap = (routes: MapRoute[], selectedId: string | null = null) => {
  const onSelect = vi.fn()
  render(<RoutesMap routes={routes} selectedId={selectedId} onSelect={onSelect} />)
  return { onSelect }
}

describe('RoutesMap', () => {
  beforeEach(() => leaflet.fitBounds.mockClear())

  it('dibuja el depósito una sola vez aunque varias rutas salgan de él', () => {
    renderMap([makeRoute(0), makeRoute(1)])

    const depots = screen.getAllByTestId('depot-marker')
    expect(depots).toHaveLength(1)
    expect(depots[0]).toHaveAttribute('data-position', '-1.249,-78.632')
    expect(within(depots[0]).getByText('Depósito FIC-02')).toBeInTheDocument()
  })

  it('dibuja un depósito por cada punto de partida distinto', () => {
    renderMap([makeRoute(0), makeRoute(1, { depot: depotB, depotLabel: 'Depósito HUA-03' })])

    expect(screen.getAllByTestId('depot-marker')).toHaveLength(2)
  })

  it('dibuja el recorrido continuo (depósito → paradas) y el regreso punteado al depósito', () => {
    renderMap([makeRoute(0)])

    // Se redondea para no depender de los errores de coma flotante de las coordenadas de prueba.
    const read = (testId: string): number[][] =>
      (JSON.parse(screen.getByTestId(testId).dataset.positions ?? '[]') as number[][]).map((pair) =>
        pair.map((value) => Math.round(value * 1e6) / 1e6),
      )
    const outbound = read('route-line')
    const back = read('return-line')
    expect(outbound).toEqual([
      [-1.249, -78.632],
      [-1.248, -78.631],
      [-1.247, -78.63],
    ])
    expect(back).toEqual([
      [-1.247, -78.63],
      [-1.249, -78.632],
    ])
  })

  it('numera las paradas por orden de visita con el detalle de cada una', () => {
    renderMap([makeRoute(0)])

    const stops = screen.getAllByTestId('stop-marker')
    expect(stops).toHaveLength(2)
    expect(stops[0]).toHaveTextContent('Ruta 1 · parada 1 · Dirección 0-1')
    expect(stops[1]).toHaveTextContent('Ruta 1 · parada 2 · Dirección 0-2')
  })

  it('usa el color de cada ruta', () => {
    renderMap([makeRoute(0), makeRoute(1)])

    expect(screen.getAllByTestId('route-line').map((line) => line.dataset.color)).toEqual([
      '#000000',
      '#000001',
    ])
  })

  it('sin selección todas las rutas se dibujan con el mismo trazo', () => {
    renderMap([makeRoute(0), makeRoute(1)])

    for (const line of screen.getAllByTestId('route-line')) {
      expect(line).toHaveAttribute('data-weight', '4')
      expect(line).toHaveAttribute('data-opacity', '0.9')
    }
  })

  it('con una ruta elegida la resalta y atenúa las demás', () => {
    renderMap([makeRoute(0), makeRoute(1)], 'route-1')

    const [first, second] = screen.getAllByTestId('route-line')
    expect(first).toHaveAttribute('data-weight', '3')
    expect(first).toHaveAttribute('data-opacity', '0.4')
    expect(second).toHaveAttribute('data-weight', '6')
    expect(second).toHaveAttribute('data-opacity', '0.9')
  })

  it('al hacer clic en una parada o en el recorrido elige esa ruta', async () => {
    const { onSelect } = renderMap([makeRoute(0), makeRoute(1)])

    await userEvent.click(screen.getAllByTestId('stop-marker')[2])
    await userEvent.click(screen.getAllByTestId('route-line')[0])

    expect(onSelect).toHaveBeenNthCalledWith(1, 'route-1')
    expect(onSelect).toHaveBeenNthCalledWith(2, 'route-0')
  })

  it('ajusta la vista a todas las rutas y, al elegir una, solo a esa', () => {
    const { rerender } = render(
      <RoutesMap routes={[makeRoute(0), makeRoute(5)]} selectedId={null} onSelect={vi.fn()} />,
    )
    const allBounds = leaflet.fitBounds.mock.calls.at(-1)?.[0]
    expect(allBounds.contains([-1.249 + 0.05 + 0.001, -78.632 + 0.001])).toBe(true)
    expect(allBounds.contains([-1.248, -78.631])).toBe(true)

    rerender(
      <RoutesMap routes={[makeRoute(0), makeRoute(5)]} selectedId="route-0" onSelect={vi.fn()} />,
    )

    const selectedBounds = leaflet.fitBounds.mock.calls.at(-1)?.[0]
    expect(selectedBounds.contains([-1.248, -78.631])).toBe(true)
    expect(selectedBounds.contains([-1.249 + 0.05 + 0.001, -78.632 + 0.001])).toBe(false)
  })

  it('no reajusta la vista si se vuelve a dibujar con los mismos puntos', () => {
    const routes = [makeRoute(0)]
    const { rerender } = render(<RoutesMap routes={routes} selectedId={null} onSelect={vi.fn()} />)
    const calls = leaflet.fitBounds.mock.calls.length

    rerender(<RoutesMap routes={[...routes]} selectedId={null} onSelect={vi.fn()} />)

    expect(leaflet.fitBounds).toHaveBeenCalledTimes(calls)
  })

  it('aclara siempre que los trazos son rectas y no el camino por las calles', () => {
    renderMap([makeRoute(0)])

    expect(
      screen.getByText(/líneas rectas entre puntos, no el camino por las calles/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('con demasiadas rutas dibuja solo la elegida y lo avisa', () => {
    const many = Array.from({ length: MAX_ROUTES_DRAWN_AT_ONCE + 1 }, (_, index) =>
      makeRoute(index),
    )

    const { rerender } = render(<RoutesMap routes={many} selectedId={null} onSelect={vi.fn()} />)

    expect(screen.queryAllByTestId('route-line')).toHaveLength(0)
    expect(screen.getByRole('status')).toHaveTextContent(`Hay ${many.length} rutas`)

    rerender(<RoutesMap routes={many} selectedId="route-7" onSelect={vi.fn()} />)

    expect(screen.getAllByTestId('route-line')).toHaveLength(1)
    expect(screen.getAllByTestId('stop-marker')).toHaveLength(2)
  })

  it('con exactamente el máximo de rutas las dibuja todas', () => {
    const exactly = Array.from({ length: MAX_ROUTES_DRAWN_AT_ONCE }, (_, index) => makeRoute(index))

    renderMap(exactly)

    expect(screen.getAllByTestId('route-line')).toHaveLength(MAX_ROUTES_DRAWN_AT_ONCE)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('sin rutas muestra el mapa sin recorridos', () => {
    renderMap([])

    expect(screen.getByTestId('map')).toBeInTheDocument()
    expect(screen.queryAllByTestId('route-line')).toHaveLength(0)
  })
})
