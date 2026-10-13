/** Aviso permanente sobre qué significan las distancias y el ahorro que muestra la pantalla. */
export function DistanceNotice() {
  return (
    <p className="notice" role="note">
      <strong>Distancias estimadas.</strong> Se calculan en línea recta entre el depósito y las
      paradas (método Haversine): no consideran calles, tráfico ni tiempos de viaje. El ahorro se
      mide frente a entregar cada pedido por separado, ida y vuelta al depósito; no es un ahorro
      real de combustible.
    </p>
  )
}
