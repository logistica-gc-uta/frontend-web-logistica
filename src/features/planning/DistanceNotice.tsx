/** Aviso permanente sobre qué significan las distancias y el ahorro que muestra la pantalla. */
export function DistanceNotice() {
  return (
    <p className="notice" role="note">
      <strong>Km geodésicos estimados.</strong> Se calculan en línea recta entre el depósito y las
      paradas (método Haversine): no son distancia por carretera ni consideran calles, tráfico ni
      tiempos de llegada. El ahorro se mide frente a entregar cada pedido por separado, ida y vuelta
      al depósito; no es un ahorro real de combustible.
    </p>
  )
}
