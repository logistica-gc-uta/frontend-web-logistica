import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { paths } from '../../app/paths'
import { auditRecord, failedDelivery } from '../../test/dispatchFixtures'
import { adminSession, adminUser, guestOrder } from '../../test/fixtures'
import { createHttpError } from '../../test/http'
import { monitorRoute, stopWith } from '../../test/monitorFixtures'
import { renderWithProviders } from '../../test/renderWithProviders'
import { dispatchService } from '../dispatch/dispatchService'
import { monitorService } from '../monitor/monitorService'
import { ordersService } from '../orders/ordersService'
import { IncidentCard, type IncidentCardProps, type RegisteredAgreement } from './IncidentCard'
import type { IncidentView } from './incidentsBoard'

const ORDER = { ...guestOrder, id: 'f1', status: 'IN_TRANSIT' as const }
const TITLE = ORDER.deliveryAddress
const FAILED_STOP = { ...stopWith(9, 'FAILED', 'RECIPIENT_ABSENT'), id: 'stop-f1', orderId: 'f1' }
const R1 = monitorRoute({
  id: 'r1',
  status: 'COMPLETED',
  stops: [stopWith(1, 'SUCCESSFUL'), FAILED_STOP],
})
const AGREEMENT: RegisteredAgreement = {
  id: 'acuerdo-1',
  reason: 'Acordó el sábado',
  window: {
    scheduledDeliveryDate: '2030-02-15T09:00:00-05:00',
    deliveryWindowStart: '2030-02-15T09:00:00-05:00',
    deliveryWindowEnd: '2030-02-15T11:30:00-05:00',
  },
}

const incidentView = (overrides: Partial<IncidentView> = {}): IncidentView => ({
  orderId: 'f1',
  order: ORDER,
  latestAttempt: {
    id: 'a1',
    stopId: 'stop-f1',
    failureReason: 'RECIPIENT_ABSENT',
    recordedAt: '2030-02-14T16:00:00Z',
  },
  originalRoute: R1,
  visits: [{ route: R1, stop: FAILED_STOP }],
  management: [],
  pickup: null,
  ...overrides,
})

const renderCard = (overrides: Partial<IncidentCardProps> = {}) => {
  const props = {
    incident: incidentView(),
    agreement: undefined,
    state: undefined,
    currentUserId: adminUser.id,
    onContact: vi.fn().mockResolvedValue(true),
    onReschedule: vi.fn().mockResolvedValue(true),
    onPickupDecision: vi.fn().mockResolvedValue(true),
    onPickupConfirm: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
  render(<IncidentCard {...props} />)
  return props
}

const card = () => within(screen.getByRole('article', { name: `Entrega fallida ${TITLE}` }))
const reasonField = () => card().getByLabelText(`Motivo de la gestión de ${TITLE}`)
const setWindow = (day: string, from: string, to: string) => {
  fireEvent.change(card().getByLabelText('Día acordado'), { target: { value: day } })
  fireEvent.change(card().getByLabelText('Desde (hora de Guayaquil)'), { target: { value: from } })
  fireEvent.change(card().getByLabelText('Hasta (hora de Guayaquil)'), { target: { value: to } })
}

describe('IncidentCard', () => {
  it('muestra el intento con su motivo, la ruta original y que el pedido no está cancelado ni entregado', () => {
    renderCard()

    expect(card().getByRole('note')).toHaveTextContent(
      'Intento fallido. El pedido no está cancelado ni entregado',
    )
    expect(card().getByText('En camino · en revisión')).toBeInTheDocument()
    expect(card().getByText('Destinatario ausente')).toBeInTheDocument()
    expect(card().getByText('14/02/2030, 11:00')).toBeInTheDocument()
    expect(card().getByText('Ruta FIC-02 · 21/10/2026, 10:00')).toBeInTheDocument()
    expect(card().getByText('Carlos Chofer')).toBeInTheDocument()
    expect(
      within(card().getByRole('region', { name: `Historial de visitas de ${TITLE}` })).getByRole(
        'listitem',
      ),
    ).toHaveTextContent(
      'Ruta FIC-02 · 21/10/2026, 10:00 (Completada (COMPLETED))Visita fallida: destinatario ausente',
    )
  })

  it('muestra las gestiones registradas con su responsable', () => {
    renderCard({
      incident: incidentView({
        management: [
          auditRecord({
            action: 'CONTACT',
            reason: 'No contestó',
            actorId: 'otro',
            recordedAt: '2030-02-15T15:00:00Z',
          }),
        ],
      }),
    })

    expect(
      card().getByText(
        /Contacto con el destinatario · 15\/02\/2030, 10:00 · Otro administrador · Motivo: No contestó/,
      ),
    ).toBeInTheDocument()
  })

  it('exige indicar el resultado y un motivo antes de registrar el contacto', async () => {
    const { onContact } = renderCard()

    await userEvent.click(card().getByRole('button', { name: 'Registrar contacto' }))

    expect(card().getByText('Indica si se acordó una nueva entrega')).toBeInTheDocument()
    expect(card().getByText('Escribe un motivo breve de la gestión')).toBeInTheDocument()
    expect(onContact).not.toHaveBeenCalled()
  })

  it('un contacto sin acuerdo se registra con el último intento y sin fecha, y limpia el formulario', async () => {
    const { onContact } = renderCard()
    await userEvent.click(card().getByLabelText('No se logró acordar'))
    await userEvent.type(reasonField(), '  No contestó  ')

    await userEvent.click(card().getByRole('button', { name: 'Registrar contacto' }))

    expect(onContact).toHaveBeenCalledWith({
      orderId: 'f1',
      attemptId: 'a1',
      agreement: null,
      reason: 'No contestó',
    })
    expect(reasonField()).toHaveValue('')
  })

  it('con acuerdo exige una franja válida y futura, y la envía en hora de Guayaquil', async () => {
    const { onContact } = renderCard()
    await userEvent.click(card().getByLabelText('Se acordó una nueva entrega'))
    await userEvent.type(reasonField(), 'Acordó el sábado')

    await userEvent.click(card().getByRole('button', { name: 'Registrar contacto' }))
    expect(card().getByText('Indica el día y la franja horaria acordados')).toBeInTheDocument()

    setWindow('2030-02-15', '11:00', '09:00')
    await userEvent.click(card().getByRole('button', { name: 'Registrar contacto' }))
    expect(card().getByText('La hora final debe ser posterior a la inicial')).toBeInTheDocument()

    setWindow('2001-01-01', '09:00', '10:00')
    await userEvent.click(card().getByRole('button', { name: 'Registrar contacto' }))
    expect(card().getByText('La franja acordada debe ser futura')).toBeInTheDocument()
    expect(onContact).not.toHaveBeenCalled()

    setWindow('2030-02-15', '09:00', '11:30')
    await userEvent.click(card().getByRole('button', { name: 'Registrar contacto' }))

    expect(onContact).toHaveBeenCalledWith({
      orderId: 'f1',
      attemptId: 'a1',
      agreement: AGREEMENT.window,
      reason: 'Acordó el sábado',
    })
  })

  it('si el contacto no se registra, conserva lo escrito para reintentar', async () => {
    renderCard({ onContact: vi.fn().mockResolvedValue(false) })
    await userEvent.click(card().getByLabelText('No se logró acordar'))
    await userEvent.type(reasonField(), 'No contestó')

    await userEvent.click(card().getByRole('button', { name: 'Registrar contacto' }))

    expect(reasonField()).toHaveValue('No contestó')
  })

  it('sin acuerdo registrado no se puede reprogramar', () => {
    renderCard()

    expect(card().getByRole('button', { name: 'Reprogramar con este acuerdo' })).toBeDisabled()
    expect(
      card().getByText(/registra primero un contacto en el que se haya acordado/),
    ).toBeInTheDocument()
  })

  it('con acuerdo y la ruta original completada, reprograma con ese acuerdo', async () => {
    const { onReschedule } = renderCard({ agreement: AGREEMENT })

    expect(card().getByText(/nueva entrega el 15\/02\/2030, 09:00 a 11:30/)).toBeInTheDocument()
    await userEvent.click(card().getByRole('button', { name: 'Reprogramar con este acuerdo' }))

    expect(onReschedule).toHaveBeenCalledWith('f1', AGREEMENT)
  })

  it('si la ruta original sigue en curso, no se puede reprogramar todavía', () => {
    renderCard({
      agreement: AGREEMENT,
      incident: incidentView({ originalRoute: { ...R1, status: 'IN_PROGRESS' } }),
    })

    expect(card().getByRole('button', { name: 'Reprogramar con este acuerdo' })).toBeDisabled()
    expect(card().getByText(/La ruta original todavía no se completó/)).toBeInTheDocument()
  })

  it('mientras guarda bloquea el formulario y si falla muestra el error', () => {
    renderCard({ state: { status: 'saving' } })
    expect(
      card().getByRole('group', { name: 'Registrar contacto con el destinatario' }),
    ).toBeDisabled()
  })

  it('una falla se muestra en la tarjeta', () => {
    renderCard({ state: { status: 'failed', error: 'No se pudo conectar con el servidor' } })

    expect(card().getByRole('alert')).toHaveTextContent('No se pudo conectar con el servidor')
  })

  it('sin datos del pedido lo identifica por su código', () => {
    renderCard({
      incident: incidentView({
        order: undefined,
        originalRoute: undefined,
        latestAttempt: undefined,
      }),
    })

    expect(screen.getByRole('article', { name: 'Entrega fallida Pedido f1' })).toBeInTheDocument()
  })
})

describe('FailedDeliveriesPage', () => {
  const mockApi = (
    failed = [
      failedDelivery('f1', {
        attempts: incidentView().latestAttempt ? [incidentView().latestAttempt!] : [],
      }),
    ],
  ) => {
    const inbox = vi
      .spyOn(dispatchService, 'inbox')
      .mockResolvedValue({ date: '2030-02-15', urgencies: [], failedDeliveries: failed })
    vi.spyOn(monitorService, 'listRoutes').mockResolvedValue([R1])
    vi.spyOn(dispatchService, 'audit').mockResolvedValue([])
    vi.spyOn(ordersService, 'get').mockResolvedValue(ORDER)
    return { inbox }
  }

  const renderPage = () =>
    renderWithProviders(<App />, { route: paths.failedDeliveries, session: adminSession })

  const findCard = async () =>
    within(await screen.findByRole('article', { name: `Entrega fallida ${TITLE}` }))

  it('registra un acuerdo y reprograma con él; el pedido sale de la bandeja con un aviso', async () => {
    const { inbox } = mockApi()
    const contact = vi
      .spyOn(dispatchService, 'recordContact')
      .mockResolvedValue(auditRecord({ id: 'acuerdo-1', action: 'CONTACT' }))
    const reschedule = vi
      .spyOn(dispatchService, 'rescheduleWithAgreement')
      .mockResolvedValue(auditRecord({ action: 'RESCHEDULE' }))
    const { user } = renderPage()
    const cardOf = await findCard()

    await user.click(cardOf.getByLabelText('Se acordó una nueva entrega'))
    await user.type(cardOf.getByLabelText(`Motivo de la gestión de ${TITLE}`), 'Acordó el sábado')
    setWindow('2030-02-15', '09:00', '11:30')
    await user.click(cardOf.getByRole('button', { name: 'Registrar contacto' }))

    expect(
      await cardOf.findByText(/nueva entrega el 15\/02\/2030, 09:00 a 11:30/),
    ).toBeInTheDocument()
    expect(contact).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: 'a1', agreement: AGREEMENT.window }),
    )

    inbox.mockResolvedValue({ date: '2030-02-15', urgencies: [], failedDeliveries: [] })
    await user.click(cardOf.getByRole('button', { name: 'Reprogramar con este acuerdo' }))

    expect(
      await screen.findByText(/reprogramado para el 15\/02\/2030, 09:00 a 11:30/),
    ).toBeInTheDocument()
    expect(reschedule).toHaveBeenCalledWith('f1', 'acuerdo-1', 'Acordó el sábado')
    expect(
      await screen.findByText('No hay entregas fallidas pendientes de gestión.'),
    ).toBeInTheDocument()
  })

  it('un contacto posterior sin acuerdo anula el acuerdo anterior', async () => {
    mockApi()
    vi.spyOn(dispatchService, 'recordContact').mockResolvedValue(auditRecord({ action: 'CONTACT' }))
    const { user } = renderPage()
    const cardOf = await findCard()
    await user.click(cardOf.getByLabelText('Se acordó una nueva entrega'))
    await user.type(cardOf.getByLabelText(`Motivo de la gestión de ${TITLE}`), 'Acordó')
    setWindow('2030-02-15', '09:00', '11:30')
    await user.click(cardOf.getByRole('button', { name: 'Registrar contacto' }))
    await cardOf.findByText(/Acuerdo registrado/)

    await user.click(cardOf.getByLabelText('No se logró acordar'))
    await user.type(cardOf.getByLabelText(`Motivo de la gestión de ${TITLE}`), 'Canceló el acuerdo')
    await user.click(cardOf.getByRole('button', { name: 'Registrar contacto' }))

    await waitFor(() => expect(cardOf.queryByText(/Acuerdo registrado/)).not.toBeInTheDocument())
    expect(cardOf.getByRole('button', { name: 'Reprogramar con este acuerdo' })).toBeDisabled()
  })

  it.each([
    {
      caso: 'un conflicto (409)',
      error: createHttpError(409, {
        data: { message: 'Contact must refer to the latest failed attempt' },
      }),
      mensaje: /Conflicto: Contact must refer to the latest failed attempt/,
    },
    {
      caso: 'falta de permisos (403)',
      error: createHttpError(403),
      mensaje: 'No tienes permisos para gestionar entregas fallidas.',
    },
    {
      caso: 'sin conexión',
      error: new AxiosError('Network Error', 'ERR_NETWORK'),
      mensaje: 'No se pudo conectar con el servidor',
    },
  ])('ante $caso lo explica y no da nada por hecho', async ({ error, mensaje }) => {
    mockApi()
    vi.spyOn(dispatchService, 'recordContact').mockRejectedValue(error)
    const { user } = renderPage()
    const cardOf = await findCard()
    await user.click(cardOf.getByLabelText('Se acordó una nueva entrega'))
    await user.type(cardOf.getByLabelText(`Motivo de la gestión de ${TITLE}`), 'Acordó')
    setWindow('2030-02-15', '09:00', '11:30')

    await user.click(cardOf.getByRole('button', { name: 'Registrar contacto' }))

    expect(await cardOf.findByRole('alert')).toHaveTextContent(mensaje)
    expect(cardOf.queryByText(/Acuerdo registrado/)).not.toBeInTheDocument()
    expect(cardOf.getByRole('button', { name: 'Reprogramar con este acuerdo' })).toBeDisabled()
  })

  it('un doble clic registra el contacto una sola vez', async () => {
    mockApi()
    let resolve!: (value: ReturnType<typeof auditRecord>) => void
    const contact = vi
      .spyOn(dispatchService, 'recordContact')
      .mockReturnValue(new Promise((res) => (resolve = res)))
    const { user } = renderPage()
    const cardOf = await findCard()
    await user.click(cardOf.getByLabelText('No se logró acordar'))
    await user.type(cardOf.getByLabelText(`Motivo de la gestión de ${TITLE}`), 'No contestó')

    await user.dblClick(cardOf.getByRole('button', { name: 'Registrar contacto' }))

    expect(contact).toHaveBeenCalledOnce()
    resolve(auditRecord({ action: 'CONTACT' }))
    await waitFor(() =>
      expect(cardOf.getByRole('button', { name: 'Registrar contacto' })).toBeEnabled(),
    )
  })

  it('indica cuando no hay entregas fallidas', async () => {
    mockApi([])
    renderPage()

    expect(
      await screen.findByText('No hay entregas fallidas pendientes de gestión.'),
    ).toBeInTheDocument()
  })

  it('si no se puede cargar lo dice y permite reintentar', async () => {
    const { inbox } = mockApi()
    inbox.mockRejectedValueOnce(createHttpError(500))
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Reintentar' }))

    expect(await findCard()).toBeTruthy()
  })
})
