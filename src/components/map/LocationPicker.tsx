import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useId, type ReactNode } from 'react'
import {
  MapContainer,
  Marker,
  Polygon,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import type { GeoPoint } from '../../types/geo'
import { Button } from '../ui/Button'
import { depotIcon, orderIcon, storeIcon } from './icons'

const INITIAL_ZOOM = 15
const COORDINATE_DECIMALS = 6 // ≈ 0,1 m: más precisión que la de cualquier dirección postal.

const roundCoordinate = (value: number): number => {
  const factor = 10 ** COORDINATE_DECIMALS
  return Math.round(value * factor) / factor
}

const toPoint = ({ lat, lng }: GeoPoint): GeoPoint => ({
  lat: roundCoordinate(lat),
  lng: roundCoordinate(lng),
})

const formatPoint = ({ lat, lng }: GeoPoint): string =>
  `Latitud ${lat.toFixed(COORDINATE_DECIMALS)} · Longitud ${lng.toFixed(COORDINATE_DECIMALS)}`

/** Coloca el marcador donde el operador hace clic en el mapa. */
function ClickToPlace({ onPlace }: { onPlace: (point: GeoPoint) => void }) {
  useMapEvents({ click: (event) => onPlace(toPoint(event.latlng)) })
  return null
}

/** Mueve la vista cuando cambia el centro (por ejemplo, al elegir otra zona). */
function Recenter({ center }: { center: GeoPoint }) {
  const map = useMap()
  useEffect(() => {
    map.setView([center.lat, center.lng])
  }, [map, center.lat, center.lng])
  return null
}

interface LocationPickerProps {
  /** Centro de la vista: normalmente el depósito de la zona elegida. */
  center: GeoPoint
  depot: GeoPoint | null
  /** Punto elegido por el operador, o `null` si todavía no colocó el marcador. */
  value: GeoPoint | null
  isConfirmed: boolean
  onChange: (point: GeoPoint) => void
  onConfirm: () => void
  error?: string
  /** Área de entrega a dibujar (vértices en orden). Solo se muestra: la decide el servidor. */
  area?: GeoPoint[]
  /** Tienda desde la que se entrega. */
  store?: GeoPoint | null
  /** Resultado de verificar el punto colocado (por ejemplo, «Dentro de la zona de entrega»). */
  status?: ReactNode
  /** Si el punto colocado se puede confirmar (uno fuera del área, no). */
  canConfirm?: boolean
}

/**
 * Mapa para elegir y confirmar la ubicación de entrega: clic para colocar el marcador, arrastrarlo
 * para ajustarlo y un botón para confirmar las coordenadas. Mover el marcador anula la confirmación
 * (la lógica la aplica quien usa el componente, a través de `onChange`).
 */
export function LocationPicker({
  center,
  depot,
  value,
  isConfirmed,
  onChange,
  onConfirm,
  error,
  area,
  store = null,
  status,
  canConfirm = true,
}: LocationPickerProps) {
  const labelId = useId()
  const errorId = useId()

  return (
    <div className="location-picker">
      <p id={labelId} className="field__label">
        Ubicación de entrega
      </p>

      <div
        className="location-picker__map"
        role="group"
        aria-labelledby={labelId}
        aria-describedby={error ? errorId : undefined}
      >
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={INITIAL_ZOOM}
          scrollWheelZoom
          className="location-picker__canvas"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Recenter center={center} />
          {area && area.length >= 3 && (
            <Polygon
              positions={area.map(({ lat, lng }) => [lat, lng] as [number, number])}
              pathOptions={{ className: 'location-picker__area' }}
              interactive={false}
            />
          )}
          {store && (
            <Marker position={[store.lat, store.lng]} icon={storeIcon} interactive={false}>
              <Tooltip direction="top">Tienda</Tooltip>
            </Marker>
          )}
          <ClickToPlace onPlace={onChange} />
          {depot && (
            <Marker position={[depot.lat, depot.lng]} icon={depotIcon} interactive={false}>
              <Tooltip direction="top">Depósito de la zona</Tooltip>
            </Marker>
          )}
          {value && (
            <Marker
              position={[value.lat, value.lng]}
              icon={orderIcon}
              draggable
              eventHandlers={{
                dragend: (event) => onChange(toPoint((event.target as L.Marker).getLatLng())),
              }}
            />
          )}
        </MapContainer>
      </div>

      <p className="location-picker__hint">
        {value
          ? formatPoint(value)
          : 'Haz clic en el mapa para colocar el marcador; puedes arrastrarlo para ajustarlo.'}
      </p>

      <div className="location-picker__actions">
        {value && !isConfirmed && (
          <Button variant="secondary" onClick={onConfirm} disabled={!canConfirm}>
            Confirmar ubicación
          </Button>
        )}
        {value && isConfirmed && (
          <span role="status" className="badge badge--success">
            Ubicación confirmada
          </span>
        )}
      </div>

      {status && (
        <p role="status" className="location-picker__status">
          {status}
        </p>
      )}

      {error && (
        <p id={errorId} className="field__error">
          {error}
        </p>
      )}
    </div>
  )
}
