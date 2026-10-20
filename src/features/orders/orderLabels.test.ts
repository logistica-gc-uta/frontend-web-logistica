import { describe, expect, it } from 'vitest'
import { ORDER_STATUS_LABELS } from './orderLabels'
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
