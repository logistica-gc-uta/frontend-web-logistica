import type { DistanceMethod } from './types'

/** Aviso permanente sobre qué significan las distancias y el ahorro que muestra la pantalla. */
export function DistanceNotice({ method }: { method: DistanceMethod }) {
  if (method === 'OSRM_ROAD_NETWORK') {
    return (
      <p className="notice" role="note">
        <strong>Distancias y duraciones estimadas por calles.</strong> Las calcula el motor vial
        sobre el mapa de OpenStreetMap, sin tráfico en vivo: la duración no es una hora de llegada
        garantizada. El ahorro se mide frente a entregar cada pedido por separado, ida y vuelta al
        depósito; no es un ahorro real de combustible.
      </p>
    )
  }
  return (
    <p className="notice" role="note">
      <strong>Km geodésicos estimados.</strong> El motor vial no está activo: se calculan en línea
      recta entre el depósito y las paradas (método Haversine): no son distancia por carretera ni
      consideran calles, tráfico ni tiempos de llegada. El ahorro se mide frente a entregar cada
      pedido por separado, ida y vuelta al depósito; no es un ahorro real de combustible.
    </p>
  )
}
