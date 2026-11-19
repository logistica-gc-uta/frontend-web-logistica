import type { DistanceMethod } from './types'

/** Aviso permanente sobre qué significan las distancias y el ahorro que muestra la pantalla. */
export function DistanceNotice({ method }: { method: DistanceMethod }) {
  if (method === 'OSRM_ROAD_NETWORK') {
    return (
      <p className="notice" role="note">
        <strong>Distancias y duraciones estimadas por calles.</strong> Las calcula el motor vial con
        OpenStreetMap, sin tráfico en vivo; la duración no es una hora de llegada. El ahorro compara
        con entregar cada pedido por separado; no es ahorro real de combustible.
      </p>
    )
  }
  return (
    <p className="notice" role="note">
      <strong>Km geodésicos estimados.</strong> Se miden en línea recta entre el depósito y las
      paradas (Haversine), sin calles ni tráfico. El ahorro compara con entregar cada pedido por
      separado; no es ahorro real de combustible.
    </p>
  )
}
