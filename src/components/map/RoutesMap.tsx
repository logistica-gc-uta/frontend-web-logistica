import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Fragment, useEffect, useMemo } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import type { GeoPoint } from '../../types/geo'
import { createStopIcon, depotIcon } from './icons'

export interface MapRouteStop {
  /** Posición en la visita, desde 1. */
  sequence: number
  location: GeoPoint
  /** Texto del detalle de la parada (dirección, hora…). */
  description: string
}

/** Una ruta lista para dibujar: sale del depósito, visita las paradas en orden y regresa. */
export interface MapRoute {
  id: string
  label: string
  color: string
  depot: GeoPoint
  depotLabel: string
  stops: MapRouteStop[]
}

/** Con más rutas que esto se dibuja solo la elegida, para que el mapa siga siendo fluido. */
export const MAX_ROUTES_DRAWN_AT_ONCE = 60

const DEFAULT_CENTER: GeoPoint = { lat: -1.2417, lng: -78.6197 }
const INITIAL_ZOOM = 13
const FIT_PADDING: [number, number] = [32, 32]

const toLatLng = ({ lat, lng }: GeoPoint): [number, number] => [lat, lng]

/** Ajusta la vista para que se vean todos los puntos indicados. */
function FitBounds({ points }: { points: GeoPoint[] }) {
  const map = useMap()
  // Texto estable con el contenido de `points`: la vista solo se reajusta cuando los puntos
  // cambian de verdad, no en cada render del componente padre.
  const pointsKey = points.map(({ lat, lng }) => `${lat},${lng}`).join('|')

  useEffect(() => {
    if (pointsKey === '') return
    const latLngs = pointsKey
      .split('|')
      .map((pair) => pair.split(',').map(Number) as [number, number])
    map.fitBounds(L.latLngBounds(latLngs), { padding: FIT_PADDING })
  }, [map, pointsKey])

  return null
}

function StopMarker({
  route,
  stop,
  onSelect,
}: {
  route: MapRoute
  stop: MapRouteStop
  onSelect: (id: string) => void
}) {
  const icon = useMemo(
    () => createStopIcon(stop.sequence, route.color),
    [stop.sequence, route.color],
  )

  return (
    <Marker
      position={toLatLng(stop.location)}
      icon={icon}
      eventHandlers={{ click: () => onSelect(route.id) }}
    >
      <Tooltip direction="top">{`${route.label} · parada ${stop.sequence} · ${stop.description}`}</Tooltip>
    </Marker>
  )
}

interface RoutesMapProps {
  routes: MapRoute[]
  /** Ruta resaltada; las demás se atenúan. */
  selectedId: string | null
  onSelect: (id: string) => void
}

/**
 * Mapa de rutas: depósitos, paradas numeradas por orden de visita y el recorrido de cada ruta
 * (trazo continuo hasta la última parada y punteado de regreso al depósito, en línea recta).
 */
export function RoutesMap({ routes, selectedId, onSelect }: RoutesMapProps) {
  const isTruncated = routes.length > MAX_ROUTES_DRAWN_AT_ONCE
  const drawn = isTruncated ? routes.filter((route) => route.id === selectedId) : routes
  const hasSelection = selectedId !== null

  const depots = useMemo(() => {
    const byPosition = new Map<string, MapRoute>()
    for (const route of routes) {
      byPosition.set(`${route.depot.lat},${route.depot.lng}`, route)
    }
    return [...byPosition.values()]
  }, [routes])

  const selected = routes.find((route) => route.id === selectedId)
  const focus = selected ? [selected] : drawn
  const focusPoints = focus.flatMap((route) => [route.depot, ...route.stops.map((s) => s.location)])
  const boundsPoints = focusPoints.length > 0 ? focusPoints : depots.map((route) => route.depot)

  return (
    <div className="routes-map">
      <div className="routes-map__canvas" role="group" aria-label="Mapa de las rutas propuestas">
        <MapContainer
          center={toLatLng(boundsPoints[0] ?? DEFAULT_CENTER)}
          zoom={INITIAL_ZOOM}
          scrollWheelZoom
          className="routes-map__leaflet"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds points={boundsPoints} />

          {depots.map((route) => (
            <Marker
              key={`depot-${route.depot.lat},${route.depot.lng}`}
              position={toLatLng(route.depot)}
              icon={depotIcon}
              interactive={false}
            >
              <Tooltip direction="top">{route.depotLabel}</Tooltip>
            </Marker>
          ))}

          {drawn.map((route) => {
            const isSelected = route.id === selectedId
            const weight = isSelected ? 6 : hasSelection ? 3 : 4
            const opacity = isSelected || !hasSelection ? 0.9 : 0.4
            const path = [route.depot, ...route.stops.map((stop) => stop.location)]
            const lastStop = path[path.length - 1]

            return (
              <Fragment key={route.id}>
                <Polyline
                  positions={path.map(toLatLng)}
                  pathOptions={{ color: route.color, weight, opacity }}
                  eventHandlers={{ click: () => onSelect(route.id) }}
                />
                <Polyline
                  positions={[toLatLng(lastStop), toLatLng(route.depot)]}
                  pathOptions={{ color: route.color, weight, opacity, dashArray: '6 8' }}
                />
                {route.stops.map((stop) => (
                  <StopMarker key={stop.sequence} route={route} stop={stop} onSelect={onSelect} />
                ))}
              </Fragment>
            )
          })}
        </MapContainer>
      </div>

      <p className="routes-map__legend">
        Trazo continuo: recorrido depósito → paradas. Trazo punteado: regreso al depósito. Los
        trazos son líneas rectas entre puntos, no el camino por las calles.
      </p>
      {isTruncated && (
        <p className="routes-map__legend" role="status">
          Hay {routes.length} rutas: para mantener el mapa fluido solo se dibuja la ruta que elijas
          en la lista.
        </p>
      )}
    </div>
  )
}
