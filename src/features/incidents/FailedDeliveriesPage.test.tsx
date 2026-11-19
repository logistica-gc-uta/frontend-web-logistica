import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { App } from '../../app/App'
import { paths } from '../../app/paths'
import { auditRecord, failedDelivery } from '../../test/dispatchFixtures'
import { adminSession, adminUser, guestOrder } from '../../test/fixtures'
import { createHttpError } from '../../test/http'
import { monitorRoute, stopWith } from '../../test/monitorFixtures'
import { shopSettings } from '../../test/shopFixtures'
import { shopService } from '../shop/shopService'
import { renderWithProviders } from '../../test/renderWithProviders'
import { formatTimeLabel } from '../orders/orderInput'
import { dispatchService } from '../dispatch/dispatchService'
import { monitorService } from '../monitor/monitorService'
import { ordersService } from '../orders/ordersService'
import { IncidentCard, type IncidentCardProps, type RegisteredAgreement } from './IncidentCard'
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
  render(
    <MemoryRouter>
      <IncidentCard {...props} />
    </MemoryRouter>,
  )
  return props
}

const card = () => within(screen.getByRole('article', { name: `Entrega fallida ${TITLE}` }))
const reasonField = () => card().getByLabelText('Qué se habló con el destinatario')
/** Las horas se eligen en una lista propia: se abre el desplegable y se toma la opción. */
const pickTime = async (label: string, time: string) => {
  await userEvent.click(card().getByLabelText(label))
  await userEvent.click(await screen.findByRole('option', { name: formatTimeLabel(time) }))
}
const setWindow = async (day: string, from: string, to: string) => {
  fireEvent.change(card().getByLabelText('Día acordado'), { target: { value: day } })
  await pickTime('Desde', from)
  await pickTime('Hasta', to)
}

describe('IncidentCard', () => {
  it('muestra el intento con su motivo, la ruta original, el avance y el siguiente paso', () => {
    renderCard()

    // Resumen corto de la situación: qué pasó, el avance y lo que sigue; el detalle queda plegado.
    expect(card().getByRole('list', { name: 'Avance de la gestión' })).toBeInTheDocument()
    expect(
      card()
        .getByText(/Siguiente paso:/)
        .closest('p'),
    ).toHaveTextContent('contactar al destinatario o acordar el retiro en tienda')
    // El resumen cuenta qué pasó; el historial plegado detalla la visita.
    expect(card().getByText('Destinatario ausente')).toBeInTheDocument()
    const history = within(card().getByRole('list', { name: `Historial de ${TITLE}` }))
    // La visita fallida dice su motivo de forma explícita.
    expect(history.getByText('Visita fallida')).toBeInTheDocument()
    expect(history.getByText('Motivo: Destinatario ausente')).toBeInTheDocument()
    expect(history.getByText(/Ruta FIC-02 · 21\/10\/2026, 10:00/)).toHaveTextContent(
      'Completada · Chofer Carlos Chofer',
    )
  })

  it('la visita fallida del historial muestra lo que anotó el chofer en la app', () => {
    const stop = { ...FAILED_STOP, failureContext: 'Nadie abrió la puerta y el timbre no funciona' }
    renderCard({ incident: incidentView({ visits: [{ route: R1, stop }] }) })

    const history = within(card().getByRole('list', { name: `Historial de ${TITLE}` }))
    expect(history.getByText('Motivo: Destinatario ausente')).toBeInTheDocument()
    expect(
      history.getByText('Qué pasó: Nadie abrió la puerta y el timbre no funciona'),
    ).toBeInTheDocument()
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

    const entry = within(card().getByRole('list', { name: `Historial de ${TITLE}` }))
    expect(entry.getByText('15/02/2030, 10:00')).toBeInTheDocument()
    expect(entry.getByText('Contacto con el destinatario · Otro administrador')).toBeInTheDocument()
    expect(entry.getByText('Motivo: No contestó')).toBeInTheDocument()
  })

  it('exige indicar el resultado antes de registrar el contacto', async () => {
    const { onContact } = renderCard()

    await userEvent.click(card().getByRole('button', { name: 'Registrar contacto' }))

    expect(card().getByText('Indica si se acordó una nueva entrega')).toBeInTheDocument()
    expect(card().queryByLabelText('Qué se habló con el destinatario')).not.toBeInTheDocument()
    expect(onContact).not.toHaveBeenCalled()
  })

  it('con acuerdo pide un motivo; sin acuerdo no lo pide ni muestra el campo', async () => {
    const { onContact } = renderCard()

    await userEvent.click(card().getByLabelText('Se acordó una nueva entrega'))
    await userEvent.click(card().getByRole('button', { name: 'Registrar contacto' }))
    expect(card().getByText('Escribe un motivo breve de la gestión')).toBeInTheDocument()
    expect(onContact).not.toHaveBeenCalled()

    await userEvent.click(card().getByLabelText('No se logró acordar'))
    expect(card().queryByLabelText('Qué se habló con el destinatario')).not.toBeInTheDocument()
    expect(card().queryByText('Escribe un motivo breve de la gestión')).not.toBeInTheDocument()
  })

  it('un contacto sin acuerdo se registra con el último intento y sin fecha, y limpia el formulario', async () => {
    const { onContact } = renderCard()
    await userEvent.click(card().getByLabelText('No se logró acordar'))

    await userEvent.click(card().getByRole('button', { name: 'Registrar contacto' }))

    expect(onContact).toHaveBeenCalledWith({
      orderId: 'f1',
      attemptId: 'a1',
      agreement: null,
      reason: 'No se logró acordar con el destinatario',
    })
    expect(card().getByLabelText('No se logró acordar')).not.toBeChecked()
  })

  it('con acuerdo exige una franja válida y futura, y la envía en hora de Guayaquil', async () => {
    const { onContact } = renderCard()
    await userEvent.click(card().getByLabelText('Se acordó una nueva entrega'))
    await userEvent.type(reasonField(), 'Acordó el sábado')

    await userEvent.click(card().getByRole('button', { name: 'Registrar contacto' }))
    expect(card().getByText('Indica el día y la franja horaria acordados')).toBeInTheDocument()

    await setWindow('2030-02-15', '11:00', '09:00')
    await userEvent.click(card().getByRole('button', { name: 'Registrar contacto' }))
    expect(card().getByText('La hora final debe ser posterior a la inicial')).toBeInTheDocument()

    await setWindow('2001-01-01', '09:00', '10:00')
    await userEvent.click(card().getByRole('button', { name: 'Registrar contacto' }))
    expect(card().getByText('La franja acordada debe ser futura')).toBeInTheDocument()
    expect(onContact).not.toHaveBeenCalled()

    await setWindow('2030-02-15', '09:00', '11:30')
    await userEvent.click(card().getByRole('button', { name: 'Registrar contacto' }))

    expect(onContact).toHaveBeenCalledWith({
      orderId: 'f1',
      attemptId: 'a1',
      agreement: AGREEMENT.window,
      reason: 'Acordó el sábado',
    })
  })

  it('si el contacto no se registra, conserva lo elegido para reintentar', async () => {
    renderCard({ onContact: vi.fn().mockResolvedValue(false) })
    await userEvent.click(card().getByLabelText('Se acordó una nueva entrega'))
    await userEvent.type(reasonField(), 'Acordó el sábado')

    await userEvent.click(card().getByRole('button', { name: 'Registrar contacto' }))

    expect(card().getByLabelText('Se acordó una nueva entrega')).toBeChecked()
    expect(reasonField()).toHaveValue('Acordó el sábado')
  })

  it('sin acuerdo registrado no se puede reprogramar', () => {
    renderCard()

    expect(card().getByRole('button', { name: 'Reprogramar con este acuerdo' })).toBeDisabled()
    expect(card().getByText(/primero registra un contacto en el que se acordó/)).toBeInTheDocument()
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
    vi.spyOn(shopService, 'settings').mockResolvedValue(shopSettings())
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
    await user.type(cardOf.getByLabelText('Qué se habló con el destinatario'), 'Acordó el sábado')
    await setWindow('2030-02-15', '09:00', '11:30')
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

  it('con un acuerdo registrado el formulario queda bloqueado: no se vuelve a ingresar información', async () => {
    mockApi()
    vi.spyOn(dispatchService, 'recordContact').mockResolvedValue(auditRecord({ action: 'CONTACT' }))
    const { user } = renderPage()
    const cardOf = await findCard()
    await user.click(cardOf.getByLabelText('Se acordó una nueva entrega'))
    await user.type(cardOf.getByLabelText('Qué se habló con el destinatario'), 'Acordó')
    await setWindow('2030-02-15', '09:00', '11:30')
    await user.click(cardOf.getByRole('button', { name: 'Registrar contacto' }))
    await cardOf.findByText(/Acuerdo registrado/)

    expect(cardOf.getByLabelText('Se acordó una nueva entrega')).toBeChecked()
    expect(cardOf.getByLabelText('Se acordó una nueva entrega')).toBeDisabled()
    expect(cardOf.getByLabelText('No se logró acordar')).toBeDisabled()
    expect(cardOf.queryByLabelText('Qué se habló con el destinatario')).not.toBeInTheDocument()
    expect(cardOf.queryByRole('button', { name: 'Registrar contacto' })).not.toBeInTheDocument()
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
    await user.type(cardOf.getByLabelText('Qué se habló con el destinatario'), 'Acordó')
    await setWindow('2030-02-15', '09:00', '11:30')

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

    await user.dblClick(cardOf.getByRole('button', { name: 'Registrar contacto' }))

    expect(contact).toHaveBeenCalledOnce()
    resolve(auditRecord({ action: 'CONTACT' }))
    await waitFor(() =>
      expect(cardOf.getByRole('button', { name: 'Registrar contacto' })).toBeEnabled(),
    )
  })

  it('con varias fallas se atiende una a la vez, con Anterior y Siguiente', async () => {
    mockApi([
      failedDelivery('f1', { attempts: [incidentView().latestAttempt!] }),
      failedDelivery('f2', { attempts: [{ ...incidentView().latestAttempt!, id: 'a2' }] }),
    ])
    const { user } = renderPage()

    expect(await screen.findByText('Falla 1')).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Siguiente' }))

    expect(screen.getByText('Falla 2')).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
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
