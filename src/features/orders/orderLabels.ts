import type { OrderStatus } from './types'

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Pendiente',
  ASSIGNED: 'Asignado a ruta',
  IN_TRANSIT: 'En camino',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
}

const PLANNING_REASON_LABELS: Record<string, string> = {
  MISSING_DELIVERY_COORDINATES: 'falta confirmar la ubicación de entrega',
  INVALID_DELIVERY_COORDINATES: 'las coordenadas de entrega no son válidas',
  MISSING_ZONE: 'el pedido no tiene zona',
  MISSING_ZONE_DEPOT_COORDINATES: 'la zona no tiene depósito configurado',
  INVALID_ZONE_DEPOT_COORDINATES: 'el depósito de la zona tiene coordenadas inválidas',
}

/** Traduce un código de inelegibilidad del backend; los códigos desconocidos se muestran tal cual. */
export function describePlanningReason(code: string): string {
  return PLANNING_REASON_LABELS[code] ?? code
}
