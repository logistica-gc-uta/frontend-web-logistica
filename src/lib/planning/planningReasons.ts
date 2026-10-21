const PLANNING_REASON_LABELS: Record<string, string> = {
  MISSING_DELIVERY_COORDINATES: 'falta confirmar la ubicación de entrega',
  INVALID_DELIVERY_COORDINATES: 'las coordenadas de entrega no son válidas',
  MISSING_ZONE: 'el pedido no tiene zona',
  MISSING_ZONE_DEPOT_COORDINATES: 'la zona no tiene depósito configurado',
  INVALID_ZONE_DEPOT_COORDINATES: 'el depósito de la zona tiene coordenadas inválidas',
  ACTIVE_ROUTE_CLAIM: 'ya está reservado en una ruta confirmada',
  ADMINISTRATIVE_REVIEW_REQUIRED:
    'requiere revisión del administrador (una entrega anterior falló)',
  NOT_TODAY: 'no está programado para hoy',
  ORDER_NOT_PENDING: 'el pedido ya no está pendiente',
  NO_AVAILABLE_DRIVER: 'no hay choferes disponibles para una salida nueva',
}

/**
 * Traduce un código de inelegibilidad, exclusión de planificación o bloqueo de una urgencia del
 * backend. Los códigos que todavía no se conocen se muestran tal cual.
 */
export function describePlanningReason(code: string): string {
  return PLANNING_REASON_LABELS[code] ?? code
}
