import { describe, expect, it } from 'vitest'
import { describePlanningReason } from './planningReasons'

describe('describePlanningReason', () => {
  it('traduce los 7 códigos de PlanningExclusionReason', () => {
    expect(
      [
        'MISSING_DELIVERY_COORDINATES',
        'INVALID_DELIVERY_COORDINATES',
        'MISSING_ZONE',
        'MISSING_ZONE_DEPOT_COORDINATES',
        'INVALID_ZONE_DEPOT_COORDINATES',
        'ACTIVE_ROUTE_CLAIM',
        'ADMINISTRATIVE_REVIEW_REQUIRED',
      ].map(describePlanningReason),
    ).toEqual([
      'falta confirmar la ubicación de entrega',
      'las coordenadas de entrega no son válidas',
      'el pedido no tiene zona',
      'la zona no tiene depósito configurado',
      'el depósito de la zona tiene coordenadas inválidas',
      'ya está reservado en una ruta confirmada',
      'requiere revisión del administrador (una entrega anterior falló)',
    ])
  })

  it('muestra tal cual un código que todavía no se conoce', () => {
    expect(describePlanningReason('NUEVO_CODIGO')).toBe('NUEVO_CODIGO')
  })
})
