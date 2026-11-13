import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { App } from '../../app/App'
import { paths } from '../../app/paths'
import { apiClient } from '../../lib/http/apiClient'
import { auditRecord, failedDelivery } from '../../test/dispatchFixtures'
import { adminSession, adminUser, guestOrder } from '../../test/fixtures'
import { createHttpError, createHttpResponse } from '../../test/http'
import { monitorRoute, stopWith } from '../../test/monitorFixtures'
import { renderWithProviders } from '../../test/renderWithProviders'
import { dispatchService } from '../dispatch/dispatchService'
import type { OrderPickup } from '../dispatch/types'
import { monitorService } from '../monitor/monitorService'
import { ordersService } from '../orders/ordersService'
import { trackingBadgeClass, trackingLabel } from '../shop/orders/orderStatus'
import { IncidentCard, type IncidentCardProps } from './IncidentCard'
import { describeIncidentError } from './incidentError'
import type { IncidentView } from './incidentsBoard'

const ORDER = { ...guestOrder, id: 'f1', status: 'IN_TRANSIT' as const }
const TITLE = ORDER.deliveryAddress
const FAILED_STOP = { ...stopWith(9, 'FAILED', 'RECIPIENT_ABSENT'), id: 'stop-f1', orderId: 'f1' }
const R1 = monitorRoute({ id: 'r1', status: 'COMPLETED', stops: [FAILED_STOP] })
const ATTEMPT = {
  id: 'a1',
  stopId: 'stop-f1',
  failureReason: 'RECIPIENT_ABSENT',
  recordedAt: '2030-02-14T16:00:00Z',
}
const PENDING: OrderPickup = {
  state: 'PENDING_PICKUP',
  agreedAt: '2030-02-15T10:00:00Z',
  pickedUpAt: null,
}

const conflict = (code: string) =>
  createHttpError(409, { data: { statusCode: 409, code, message: 'x', error: 'Conflict' } })

const view = (pickup: OrderPickup | null = null): IncidentView => ({
  orderId: 'f1',
  order: ORDER,
  latestAttempt: ATTEMPT,
  originalRoute: R1,
  visits: [{ route: R1, stop: FAILED_STOP }],
  management: [],
  pickup,
})

const renderCard = (pickup: OrderPickup | null = null) => {
  const props: IncidentCardProps = {
    incident: view(pickup),
    agreement: undefined,
    state: undefined,
    currentUserId: adminUser.id,
    onContact: vi.fn().mockResolvedValue(true),
    onReschedule: vi.fn().mockResolvedValue(true),
    onPickupDecision: vi.fn().mockResolvedValue(true),
    onPickupConfirm: vi.fn().mockResolvedValue(true),
  }
  render(
    <MemoryRouter>
      <IncidentCard {...props} />
    </MemoryRouter>,
  )
  return { props, user: userEvent.setup() }
}

const card = () => within(screen.getByRole('article', { name: `Entrega fallida ${TITLE}` }))
const pickupBox = () => within(card().getByRole('region', { name: `Retiro en tienda de ${TITLE}` }))

describe('retiro en tienda · lógica (#38, backend #50)', () => {
  it('el cliente ve gestión pendiente, retiro pendiente o entregado por retiro', () => {
    expect(trackingLabel({ status: 'IN_TRANSIT', pendingManagement: true, pickup: null })).toBe(
      'Entrega pendiente de gestión',
    )
    expect(trackingLabel({ status: 'IN_TRANSIT', pendingManagement: true, pickup: PENDING })).toBe(
      'Pendiente de retiro en tienda',
    )
    expect(
      trackingLabel({
        status: 'DELIVERED',
        pickup: { ...PENDING, state: 'PICKED_UP', pickedUpAt: '2030-02-16T10:00:00Z' },
      }),
    ).toBe('Entregado: retirado en tienda')
    expect(trackingLabel({ status: 'ASSIGNED' })).toBe('Asignado a una ruta')
    expect(trackingBadgeClass({ status: 'IN_TRANSIT', pickup: PENDING })).toBe(
      'badge badge--warning',
    )
  })

  it('traduce los conflictos del retiro y no los presenta como éxito', () => {
    expect(describeIncidentError(conflict('PICKUP_ALREADY_AGREED'))).toMatch(/ya tiene un retiro/)
    expect(describeIncidentError(conflict('PICKUP_NOT_AGREED'))).toMatch(/No hay un retiro/)
    expect(describeIncidentError(conflict('PICKUP_ALREADY_CONFIRMED'))).toMatch(/ya fue confirmado/)
  })

  it('el acuerdo se refiere al último intento y la confirmación solo lleva el pedido', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue(createHttpResponse({ id: 'x', outcome: 'APPLIED' }))

    await dispatchService.agreePickup({ orderId: 'f1', attemptId: 'a1', reason: 'Lo retira' })
    await dispatchService.confirmPickup('f1', 'Vino a la tienda')

    expect(post.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        action: 'PICKUP_AGREE',
        orderId: 'f1',
        attemptId: 'a1',
        reason: 'Lo retira',
      }),
    )
    expect(post.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        action: 'PICKUP_CONFIRM',
        orderId: 'f1',
        reason: 'Vino a la tienda',
      }),
    )
    expect(post.mock.calls[1][1]).not.toHaveProperty('attemptId')
  })
})

describe('retiro en tienda · tarjeta de entrega fallida', () => {
  it('sin acuerdo ofrece el retiro junto a la reprogramación y exige respuesta y motivo', async () => {
    const { props, user } = renderCard()

    expect(card().getByText('Entrega pendiente de gestión')).toBeInTheDocument()
    expect(card().getByRole('button', { name: 'Reprogramar con este acuerdo' })).toBeInTheDocument()
    await user.click(pickupBox().getByRole('button', { name: 'Registrar respuesta' }))
    expect(pickupBox().getByText('Indica si el cliente acepta retirar')).toBeInTheDocument()

    await user.click(pickupBox().getByLabelText('El cliente retirará en tienda'))
    await user.type(pickupBox().getByLabelText(`Motivo del retiro de ${TITLE}`), 'Prefiere ir')
    await user.click(pickupBox().getByRole('button', { name: 'Registrar respuesta' }))

    expect(props.onPickupDecision).toHaveBeenCalledWith('f1', 'a1', 'agree', 'Prefiere ir')
  })

  it('con retiro acordado no ofrece contacto ni reprogramación y confirma aparte', async () => {
    const { props, user } = renderCard(PENDING)

    expect(
      card().getByText('Pendiente de retiro en tienda', { selector: '.badge' }),
    ).toBeInTheDocument()
    expect(card().queryByRole('button', { name: 'Registrar contacto' })).not.toBeInTheDocument()
    expect(card().queryByRole('button', { name: 'Reprogramar con este acuerdo' })).toBeNull()
    expect(pickupBox().getByText(/Todavía no está entregado/)).toBeInTheDocument()

    await user.click(pickupBox().getByRole('button', { name: 'Confirmar retiro' }))
    await user.click(pickupBox().getByRole('button', { name: 'Sí, el cliente lo retiró' }))
    expect(pickupBox().getByText('Escribe un motivo breve')).toBeInTheDocument()
    expect(props.onPickupConfirm).not.toHaveBeenCalled()

    await user.type(
      pickupBox().getByLabelText(`Motivo de la confirmación del retiro de ${TITLE}`),
      'Vino con su cédula',
    )
    await user.click(pickupBox().getByRole('button', { name: 'Sí, el cliente lo retiró' }))

    expect(props.onPickupConfirm).toHaveBeenCalledWith('f1', 'Vino con su cédula')
  })
})

describe('retiro en tienda · bandeja de entregas fallidas', () => {
  const mockApi = (pickup: OrderPickup | null = null) => {
    const inbox = vi.spyOn(dispatchService, 'inbox').mockResolvedValue({
      date: '2030-02-15',
      urgencies: [],
      failedDeliveries: [failedDelivery('f1', { attempts: [ATTEMPT], pickup })],
    })
    vi.spyOn(monitorService, 'listRoutes').mockResolvedValue([R1])
    vi.spyOn(dispatchService, 'audit').mockResolvedValue([])
    vi.spyOn(ordersService, 'get').mockResolvedValue(ORDER)
    return { inbox }
  }

  const renderPage = () =>
    renderWithProviders(<App />, { route: paths.failedDeliveries, session: adminSession })

  const findPickup = async () =>
    within(await screen.findByRole('region', { name: `Retiro en tienda de ${TITLE}` }))

  it('registra el acuerdo, avisa que no es una entrega y vuelve a consultar la bandeja', async () => {
    const { inbox } = mockApi()
    const agree = vi
      .spyOn(dispatchService, 'agreePickup')
      .mockResolvedValue(auditRecord({ action: 'PICKUP_AGREE', orderId: 'f1' }))
    const { user } = renderPage()
    const box = await findPickup()

    await user.click(box.getByLabelText('El cliente retirará en tienda'))
    await user.type(box.getByLabelText(`Motivo del retiro de ${TITLE}`), 'Prefiere ir')
    await user.click(box.getByRole('button', { name: 'Registrar respuesta' }))

    expect(agree).toHaveBeenCalledWith({ orderId: 'f1', attemptId: 'a1', reason: 'Prefiere ir' })
    expect(await screen.findByText(/retiro en tienda acordado/)).toHaveTextContent(
      'no se creó otra ruta y todavía no está entregado',
    )
    await waitFor(() => expect(inbox).toHaveBeenCalledTimes(2))
  })

  it('si la confirmación falla por la red no la da por hecha y consulta el estado real', async () => {
    const { inbox } = mockApi(PENDING)
    vi.spyOn(dispatchService, 'confirmPickup').mockRejectedValue(new AxiosError('Network Error'))
    const { user } = renderPage()
    const box = await findPickup()

    await user.click(box.getByRole('button', { name: 'Confirmar retiro' }))
    await user.type(
      box.getByLabelText(`Motivo de la confirmación del retiro de ${TITLE}`),
      'Vino a la tienda',
    )
    await user.click(box.getByRole('button', { name: 'Sí, el cliente lo retiró' }))

    expect(await screen.findByText(/No se pudo conectar con el servidor/)).toBeInTheDocument()
    expect(screen.queryByText(/entregado: retirado en tienda/)).not.toBeInTheDocument()
    await waitFor(() => expect(inbox).toHaveBeenCalledTimes(2))
  })

  it('una doble confirmación se explica sin éxito falso', async () => {
    mockApi(PENDING)
    vi.spyOn(dispatchService, 'confirmPickup').mockRejectedValue(
      conflict('PICKUP_ALREADY_CONFIRMED'),
    )
    const { user } = renderPage()
    const box = await findPickup()

    await user.click(box.getByRole('button', { name: 'Confirmar retiro' }))
    await user.type(
      box.getByLabelText(`Motivo de la confirmación del retiro de ${TITLE}`),
      'Otra vez',
    )
    await user.click(box.getByRole('button', { name: 'Sí, el cliente lo retiró' }))

    expect(await screen.findByText(/El retiro ya fue confirmado/)).toBeInTheDocument()
  })
})
