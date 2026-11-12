import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AREA, STORE, savedCoverage } from '../../test/coverageFixtures'
import { CoverageMap } from './CoverageMap'

/** Leaflet no se dibuja en jsdom: se simula react-leaflet y se exponen sus manejadores. */
const leaflet = vi.hoisted(() => ({
  fitBounds: vi.fn(),
  onClick: undefined as undefined | ((event: { latlng: { lat: number; lng: number } }) => void),
}))

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: ({ attribution }: { attribution: string }) => (
    <span data-testid="tiles">{attribution}</span>
  ),
  Tooltip: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Polygon: ({
    positions,
    pathOptions,
  }: {
    positions: [number, number][]
    pathOptions: { className: string }
  }) => (
    <div data-testid="polygon" data-class={pathOptions.className} data-points={positions.length} />
  ),
  Polyline: ({ positions }: { positions: [number, number][] }) => (
    <div data-testid="polyline" data-points={positions.length} />
  ),
  Marker: ({
    position,
    draggable,
    eventHandlers,
    children,
  }: {
    position: [number, number]
    draggable?: boolean
    eventHandlers?: { dragend: (event: unknown) => void }
    children?: ReactNode
  }) => (
    <div
      data-testid="marker"
      data-position={position.join(',')}
      data-draggable={String(!!draggable)}
    >
      {draggable && (
        <button
          type="button"
          onClick={() =>
            eventHandlers?.dragend({
              target: { getLatLng: () => ({ lat: -1.300000049, lng: -78.700000051 }) },
            })
          }
        >
          Arrastrar {position.join(',')}
        </button>
      )}
      {children}
    </div>
  ),
  useMap: () => ({ fitBounds: leaflet.fitBounds }),
  useMapEvents: (handlers: { click: typeof leaflet.onClick }) => {
    leaflet.onClick = handlers.click
    return null
  },
}))

const handlers = () => ({ onMapClick: vi.fn(), onMoveStore: vi.fn(), onMoveVertex: vi.fn() })

describe('CoverageMap', () => {
  it('dibuja lo guardado punteado, el borrador encima, la tienda y la atribución del mapa', () => {
    render(
      <CoverageMap
        mode="probe"
        draft={{ store: STORE, vertices: AREA }}
        saved={savedCoverage()}
        probe={null}
        {...handlers()}
      />,
    )

    const polygons = screen.getAllByTestId('polygon')
    expect(polygons.map((p) => p.dataset.class)).toEqual([
      'coverage-shape coverage-shape--saved',
      'coverage-shape coverage-shape--draft',
    ])
    expect(screen.getByText('Tienda')).toBeInTheDocument()
    expect(screen.getByTestId('tiles')).toHaveTextContent('OpenStreetMap')
    expect(leaflet.fitBounds).toHaveBeenCalledTimes(1)
  })

  it('con dos puntos muestra una línea; los vértices solo se arrastran al dibujar el área', async () => {
    const props = handlers()
    const { rerender } = render(
      <CoverageMap
        mode="area"
        draft={{ store: null, vertices: AREA.slice(0, 2) }}
        saved={null}
        probe={null}
        {...props}
      />,
    )

    expect(screen.getByTestId('polyline')).toHaveAttribute('data-points', '2')
    expect(screen.queryByTestId('polygon')).not.toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: `Arrastrar ${AREA[1].lat},${AREA[1].lng}` }),
    )
    expect(props.onMoveVertex).toHaveBeenCalledWith(1, { lat: -1.3, lng: -78.7 })

    rerender(
      <CoverageMap
        mode="store"
        draft={{ store: STORE, vertices: AREA.slice(0, 2) }}
        saved={null}
        probe={null}
        {...props}
      />,
    )
    const draggable = screen.getAllByTestId('marker').filter((m) => m.dataset.draggable === 'true')
    expect(draggable).toHaveLength(1)
    await userEvent.click(
      screen.getByRole('button', { name: `Arrastrar ${STORE.lat},${STORE.lng}` }),
    )
    expect(props.onMoveStore).toHaveBeenCalledWith({ lat: -1.3, lng: -78.7 })
  })

  it('un clic entrega el punto redondeado y la prueba muestra el resultado del servidor', () => {
    const props = handlers()
    const { rerender } = render(
      <CoverageMap
        mode="probe"
        draft={{ store: null, vertices: [] }}
        saved={savedCoverage()}
        probe={{ point: STORE }}
        {...props}
      />,
    )

    leaflet.onClick?.({ latlng: { lat: -1.2500004, lng: -78.6200006 } })
    expect(props.onMapClick).toHaveBeenCalledWith({ lat: -1.25, lng: -78.620001 })
    expect(screen.getByText('Consultando…')).toBeInTheDocument()

    rerender(
      <CoverageMap
        mode="probe"
        draft={{ store: null, vertices: [] }}
        saved={savedCoverage()}
        probe={{ point: STORE, position: 'BOUNDARY' }}
        {...props}
      />,
    )
    expect(screen.getByText('En el borde: se acepta')).toBeInTheDocument()
  })
})
