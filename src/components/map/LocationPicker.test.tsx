import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GeoPoint } from '../../types/geo'
import { LocationPicker } from './LocationPicker'

/** Leaflet no se dibuja en jsdom: se simula react-leaflet y se capturan sus manejadores de eventos. */
const leaflet = vi.hoisted(() => ({
  setView: vi.fn(),
  onMapClick: undefined as undefined | ((event: { latlng: { lat: number; lng: number } }) => void),
}))

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => <span>{children}</span>,
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
      data-testid={draggable ? 'order-marker' : 'depot-marker'}
      data-position={position.join(',')}
    >
      {draggable && (
        <button
          type="button"
          onClick={() =>
            eventHandlers?.dragend({
              target: { getLatLng: () => ({ lat: -1.30000049, lng: -78.70000051 }) },
            })
          }
        >
          Arrastrar marcador
        </button>
      )}
      {children}
    </div>
  ),
  useMap: () => ({ setView: leaflet.setView }),
  useMapEvents: (handlers: { click: typeof leaflet.onMapClick }) => {
    leaflet.onMapClick = handlers.click
    return null
  },
}))

const center: GeoPoint = { lat: -1.249, lng: -78.632 }
const point: GeoPoint = { lat: -1.251123, lng: -78.629131 }

const renderPicker = (props: Partial<Parameters<typeof LocationPicker>[0]> = {}) => {
  const onChange = vi.fn()
  const onConfirm = vi.fn()
  const utils = render(
    <LocationPicker
      center={center}
      depot={center}
      value={null}
      isConfirmed={false}
      onChange={onChange}
      onConfirm={onConfirm}
      {...props}
    />,
  )
  return { ...utils, onChange, onConfirm }
}

describe('LocationPicker', () => {
  beforeEach(() => {
    leaflet.setView.mockClear()
    leaflet.onMapClick = undefined
  })

  it('muestra la indicación y el depósito mientras no hay marcador', () => {
    renderPicker()

    expect(screen.getByText(/Haz clic en el mapa para colocar el marcador/)).toBeInTheDocument()
    expect(screen.getByTestId('depot-marker')).toHaveAttribute('data-position', '-1.249,-78.632')
    expect(screen.getByText('Depósito de la zona')).toBeInTheDocument()
    expect(screen.queryByTestId('order-marker')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirmar ubicación' })).not.toBeInTheDocument()
  })

  it('no dibuja el depósito si la zona todavía no se eligió', () => {
    renderPicker({ depot: null })

    expect(screen.queryByTestId('depot-marker')).not.toBeInTheDocument()
  })

  it('coloca el marcador donde se hace clic, redondeando las coordenadas a 6 decimales', () => {
    const { onChange } = renderPicker()

    act(() => leaflet.onMapClick?.({ latlng: { lat: -1.2511204999, lng: -78.6291314999 } }))

    expect(onChange).toHaveBeenCalledWith({ lat: -1.25112, lng: -78.629131 })
  })

  it('al arrastrar el marcador informa la nueva posición redondeada', async () => {
    const { onChange } = renderPicker({ value: point })

    await userEvent.click(screen.getByRole('button', { name: 'Arrastrar marcador' }))

    expect(onChange).toHaveBeenCalledWith({ lat: -1.3, lng: -78.700001 })
  })

  it('con un punto sin confirmar muestra las coordenadas y permite confirmarlas', async () => {
    const { onConfirm } = renderPicker({ value: point })

    expect(screen.getByTestId('order-marker')).toHaveAttribute(
      'data-position',
      '-1.251123,-78.629131',
    )
    expect(screen.getByText('Latitud -1.251123 · Longitud -78.629131')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar ubicación' }))

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('con el punto confirmado lo indica y oculta el botón', () => {
    renderPicker({ value: point, isConfirmed: true })

    expect(screen.getByRole('status')).toHaveTextContent('Ubicación confirmada')
    expect(screen.queryByRole('button', { name: 'Confirmar ubicación' })).not.toBeInTheDocument()
  })

  it('vuelve a centrar el mapa cuando cambia el centro', () => {
    const { rerender, onChange, onConfirm } = renderPicker()
    expect(leaflet.setView).toHaveBeenLastCalledWith([-1.249, -78.632])

    rerender(
      <LocationPicker
        center={{ lat: -1.27, lng: -78.63 }}
        depot={null}
        value={null}
        isConfirmed={false}
        onChange={onChange}
        onConfirm={onConfirm}
      />,
    )

    expect(leaflet.setView).toHaveBeenLastCalledWith([-1.27, -78.63])
  })

  it('muestra el error y lo vincula al mapa de forma accesible', () => {
    renderPicker({ error: 'Confirma la ubicación en el mapa' })

    expect(screen.getByRole('group', { name: 'Ubicación de entrega' })).toHaveAccessibleDescription(
      'Confirma la ubicación en el mapa',
    )
  })
})
