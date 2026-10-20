const PLANNING_REASON_LABELS: Record<string, string> = {
  MISSING_DELIVERY_COORDINATES: 'falta confirmar la ubicación de entrega',
  INVALID_DELIVERY_COORDINATES: 'las coordenadas de entrega no son válidas',
  MISSING_ZONE: 'el pedido no tiene zona',
  MISSING_ZONE_DEPOT_COORDINATES: 'la zona no tiene depósito configurado',
  INVALID_ZONE_DEPOT_COORDINATES: 'el depósito de la zona tiene coordenadas inválidas',
  ACTIVE_ROUTE_CLAIM: 'ya está reservado en una ruta confirmada',
  ADMINISTRATIVE_REVIEW_REQUIRED:
    'requiere revisión del administrador (una entrega anterior falló)',
}

/**
 * Traduce un código de inelegibilidad o exclusión de planificación del backend
 * (`PlanningExclusionReason`). Los códigos que todavía no se conocen se muestran tal cual.
 */
export function describePlanningReason(code: string): string {
  return PLANNING_REASON_LABELS[code] ?? code
}
