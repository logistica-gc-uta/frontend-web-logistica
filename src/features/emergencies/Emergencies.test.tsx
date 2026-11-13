import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { paths } from '../../app/paths'
import { apiClient } from '../../lib/http/apiClient'
import { adminSession, guestOrder } from '../../test/fixtures'
import { createHttpError, createHttpResponse } from '../../test/http'
import { monitorRoute, stopWith } from '../../test/monitorFixtures'
import { renderWithProviders } from '../../test/renderWithProviders'
import { dispatchService } from '../dispatch/dispatchService'
import { MonitorRouteCard } from '../monitor/MonitorRouteCard'
import { monitorService } from '../monitor/monitorService'
import { driverState } from '../monitor/routeProgress'
import { ordersService } from '../orders/ordersService'
import type { Order } from '../orders/types'
import { describeEmergencyError } from './emergencyErrors'
import type { EmergencyUnit, RouteEmergencyDetail } from './types'

const conflict = (code: string) =>
  createHttpError(409, { data: { statusCode: 409, code, message: 'x', error: 'Conflict' } })

const INTERRUPTED = monitorRoute({
  id: 'r1',
  status: 'INTERRUPTED',
  stops: [stopWith(1, 'SUCCESSFUL'), stopWith(2, 'FAILED', 'RECIPIENT_ABSENT')],
})

/** Pedidos A y B, cada uno con una unidad en custodia. */
const ORDER_A: Order = {
  ...guestOrder,
  id: 'order-a',
  deliveryAddress: 'Casa de A',
  items: [{ ...guestOrder.items[0], id: 'item-a' }],
  planningEligibility: { eligible: false, reasons: ['ADMINISTRATIVE_REVIEW_REQUIRED'] },
}
const ORDER_B: Order = {
  ...ORDER_A,
  id: 'order-b',
  deliveryAddress: 'Casa de B',
  items: [{ ...guestOrder.items[1], id: 'item-b', quantity: 1 }],
}

const unit = (
  orderId: string,
  itemId: string,
  patch: Partial<EmergencyUnit> = {},
): EmergencyUnit => ({
  id: `unit-${orderId}`,
  emergencyId: 'em-1',
  routeId: 'r1',
  stopId: `stop-${orderId}`,
  orderId,
  orderItemId: itemId,
  unitNumber: 1,
  productId: 'p',
  status: 'PENDING',
  resolved: false,
  recoveredAt: null,
  recoveredById: null,
  lossId: null,
  replacementPreparedAt: null,
  lossRecoveredAt: null,
  ...patch,
})

const emergency = (
  units: EmergencyUnit[],
  patch: Partial<RouteEmergencyDetail> = {},
): RouteEmergencyDetail => ({
  id: 'em-1',
  routeId: 'r1',
  reason: 'Choque leve',
  declaredAt: '2030-02-14T15:00:00Z',
  declaredById: 'admin-1',
  closedAt: null,
  closedById: null,
  closeReason: null,
  driverId: 'driver-1',
  returnedAt: null,
  returnedById: null,
  counts: {
    totalUnits: units.length,
    recoveredUnits: units.filter((u) => u.status === 'RECOVERED').length,
    lostPreparedUnits: 0,
    lostPendingUnits: 0,
    pendingUnits: units.filter((u) => u.status === 'PENDING').length,
  },
  pendingUnits: units.filter((u) => u.status === 'PENDING'),
  units,
  ...patch,
})

const mockBoard = (detail: RouteEmergencyDetail) => {
  const detailSpy = vi.spyOn(dispatchService, 'routeEmergency').mockResolvedValue(detail)
  vi.spyOn(dispatchService, 'emergencies').mockResolvedValue([detail])
  vi.spyOn(monitorService, 'listRoutes').mockResolvedValue([INTERRUPTED])
  vi.spyOn(ordersService, 'get').mockImplementation(async (id) =>
    id === 'order-a' ? ORDER_A : ORDER_B,
  )
  return detailSpy
}

const renderPage = () =>
  renderWithProviders(<App />, { route: paths.emergencies, session: adminSession })

const findCard = async () =>
  within(await screen.findByRole('article', { name: /Emergencia de Ruta/ }))

describe('emergencias · lógica (#39, backend #51)', () => {
  it('traduce los conflictos de la custodia', () => {
    expect(describeEmergencyError(conflict('RECOVERY_PENDING'), 'f')).toMatch(/sin recuperar/)
    expect(describeEmergencyError(conflict('UNIT_HAS_ACTIVE_LOSS'), 'f')).toMatch(
      /anula la pérdida/,
    )
    expect(describeEmergencyError(conflict('EMERGENCY_ALREADY_DECLARED'), 'f')).toMatch(/ya tiene/)
  })

  it('envía cada acción con su ruta, unidad o pedido', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue(createHttpResponse({ id: 'x', outcome: 'APPLIED' }))

    await dispatchService.declareEmergency('r1', 'Choque')
    await dispatchService.confirmUnitRecovery('u1', 'Volvió')
    await dispatchService.requeueOrder('o1', 'em-1', 'Listo')
    await dispatchService.cancelLoss('l1', 'Error')

    expect(post.mock.calls.map((call) => call[1])).toEqual([
      expect.objectContaining({ action: 'EMERGENCY_DECLARE', routeId: 'r1' }),
      expect.objectContaining({ action: 'UNIT_RECOVERY_CONFIRM', recoveryId: 'u1' }),
      expect.objectContaining({ action: 'EMERGENCY_REQUEUE', orderId: 'o1', emergencyId: 'em-1' }),
      expect.objectContaining({ action: 'LOSS_CANCEL', lossId: 'l1' }),
    ])
  })

  it('una ruta interrumpida no deja al chofer disponible sin confirmar su regreso', () => {
    expect(driverState(INTERRUPTED, undefined)).toBe('RETURNING')
  })
})

describe('emergencias · seguimiento', () => {
  const renderCard = (status: 'IN_PROGRESS' | 'INTERRUPTED' | 'COMPLETED') => {
    const onChanged = vi.fn()
    render(
      <MemoryRouter>
        <MonitorRouteCard
          route={monitorRoute({ id: 'r1', status })}
          name="Ruta 1"
          driver={undefined}
          onChanged={onChanged}
        />
      </MemoryRouter>,
    )
    return { onChanged, user: userEvent.setup() }
  }

  it('solo una ruta en curso ofrece declarar emergencia, con motivo obligatorio', async () => {
    const declare = vi
      .spyOn(dispatchService, 'declareEmergency')
      .mockResolvedValue({ id: 'x' } as never)
    const { onChanged, user } = renderCard('IN_PROGRESS')

    await user.click(screen.getByRole('button', { name: 'Declarar emergencia' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar emergencia' }))
    expect(screen.getByText('Escribe qué pasó')).toBeInTheDocument()
    expect(declare).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Qué pasó en Ruta 1'), 'Choque leve')
    await user.click(screen.getByRole('button', { name: 'Confirmar emergencia' }))

    expect(declare).toHaveBeenCalledWith('r1', 'Choque leve')
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('una ruta interrumpida lo indica y no ofrece otra emergencia', () => {
    renderCard('INTERRUPTED')

    expect(screen.getByText('Ruta interrumpida por una emergencia.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Emergencias' })).toHaveAttribute(
      'href',
      paths.emergencies,
    )
    expect(screen.queryByRole('button', { name: 'Declarar emergencia' })).not.toBeInTheDocument()
  })
})

describe('emergencias · pantalla', () => {
  it('conserva lo entregado y lo fallido, y muestra cada unidad en custodia', async () => {
    mockBoard(emergency([unit('order-a', 'item-a'), unit('order-b', 'item-b')]))
    renderPage()
    const card = await findCard()

    const history = within(card.getByRole('region', { name: /Lo que ya pasó/ }))
    expect(history.getByText('Entregado')).toBeInTheDocument()
    expect(history.getByText('Visita fallida')).toBeInTheDocument()
    expect(card.getByText('Pendientes de recuperar').nextSibling).toHaveTextContent('2')
    expect(card.getAllByText('Pendiente de recuperar')).toHaveLength(2)
  })

  it('confirmar el retorno de A no desbloquea B', async () => {
    const detail = mockBoard(emergency([unit('order-a', 'item-a'), unit('order-b', 'item-b')]))
    const confirm = vi
      .spyOn(dispatchService, 'confirmUnitRecovery')
      .mockResolvedValue({ id: 'x' } as never)
    const { user } = renderPage()
    const card = await findCard()
    const orderA = within(card.getByRole('region', { name: 'Pedido Casa de A' }))

    detail.mockResolvedValue(
      emergency([
        unit('order-a', 'item-a', {
          status: 'RECOVERED',
          resolved: true,
          recoveredAt: '2030-02-14T17:00:00Z',
        }),
        unit('order-b', 'item-b'),
      ]),
    )
    await user.click(orderA.getByRole('button', { name: 'Confirmar retorno' }))
    await user.type(orderA.getByLabelText(/Motivo del retorno de/), 'Volvió intacto')
    await user.click(orderA.getByRole('button', { name: 'Sí, volvió a la tienda' }))

    expect(confirm).toHaveBeenCalledWith('unit-order-a', 'Volvió intacto')
    expect(await screen.findByText(/confirmado. El stock no cambia/)).toBeInTheDocument()
    const refreshed = await findCard()
    expect(
      within(refreshed.getByRole('region', { name: 'Pedido Casa de A' })).getByRole('button', {
        name: 'Habilitar para planificar',
      }),
    ).toBeInTheDocument()
    expect(
      within(refreshed.getByRole('region', { name: 'Pedido Casa de B' })).getByText(
        /Sigue bloqueado/,
      ),
    ).toBeInTheDocument()
  })

  it('cerrar con pendientes las deja a la vista y no da al repartidor por disponible', async () => {
    mockBoard(
      emergency([unit('order-b', 'item-b')], {
        closedAt: '2030-02-14T18:00:00Z',
        closeReason: 'Fin del día',
      }),
    )
    renderPage()
    const card = await findCard()

    expect(card.getByText(/Cerrada con pendientes/)).toBeInTheDocument()
    expect(card.getByText('Pendiente de recuperar')).toBeInTheDocument()
    expect(card.queryByRole('button', { name: 'Cerrar emergencia' })).not.toBeInTheDocument()
    expect(card.getByText(/Su retorno todavía no está confirmado/)).toBeInTheDocument()
    expect(card.queryByText(/disponible/i)).not.toBeInTheDocument()
  })

  it('habilitar un pedido sin resolver se rechaza y se explica', async () => {
    mockBoard(
      emergency([
        unit('order-a', 'item-a', {
          status: 'LOST_PREPARED',
          resolved: true,
          lossId: 'loss-1',
        }),
      ]),
    )
    vi.spyOn(dispatchService, 'requeueOrder').mockRejectedValue(conflict('RECOVERY_PENDING'))
    const { user } = renderPage()
    const orderA = within((await findCard()).getByRole('region', { name: 'Pedido Casa de A' }))

    await user.click(orderA.getByRole('button', { name: 'Habilitar para planificar' }))
    await user.type(orderA.getByLabelText(/Motivo para habilitar/), 'Listo')
    await user.click(orderA.getByRole('button', { name: 'Habilitar' }))

    expect(
      await screen.findByText(/resuélvelas antes de volver a planificarlo/),
    ).toBeInTheDocument()
  })

  it('el retorno del repartidor se confirma aparte', async () => {
    mockBoard(emergency([unit('order-a', 'item-a')]))
    const release = vi
      .spyOn(dispatchService, 'releaseEmergencyDriver')
      .mockResolvedValue({ id: 'x' } as never)
    const { user } = renderPage()
    const driver = within((await findCard()).getByRole('region', { name: /Repartidor de/ }))

    await user.click(driver.getByRole('button', { name: 'Confirmar retorno del repartidor' }))
    await user.type(driver.getByLabelText(/Motivo del retorno del repartidor/), 'Llegó')
    await user.click(driver.getByRole('button', { name: 'Sí, volvió al depósito' }))

    expect(release).toHaveBeenCalledWith('r1', 'Llegó')
  })
})
