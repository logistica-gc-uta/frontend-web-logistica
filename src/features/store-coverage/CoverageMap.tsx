import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import {
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import { createVertexIcon, probeIcon, storeIcon } from '../../components/map/icons'
import type { GeoPoint } from '../../types/geo'
import { fromPolygon, roundPoint } from './coverageDraft'
import type { ConfiguredStoreCoverage, CoverageDraft, CoveragePosition } from './types'

/** Qué hace un clic en el mapa. */
export type MapMode = 'store' | 'area' | 'probe'

export interface Probe {
  point: GeoPoint
  /** `undefined` mientras el servidor responde. */
  position?: CoveragePosition
}

/**
 * Vista inicial cuando todavía no hay nada guardado: el centro de Ambato. Es solo el encuadre del
 * mapa, no una ubicación de tienda ni un área por defecto.
 */
const INITIAL_VIEW: GeoPoint = { lat: -1.2491, lng: -78.6168 }
const INITIAL_ZOOM = 13

const POSITION_LABELS: Record<CoveragePosition, string> = {
  INTERIOR: 'Dentro de la cobertura',
  BOUNDARY: 'En el borde: se acepta',
  EXTERIOR: 'Fuera de la cobertura',
}

const toLatLng = ({ lat, lng }: GeoPoint): [number, number] => [lat, lng]
const fromEvent = (event: L.LeafletEvent): GeoPoint =>
  roundPoint((event.target as L.Marker).getLatLng())

function ClickHandler({ onClick }: { onClick: (point: GeoPoint) => void }) {
  useMapEvents({ click: (event) => onClick(roundPoint(event.latlng)) })
  return null
}

/** Encuadra la tienda y el área guardadas una sola vez, al cargarlas. */
function FitSaved({ saved }: { saved: ConfiguredStoreCoverage | null }) {
  const map = useMap()
  const done = useRef(false)
  useEffect(() => {
    if (!saved || done.current) return
    done.current = true
    const points = [saved.location, ...fromPolygon(saved.coverage)].map(toLatLng)
    map.fitBounds(points, { padding: [32, 32] })
  }, [map, saved])
  return null
}

interface CoverageMapProps {
  mode: MapMode
  draft: CoverageDraft
  /** Configuración persistida, que se dibuja punteada debajo del borrador para comparar. */
  saved: ConfiguredStoreCoverage | null
  probe: Probe | null
  onMapClick: (point: GeoPoint) => void
  onMoveStore: (point: GeoPoint) => void
  onMoveVertex: (index: number, point: GeoPoint) => void
}

/** Mapa del editor: tienda, área en edición, área guardada y punto de prueba. */
export function CoverageMap({
  mode,
  draft,
  saved,
  probe,
  onMapClick,
  onMoveStore,
  onMoveVertex,
}: CoverageMapProps) {
  const positions = draft.vertices.map(toLatLng)

  return (
    <MapContainer
      center={toLatLng(INITIAL_VIEW)}
      zoom={INITIAL_ZOOM}
      scrollWheelZoom
      className={`coverage-map__canvas coverage-map__canvas--${mode}`}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitSaved saved={saved} />
      <ClickHandler onClick={onMapClick} />

      {saved && (
        <Polygon
          positions={fromPolygon(saved.coverage).map(toLatLng)}
          pathOptions={{ className: 'coverage-shape coverage-shape--saved' }}
          interactive={false}
        />
      )}

      {positions.length >= 3 && (
        <Polygon
          positions={positions}
          pathOptions={{ className: 'coverage-shape coverage-shape--draft' }}
          interactive={false}
        />
      )}
      {positions.length === 2 && (
        <Polyline
          positions={positions}
          pathOptions={{ className: 'coverage-shape coverage-shape--draft' }}
          interactive={false}
        />
      )}

      {draft.vertices.map((vertex, index) => (
        <Marker
          // El índice identifica el vértice: su orden es parte del área.
          key={index}
          position={toLatLng(vertex)}
          icon={createVertexIcon(index + 1, mode === 'area')}
          draggable={mode === 'area'}
          interactive={mode === 'area'}
          eventHandlers={{ dragend: (event) => onMoveVertex(index, fromEvent(event)) }}
        />
      ))}

      {draft.store && (
        <Marker
          position={toLatLng(draft.store)}
          icon={storeIcon}
          draggable={mode === 'store'}
          // Fuera de «Ubicar tienda» el marcador no captura clics: se puede probar o dibujar encima.
          interactive={mode === 'store'}
          eventHandlers={{ dragend: (event) => onMoveStore(fromEvent(event)) }}
        >
          <Tooltip direction="top">Tienda</Tooltip>
        </Marker>
      )}

      {probe && (
        <Marker
          position={toLatLng(probe.point)}
          icon={probeIcon(probe.position ?? 'PENDING')}
          interactive={false}
        >
          <Tooltip direction="top" permanent>
            {probe.position ? POSITION_LABELS[probe.position] : 'Consultando…'}
          </Tooltip>
        </Marker>
      )}
    </MapContainer>
  )
}
