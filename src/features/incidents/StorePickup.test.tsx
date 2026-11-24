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
import { shopSettings } from '../../test/shopFixtures'
import { shopService } from '../shop/shopService'
import { renderWithProviders } from '../../test/renderWithProviders'
import { dispatchService } from '../dispatch/dispatchService'
import type { OrderPickup } from '../dispatch/types'
import { monitorService } from '../monitor/monitorService'
import type { MonitorRoute } from '../monitor/types'
import { ordersService } from '../orders/ordersService'
import { trackingBadgeClass, trackingLabel } from '../shop/orders/orderStatus'
import { IncidentCard, type IncidentCardProps } from './IncidentCard'
import { describeIncidentError } from './incidentError'
import type { IncidentView } from './incidentsBoard'

import { createFakeSocket } from '../../test/fakeSocket'

/** La bandeja sigue las entregas fallidas en vivo: el socket se simula para no abrir una conexión real. */
const socket = createFakeSocket()
vi.mock('../../lib/realtime/realtimeClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/realtime/realtimeClient')>()),
  createRealtimeSocket: () => socket,
}))

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

/** Contacto con el destinatario ya registrado (sin acuerdo): habilita ofrecer el retiro en tienda. */
const CONTACT = auditRecord({
  action: 'CONTACT',
  orderId: 'f1',
  reason: 'No se logró acordar con el destinatario',
})

const view = (
  pickup: OrderPickup | null = null,
  contacted = false,
  route: MonitorRoute = R1,
): IncidentView => ({
  orderId: 'f1',
  order: ORDER,
  latestAttempt: ATTEMPT,
  originalRoute: route,
  visits: [{ route, stop: FAILED_STOP }],
  management: contacted ? [CONTACT] : [],
  pickup,
})

const renderCard = (
  pickup: OrderPickup | null = null,
  contacted = false,
  route: MonitorRoute = R1,
) => {
  const props: IncidentCardProps = {
    incident: view(pickup, contacted, route),
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
  it('el retiro en tienda solo se puede ofrecer después de registrar el contacto con el destinatario', () => {
    renderCard()

    expect(card().getByLabelText('Retiro en tienda')).toBeDisabled()
    expect(card().getByLabelText('Contactar al destinatario')).toBeChecked()
    expect(card().getByText(/Primero registra el contacto con el destinatario/)).toBeInTheDocument()
  })

  it('con la ruta original todavía abierta no se puede acordar el retiro: el servidor lo rechazaría', () => {
    renderCard(null, true, { ...R1, status: 'IN_PROGRESS' })

    expect(card().getByLabelText('Retiro en tienda')).toBeDisabled()
    expect(card().getByText(/cuando el chofer termine la ruta original/)).toBeInTheDocument()
  })

  it('sin acuerdo ofrece el retiro junto a la reprogramación y exige respuesta y motivo', async () => {
    const { props, user } = renderCard(null, true)

    expect(card().getByText('Entrega pendiente de gestión')).toBeInTheDocument()
    // Dos caminos excluyentes: por defecto se contacta al destinatario; el retiro se elige aparte.
    expect(card().getByRole('button', { name: 'Reprogramar con este acuerdo' })).toBeInTheDocument()
    expect(card().getByLabelText('Contactar al destinatario')).toBeChecked()
    expect(card().queryByRole('region', { name: `Retiro en tienda de ${TITLE}` })).toBeNull()

    await user.click(card().getByLabelText('Retiro en tienda'))
    expect(card().queryByRole('button', { name: 'Reprogramar con este acuerdo' })).toBeNull()
    await user.click(pickupBox().getByRole('button', { name: 'Registrar respuesta' }))
    expect(pickupBox().getByText('Indica si el cliente acepta retirar')).toBeInTheDocument()

    await user.click(pickupBox().getByLabelText('El cliente retirará en tienda'))
    await user.type(pickupBox().getByLabelText('Respuesta del cliente'), 'Prefiere ir')
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

    await user.type(pickupBox().getByLabelText('Cómo se confirmó el retiro'), 'Vino con su cédula')
    await user.click(pickupBox().getByRole('button', { name: 'Sí, el cliente lo retiró' }))

    expect(props.onPickupConfirm).toHaveBeenCalledWith('f1', 'Vino con su cédula')
  })
})

describe('retiro en tienda · bandeja de entregas fallidas', () => {
  const mockApi = (pickup: OrderPickup | null = null) => {
    vi.spyOn(shopService, 'settings').mockResolvedValue(shopSettings())
    const inbox = vi.spyOn(dispatchService, 'inbox').mockResolvedValue({
      date: '2030-02-15',
      urgencies: [],
      failedDeliveries: [failedDelivery('f1', { attempts: [ATTEMPT], pickup })],
    })
    vi.spyOn(monitorService, 'listRoutes').mockResolvedValue([R1])
    vi.spyOn(dispatchService, 'audit').mockResolvedValue([CONTACT])
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
    await user.click(await screen.findByLabelText('Retiro en tienda'))
    const box = await findPickup()

    await user.click(box.getByLabelText('El cliente retirará en tienda'))
    await user.type(box.getByLabelText('Respuesta del cliente'), 'Prefiere ir')
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
    await user.type(box.getByLabelText('Cómo se confirmó el retiro'), 'Vino a la tienda')
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
    await user.type(box.getByLabelText('Cómo se confirmó el retiro'), 'Otra vez')
    await user.click(box.getByRole('button', { name: 'Sí, el cliente lo retiró' }))

    expect(await screen.findByText(/El retiro ya fue confirmado/)).toBeInTheDocument()
  })

  it('obedece allowedActions en retiro: bloquea acordar sin disponibilidad en tienda pero permite registrar rechazo', async () => {
    const inProgressRoute = monitorRoute({ id: 'r1', status: 'IN_PROGRESS', stops: [FAILED_STOP] })
    vi.spyOn(shopService, 'settings').mockResolvedValue(shopSettings())
    vi.spyOn(dispatchService, 'inbox').mockResolvedValue({
      date: '2030-02-15',
      urgencies: [],
      failedDeliveries: [
        failedDelivery('f1', {
          attempts: [ATTEMPT],
          pickup: null,
          status: 'WAITING_STORE_READINESS',
          ownership: 'FAILED_DELIVERY',
          latestFailedAttemptId: 'a1',
          readiness: null,
          activeAgreementId: null,
          allowedActions: {
            CONTACT: { allowed: true, reasonCode: null, reason: null },
            CONFIRM_INCIDENT_READY: { allowed: true, reasonCode: null, reason: null },
            RESCHEDULE: {
              allowed: false,
              reasonCode: 'INCIDENT_NOT_READY_AT_STORE',
              reason: 'Not ready',
            },
            PICKUP_AGREE: {
              allowed: false,
              reasonCode: 'INCIDENT_NOT_READY_AT_STORE',
              reason: 'Not ready',
            },
            PICKUP_DECLINE: { allowed: true, reasonCode: null, reason: null },
            PICKUP_CONFIRM: { allowed: false, reasonCode: 'PICKUP_NOT_AGREED', reason: 'None' },
          },
        }),
      ],
    })
    vi.spyOn(monitorService, 'listRoutes').mockResolvedValue([inProgressRoute])
    vi.spyOn(dispatchService, 'audit').mockResolvedValue([])
    vi.spyOn(ordersService, 'get').mockResolvedValue(ORDER)
    const decline = vi
      .spyOn(dispatchService, 'declinePickup')
      .mockResolvedValue(auditRecord({ action: 'PICKUP_DECLINE', orderId: 'f1' }))

    const { user } = renderPage()
    await user.click(await screen.findByLabelText('Retiro en tienda'))
    const box = await findPickup()

    expect(box.getByLabelText('El cliente retirará en tienda')).toBeDisabled()
    expect(box.getByText(/disponible en tienda/i)).toBeInTheDocument()
    expect(box.getByLabelText('El cliente no acepta retirar')).toBeEnabled()

    await user.click(box.getByLabelText('El cliente no acepta retirar'))
    await user.type(box.getByLabelText('Respuesta del cliente'), 'No puede acercarse a tienda')
    await user.click(box.getByRole('button', { name: 'Registrar respuesta' }))

    expect(decline).toHaveBeenCalledWith({
      orderId: 'f1',
      attemptId: 'a1',
      reason: 'No puede acercarse a tienda',
    })
  })

  it('deshabilita Confirmar retiro cuando el servidor niega PICKUP_CONFIRM y muestra el motivo en español', async () => {
    vi.spyOn(shopService, 'settings').mockResolvedValue(shopSettings())
    vi.spyOn(dispatchService, 'inbox').mockResolvedValue({
      date: '2030-02-15',
      urgencies: [],
      failedDeliveries: [
        failedDelivery('f1', {
          attempts: [ATTEMPT],
          pickup: PENDING,
          status: 'PENDING_PICKUP',
          ownership: 'FAILED_DELIVERY',
          latestFailedAttemptId: 'a1',
          readiness: null,
          activeAgreementId: null,
          allowedActions: {
            CONTACT: {
              allowed: false,
              reasonCode: 'PICKUP_ALREADY_AGREED',
              reason: 'Pickup exists',
            },
            CONFIRM_INCIDENT_READY: {
              allowed: false,
              reasonCode: 'PICKUP_ALREADY_AGREED',
              reason: 'Pickup exists',
            },
            RESCHEDULE: {
              allowed: false,
              reasonCode: 'PICKUP_ALREADY_AGREED',
              reason: 'Pickup exists',
            },
            PICKUP_AGREE: {
              allowed: false,
              reasonCode: 'PICKUP_ALREADY_AGREED',
              reason: 'Pickup exists',
            },
            PICKUP_DECLINE: {
              allowed: false,
              reasonCode: 'PICKUP_ALREADY_AGREED',
              reason: 'Pickup exists',
            },
            PICKUP_CONFIRM: {
              allowed: false,
              reasonCode: 'CLAIM_NOT_RELEASED',
              reason: 'Active claim remains',
            },
          },
        }),
      ],
    })
    vi.spyOn(monitorService, 'listRoutes').mockResolvedValue([R1])
    vi.spyOn(dispatchService, 'audit').mockResolvedValue([])
    vi.spyOn(ordersService, 'get').mockResolvedValue(ORDER)

    renderPage()
    const box = await findPickup()

    expect(box.getByRole('button', { name: 'Confirmar retiro' })).toBeDisabled()
    expect(box.getByText(/ruta original/i)).toBeInTheDocument()
    expect(box.queryByText(/Active claim remains/)).not.toBeInTheDocument()
  })

  it('con READY_AT_STORE permite acordar retiro aunque la ruta original siga en curso', async () => {
    const inProgressRoute = monitorRoute({ id: 'r1', status: 'IN_PROGRESS', stops: [FAILED_STOP] })
    vi.spyOn(shopService, 'settings').mockResolvedValue(shopSettings())
    vi.spyOn(dispatchService, 'inbox').mockResolvedValue({
      date: '2030-02-15',
      urgencies: [],
      failedDeliveries: [
        failedDelivery('f1', {
          attempts: [ATTEMPT],
          pickup: null,
          status: 'READY_AT_STORE',
          ownership: 'FAILED_DELIVERY',
          latestFailedAttemptId: 'a1',
          readiness: {
            auditId: 'aud-1',
            attemptId: 'a1',
            confirmedAt: '2030-02-15T14:00:00Z',
            confirmedById: adminUser.id,
          },
          activeAgreementId: null,
          allowedActions: {
            CONTACT: { allowed: true, reasonCode: null, reason: null },
            CONFIRM_INCIDENT_READY: {
              allowed: false,
              reasonCode: 'INCIDENT_ALREADY_READY',
              reason: 'Already ready',
            },
            RESCHEDULE: {
              allowed: false,
              reasonCode: 'RESCHEDULE_AGREEMENT_REQUIRED',
              reason: 'Needs agreement',
            },
            PICKUP_AGREE: { allowed: true, reasonCode: null, reason: null },
            PICKUP_DECLINE: { allowed: true, reasonCode: null, reason: null },
            PICKUP_CONFIRM: { allowed: false, reasonCode: 'PICKUP_NOT_AGREED', reason: 'None' },
          },
        }),
      ],
    })
    vi.spyOn(monitorService, 'listRoutes').mockResolvedValue([inProgressRoute])
    vi.spyOn(dispatchService, 'audit').mockResolvedValue([])
    vi.spyOn(ordersService, 'get').mockResolvedValue(ORDER)
    const agree = vi
      .spyOn(dispatchService, 'agreePickup')
      .mockResolvedValue(auditRecord({ action: 'PICKUP_AGREE', orderId: 'f1' }))

    const { user } = renderPage()
    await user.click(await screen.findByLabelText('Retiro en tienda'))
    const box = await findPickup()

    await user.click(box.getByLabelText('El cliente retirará en tienda'))
    await user.type(box.getByLabelText('Respuesta del cliente'), 'Retira hoy por la tarde')
    await user.click(box.getByRole('button', { name: 'Registrar respuesta' }))

    expect(agree).toHaveBeenCalledWith({
      orderId: 'f1',
      attemptId: 'a1',
      reason: 'Retira hoy por la tarde',
    })
  })

  it('mientras la recarga GET está pendiente tras confirmar retiro bloquea un segundo envío sobre el snapshot anterior', async () => {
    const { inbox } = mockApi(PENDING)
    const confirm = vi
      .spyOn(dispatchService, 'confirmPickup')
      .mockResolvedValue(auditRecord({ action: 'PICKUP_CONFIRM', orderId: 'f1' }))

    const { user } = renderPage()
    const box = await findPickup()

    let resolveRefresh!: (value: { date: string; urgencies: []; failedDeliveries: [] }) => void
    inbox.mockReturnValueOnce(new Promise((res) => (resolveRefresh = res)))

    await user.click(box.getByRole('button', { name: 'Confirmar retiro' }))
    await user.type(box.getByLabelText('Cómo se confirmó el retiro'), 'Vino el titular')
    await user.click(box.getByRole('button', { name: 'Sí, el cliente lo retiró' }))

    expect(confirm).toHaveBeenCalledOnce()

    await waitFor(() =>
      expect(box.getByRole('button', { name: 'Confirmar retiro' })).toBeDisabled(),
    )
    await user.click(box.getByRole('button', { name: 'Confirmar retiro' }))
    expect(confirm).toHaveBeenCalledOnce()

    resolveRefresh({ date: '2030-02-15', urgencies: [], failedDeliveries: [] })
    expect(
      await screen.findByText('No hay entregas fallidas pendientes de gestión.'),
    ).toBeInTheDocument()
  })
})
