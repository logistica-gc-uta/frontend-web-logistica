import { describe, expect, it } from 'vitest'
import { describePlanningReason, ORDER_STATUS_LABELS } from './orderLabels'
import { ORDER_STATUSES } from './types'

describe('ORDER_STATUS_LABELS', () => {
  it('tiene una etiqueta en español para cada estado', () => {
    expect(ORDER_STATUSES.map((status) => ORDER_STATUS_LABELS[status])).toEqual([
      'Pendiente',
      'Asignado a ruta',
      'En camino',
      'Entregado',
      'Cancelado',
    ])
  })
})

describe('describePlanningReason', () => {
  it('traduce los códigos conocidos', () => {
    expect(describePlanningReason('MISSING_DELIVERY_COORDINATES')).toBe(
      'falta confirmar la ubicación de entrega',
    )
    expect(describePlanningReason('MISSING_ZONE_DEPOT_COORDINATES')).toBe(
      'la zona no tiene depósito configurado',
    )
  })

  it('muestra tal cual un código que todavía no se conoce', () => {
    expect(describePlanningReason('NUEVO_CODIGO')).toBe('NUEVO_CODIGO')
  })
})
