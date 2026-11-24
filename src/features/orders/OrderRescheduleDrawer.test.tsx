import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { dispatchService } from '../dispatch/dispatchService'
import {
  canReschedulePendingOrder,
  isOverduePendingOrder,
  OrderRescheduleDrawer,
} from './OrderRescheduleDrawer'
import { OrdersTable } from './OrdersTable'
import type { Order } from './types'

function sampleOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-12345678',
    userId: null,
    recipientType: 'GUEST',
    recipientName: 'Ana Cliente',
    recipientPhone: '+593999111222',
    zoneId: null,
    deliveryAddress: 'Av. Cevallos 123',
    deliveryLat: -1.24,
    deliveryLng: -78.62,
    scheduledDeliveryDate: '2025-01-10T15:00:00Z',
    status: 'PENDING',
    total: 25,
    routeId: null,
    createdAt: '2025-01-09T12:00:00Z',
    items: [
      {
        id: 'item-1',
        productId: 'prod-1',
        quantity: 1,
        price: 25,
        product: { id: 'prod-1', name: 'Ramo Primavera' },
      },
    ],
    zone: null,
    deliveryLocation: { lat: -1.24, lng: -78.62 },
    planningEligibility: { eligible: true, reasons: [] },
    pickup: null,
    requiresAdministrativeReview: false,
    ...overrides,
  }
}

describe('OrderRescheduleDrawer & OrdersTable rules', () => {
  it('excludes store-pickup and administrative-review orders from overdue and reschedule eligibility', () => {
    const overdue = sampleOrder()
    expect(canReschedulePendingOrder(overdue)).toBe(true)
    expect(isOverduePendingOrder(overdue, Date.parse('2025-01-12T12:00:00Z'))).toBe(true)

    const pickup = sampleOrder({
      pickup: { state: 'PENDING_PICKUP', agreedAt: '2025-01-11T10:00:00Z', pickedUpAt: null },
    })
    expect(canReschedulePendingOrder(pickup)).toBe(false)
    expect(isOverduePendingOrder(pickup, Date.parse('2025-01-12T12:00:00Z'))).toBe(false)

    const inReview = sampleOrder({ requiresAdministrativeReview: true })
    expect(canReschedulePendingOrder(inReview)).toBe(false)
    expect(isOverduePendingOrder(inReview, Date.parse('2025-01-12T12:00:00Z'))).toBe(false)
  })

  it('shows Retiro en tienda + Confirmar retiro for pickup orders and En gestión for review orders', () => {
    const onReschedule = vi.fn()
    const onConfirmPickup = vi.fn()
    render(
      <MemoryRouter>
        <OrdersTable
          orders={[
            sampleOrder({ id: 'o-overdue', recipientName: 'Vencido Uno' }),
            sampleOrder({
              id: 'o-pickup',
              recipientName: 'Retiro Dos',
              pickup: { state: 'PENDING_PICKUP', agreedAt: '2025-01-11T10:00:00Z', pickedUpAt: null },
            }),
            sampleOrder({
              id: 'o-review',
              recipientName: 'Gestion Tres',
              requiresAdministrativeReview: true,
            }),
          ]}
          onReschedule={onReschedule}
          onConfirmPickup={onConfirmPickup}
        />
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: 'Reprogramar pedido de Vencido Uno' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reprogramar pedido de Retiro Dos' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reprogramar pedido de Gestion Tres' })).toBeNull()
    expect(screen.getByText('Retiro en tienda')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar retiro en tienda del pedido de Retiro Dos' })).toBeInTheDocument()
    expect(screen.getByText('En gestión')).toBeInTheDocument()
  })

  it('filters Hasta options strictly after Desde and submits reschedule', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(dispatchService, 'reschedule').mockResolvedValue({
      id: 'audit-1',
      action: 'RESCHEDULE',
      outcome: 'APPLIED',
      actorId: 'admin-1',
      orderId: 'order-12345678',
      routeId: null,
      reason: 'Acordado por llamada',
      recordedAt: '2030-01-01T10:00:00Z',
    })
    const onRescheduled = vi.fn()

    render(
      <OrderRescheduleDrawer
        order={sampleOrder()}
        schedule={{ timeZone: 'America/Guayaquil', startTime: '08:00', endTime: '10:00' }}
        onClose={() => {}}
        onRescheduled={onRescheduled}
      />,
    )

    await user.type(screen.getByLabelText('Día acordado'), '2035-05-10')
    await user.click(screen.getByRole('combobox', { name: 'Desde' }))
    await user.click(screen.getByRole('option', { name: /9:00 a\.\s*m\./ }))

    await user.click(screen.getByRole('combobox', { name: 'Hasta' }))
    expect(screen.queryByRole('option', { name: /8:00 a\.\s*m\./ })).toBeNull()
    expect(screen.queryByRole('option', { name: /9:00 a\.\s*m\./ })).toBeNull()
    await user.click(screen.getByRole('option', { name: /10:00 a\.\s*m\./ }))

    await user.type(screen.getByLabelText('Acuerdo con el cliente'), 'Acordado por llamada')
    await user.click(screen.getByRole('button', { name: 'Guardar nueva fecha' }))

    expect(spy).toHaveBeenCalledWith({
      orderId: 'order-12345678',
      scheduledDeliveryDate: '2035-05-10T09:00:00-05:00',
      deliveryWindowStart: '2035-05-10T09:00:00-05:00',
      deliveryWindowEnd: '2035-05-10T10:00:00-05:00',
      reason: 'Acordado por llamada',
    })
    expect(onRescheduled).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })
})
