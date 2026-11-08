import { describe, expect, it } from 'vitest'
import type { Order } from '../orders/types'
import { formatOperationalDay, sharePercent, summarizeOrders } from './dashboard'

const order = (status: Order['status']) => ({ status }) as Order

describe('tablero de inicio', () => {
  it('cuenta los pedidos del día por estado, incluidos los estados sin pedidos', () => {
    const summary = summarizeOrders('2026-11-05', [
      order('PENDING'),
      order('PENDING'),
      order('IN_TRANSIT'),
      order('DELIVERED'),
    ])

    expect(summary).toEqual({
      day: '2026-11-05',
      total: 4,
      byStatus: { PENDING: 2, ASSIGNED: 0, IN_TRANSIT: 1, DELIVERED: 1, CANCELLED: 0 },
    })
  })

  it('calcula el tramo de cada estado sin dividir entre cero', () => {
    expect(sharePercent(1, 4)).toBe(25)
    expect(sharePercent(0, 0)).toBe(0)
  })

  it('nombra el día operativo en español', () => {
    expect(formatOperationalDay('2026-11-05')).toBe('jueves, 5 de noviembre')
  })
})
