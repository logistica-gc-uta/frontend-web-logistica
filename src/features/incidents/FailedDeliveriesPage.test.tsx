import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { App } from '../../app/App'
import { emergencyRoutePath, paths } from '../../app/paths'
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
      caso: 'un conflicto (409) sin código conocido',
      error: createHttpError(409, {
        data: { message: 'Contact must refer to the latest failed attempt' },
      }),
      mensaje: /actualiza la bandeja/i,
      oculto: /Contact must refer to the latest failed attempt/i,
    },
    {
      caso: 'una validación (400) con arreglo de mensajes crudos',
      error: createHttpError(400, {
        data: { message: ['attemptId must be a UUID', 'reason should not be empty'] },
      }),
      mensaje: /datos enviados no son v[aá]lidos/i,
      oculto: /attemptId must be a UUID/i,
    },
    {
      caso: 'falta de permisos (403)',
      error: createHttpError(403),
      mensaje: 'No tienes permisos para gestionar entregas fallidas.',
      oculto: null,
    },
    {
      caso: 'sin conexión',
      error: new AxiosError('Network Error', 'ERR_NETWORK'),
      mensaje: 'No se pudo conectar con el servidor',
      oculto: null,
    },
  ])('ante $caso lo explica y no da nada por hecho', async ({ error, mensaje, oculto }) => {
    mockApi()
    vi.spyOn(dispatchService, 'recordContact').mockRejectedValue(error)
    const { user } = renderPage()
    const cardOf = await findCard()
    await user.click(cardOf.getByLabelText('Se acordó una nueva entrega'))
    await user.type(cardOf.getByLabelText('Qué se habló con el destinatario'), 'Acordó')
    await setWindow('2030-02-15', '09:00', '11:30')

    await user.click(cardOf.getByRole('button', { name: 'Registrar contacto' }))

    const alert = await cardOf.findByRole('alert')
    expect(alert).toHaveTextContent(mensaje)
    if (oculto) expect(alert).not.toHaveTextContent(oculto)
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

  it('fallo ordinario con ruta en curso: permite contactar de inmediato, exige confirmar disponibilidad en tienda y luego habilita reprogramar', async () => {
    const inProgressRoute = monitorRoute({
      id: 'r1',
      status: 'IN_PROGRESS',
      stops: [FAILED_STOP],
    })
    const waitingIncident = failedDelivery('f1', {
      attempts: [incidentView().latestAttempt!],
      status: 'WAITING_STORE_READINESS',
      ownership: 'FAILED_DELIVERY',
      latestFailedAttemptId: 'a1',
      readiness: null,
      emergencyId: null,
      emergency: null,
      activeAgreementId: null,
      allowedActions: {
        CONTACT: { allowed: true, reasonCode: null, reason: null },
        CONFIRM_INCIDENT_READY: { allowed: true, reasonCode: null, reason: null },
        RESCHEDULE: {
          allowed: false,
          reasonCode: 'INCIDENT_NOT_READY_AT_STORE',
          reason: 'Store readiness must be confirmed first',
        },
        PICKUP_AGREE: {
          allowed: false,
          reasonCode: 'INCIDENT_NOT_READY_AT_STORE',
          reason: 'Store readiness must be confirmed first',
        },
        PICKUP_DECLINE: { allowed: true, reasonCode: null, reason: null },
        PICKUP_CONFIRM: {
          allowed: false,
          reasonCode: 'PICKUP_NOT_AGREED',
          reason: 'No agreed pickup',
        },
      },
    })
    const contactedIncident = {
      ...waitingIncident,
      status: 'CONTACTED' as const,
      activeAgreementId: 'acuerdo-1',
    }
    const readyIncident = {
      ...contactedIncident,
      status: 'READY_AT_STORE' as const,
      readiness: {
        auditId: 'aud-ready-1',
        attemptId: 'a1',
        confirmedAt: '2030-02-15T15:00:00Z',
        confirmedById: adminUser.id,
      },
      allowedActions: {
        ...waitingIncident.allowedActions,
        CONFIRM_INCIDENT_READY: {
          allowed: false,
          reasonCode: 'INCIDENT_ALREADY_READY',
          reason: 'Already confirmed',
        },
        RESCHEDULE: { allowed: true, reasonCode: null, reason: null },
        PICKUP_AGREE: { allowed: true, reasonCode: null, reason: null },
      },
    }

    const inbox = vi.spyOn(dispatchService, 'inbox').mockResolvedValue({
      date: '2030-02-15',
      urgencies: [],
      failedDeliveries: [waitingIncident],
    })
    vi.spyOn(monitorService, 'listRoutes').mockResolvedValue([inProgressRoute])
    vi.spyOn(dispatchService, 'audit').mockResolvedValue([])
    vi.spyOn(ordersService, 'get').mockResolvedValue(ORDER)
    vi.spyOn(shopService, 'settings').mockResolvedValue(shopSettings())

    const contact = vi
      .spyOn(dispatchService, 'recordContact')
      .mockResolvedValue(auditRecord({ id: 'acuerdo-1', action: 'CONTACT', orderId: 'f1' }))
    const confirmReady = vi.spyOn(dispatchService, 'confirmIncidentReady').mockResolvedValue(
      auditRecord({
        id: 'aud-ready-1',
        action: 'CONFIRM_INCIDENT_READY',
        orderId: 'f1',
        reason: 'Pedido devuelto verificado en bodega',
      }),
    )
    const reschedule = vi
      .spyOn(dispatchService, 'rescheduleWithAgreement')
      .mockResolvedValue(auditRecord({ action: 'RESCHEDULE', orderId: 'f1' }))

    const { user } = renderPage()
    const cardOf = await findCard()

    // Sin confirmar disponibilidad, reprogramar está deshabilitado con motivo en español (sin filtrar inglés crudo).
    expect(cardOf.getByRole('button', { name: 'Reprogramar con este acuerdo' })).toBeDisabled()
    expect(
      cardOf.getByText(
        'Confirma primero que el pedido devuelto o un reemplazo está disponible en tienda.',
      ),
    ).toBeInTheDocument()
    expect(cardOf.queryByText(/Store readiness must be confirmed first/)).not.toBeInTheDocument()

    // Contactar está habilitado inmediatamente aunque la ruta siga en curso.
    inbox.mockResolvedValueOnce({
      date: '2030-02-15',
      urgencies: [],
      failedDeliveries: [contactedIncident],
    })
    await user.click(cardOf.getByLabelText('Se acordó una nueva entrega'))
    await user.type(cardOf.getByLabelText('Qué se habló con el destinatario'), 'Acordó el sábado')
    await setWindow('2030-02-15', '09:00', '11:30')
    await user.click(cardOf.getByRole('button', { name: 'Registrar contacto' }))
    expect(contact).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'f1', attemptId: 'a1', agreement: AGREEMENT.window }),
    )
    await waitFor(() => expect(inbox).toHaveBeenCalledTimes(2))

    // Aún con acuerdo, reprogramar sigue deshabilitado hasta confirmar disponibilidad en tienda.
    expect(cardOf.getByRole('button', { name: 'Reprogramar con este acuerdo' })).toBeDisabled()

    // Confirmación explícita de disponibilidad en tienda: exige motivo no vacío.
    await user.click(cardOf.getByRole('button', { name: 'Confirmar disponibilidad en tienda' }))
    await user.type(cardOf.getByLabelText('Motivo o verificación en tienda'), '   ')
    await user.click(cardOf.getByRole('button', { name: 'Sí, confirmar disponibilidad' }))
    expect(cardOf.getByText('Escribe un motivo breve')).toBeInTheDocument()
    expect(confirmReady).not.toHaveBeenCalled()

    inbox.mockResolvedValueOnce({
      date: '2030-02-15',
      urgencies: [],
      failedDeliveries: [readyIncident],
    })
    await user.clear(cardOf.getByLabelText('Motivo o verificación en tienda'))
    await user.type(
      cardOf.getByLabelText('Motivo o verificación en tienda'),
      '  Pedido devuelto verificado en bodega  ',
    )
    await user.click(cardOf.getByRole('button', { name: 'Sí, confirmar disponibilidad' }))

    expect(confirmReady).toHaveBeenCalledWith({
      orderId: 'f1',
      attemptId: 'a1',
      reason: 'Pedido devuelto verificado en bodega',
    })
    expect(await screen.findByText(/no se replanificó automáticamente/i)).toBeInTheDocument()
    expect(await cardOf.findByText('Disponibilidad en tienda confirmada')).toBeInTheDocument()
    expect(cardOf.queryByText('aud-ready-1')).not.toBeInTheDocument()

    // Ya disponible en tienda: reprogramar se habilita aunque la ruta original siga en curso.
    await waitFor(() =>
      expect(cardOf.getByRole('button', { name: 'Reprogramar con este acuerdo' })).toBeEnabled(),
    )
    inbox.mockResolvedValueOnce({ date: '2030-02-15', urgencies: [], failedDeliveries: [] })
    await user.click(cardOf.getByRole('button', { name: 'Reprogramar con este acuerdo' }))
    expect(reschedule).toHaveBeenCalledWith('f1', 'acuerdo-1', 'Acordó el sábado')
  })

  it('ante conflicto 409 al confirmar disponibilidad muestra mensaje accionable y recarga la bandeja', async () => {
    const waitingIncident = failedDelivery('f1', {
      attempts: [incidentView().latestAttempt!],
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
    })
    const { inbox } = mockApi([waitingIncident])
    vi.spyOn(dispatchService, 'confirmIncidentReady').mockRejectedValue(
      createHttpError(409, {
        data: { statusCode: 409, code: 'INCIDENT_ALREADY_READY', message: 'Already ready' },
      }),
    )

    const { user } = renderPage()
    const cardOf = await findCard()
    await user.click(cardOf.getByRole('button', { name: 'Confirmar disponibilidad en tienda' }))
    await user.type(cardOf.getByLabelText('Motivo o verificación en tienda'), 'Verificado')
    await user.click(cardOf.getByRole('button', { name: 'Sí, confirmar disponibilidad' }))

    expect(await cardOf.findByRole('alert')).toHaveTextContent(/ya fue confirmada/i)
    await waitFor(() => expect(inbox).toHaveBeenCalledTimes(2))
  })

  it('si un conflicto 409 saca el pedido de la bandeja al recargar, el error sigue visible y el doble clic envía una sola vez', async () => {
    const waitingIncident = failedDelivery('f1', {
      attempts: [incidentView().latestAttempt!],
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
    })
    const { inbox } = mockApi([waitingIncident])
    let rejectReady!: (err: unknown) => void
    const confirmReady = vi
      .spyOn(dispatchService, 'confirmIncidentReady')
      .mockReturnValue(new Promise((_res, rej) => (rejectReady = rej)))

    const { user } = renderPage()
    const cardOf = await findCard()
    await user.click(cardOf.getByRole('button', { name: 'Confirmar disponibilidad en tienda' }))
    await user.type(cardOf.getByLabelText('Motivo o verificación en tienda'), 'Verificado')
    await user.dblClick(cardOf.getByRole('button', { name: 'Sí, confirmar disponibilidad' }))

    expect(confirmReady).toHaveBeenCalledOnce()

    inbox.mockResolvedValueOnce({ date: '2030-02-15', urgencies: [], failedDeliveries: [] })
    rejectReady(
      createHttpError(409, {
        data: { statusCode: 409, code: 'ORDER_COMMERCIALLY_RESOLVED', message: 'Delivered' },
      }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(/entregado o cancelado/i)
    expect(
      await screen.findByText('No hay entregas fallidas pendientes de gestión.'),
    ).toBeInTheDocument()
  })

  it('cuando el servidor niega CONTACT y CONFIRM_INCIDENT_READY deshabilita los controles y muestra motivos en español', async () => {
    mockApi([
      failedDelivery('f1', {
        attempts: [incidentView().latestAttempt!],
        status: 'REVIEW_WITHOUT_FAILED_ATTEMPT',
        ownership: 'ADMINISTRATIVE_REVIEW',
        latestFailedAttemptId: null,
        readiness: null,
        activeAgreementId: null,
        allowedActions: {
          CONTACT: {
            allowed: false,
            reasonCode: 'FAILED_ATTEMPT_NOT_FOUND',
            reason: 'No canonical attempt',
          },
          CONFIRM_INCIDENT_READY: {
            allowed: false,
            reasonCode: 'CLAIM_NOT_RELEASED',
            reason: 'Claim still active',
          },
          RESCHEDULE: {
            allowed: false,
            reasonCode: 'CLAIM_NOT_RELEASED',
            reason: 'Claim still active',
          },
          PICKUP_AGREE: {
            allowed: false,
            reasonCode: 'CLAIM_NOT_RELEASED',
            reason: 'Claim still active',
          },
          PICKUP_DECLINE: {
            allowed: false,
            reasonCode: 'FAILED_ATTEMPT_NOT_FOUND',
            reason: 'No canonical attempt',
          },
          PICKUP_CONFIRM: {
            allowed: false,
            reasonCode: 'PICKUP_NOT_AGREED',
            reason: 'None',
          },
        },
      }),
    ])

    renderPage()
    const cardOf = await findCard()

    expect(
      cardOf.getByRole('button', { name: 'Confirmar disponibilidad en tienda' }),
    ).toBeDisabled()
    expect(
      cardOf.getByRole('group', { name: 'Registrar contacto con el destinatario' }),
    ).toBeDisabled()
    expect(cardOf.getByLabelText('Retiro en tienda')).toBeDisabled()
    expect(
      cardOf.getByText('No hay un intento fallido vigente registrado para gestionar esta acción.'),
    ).toBeInTheDocument()
    expect(cardOf.queryByText(/No canonical attempt/)).not.toBeInTheDocument()
    expect(cardOf.queryByText(/Claim still active/)).not.toBeInTheDocument()
  })

  it('un incidente en custodia por emergencia redirige a Emergencias y oculta controles ordinarios', async () => {
    mockApi([
      failedDelivery('f1', {
        attempts: [incidentView().latestAttempt!],
        status: 'EMERGENCY_CUSTODY',
        ownership: 'EMERGENCY_CUSTODY',
        latestFailedAttemptId: 'a1',
        readiness: null,
        emergencyId: 'em-secret-uuid',
        emergency: {
          emergencyId: 'em-secret-uuid',
          routeId: 'r1',
          recoveryResolved: false,
          pendingUnitsCount: 2,
          totalUnitsCount: 3,
        },
        activeAgreementId: null,
        allowedActions: {
          CONTACT: {
            allowed: false,
            reasonCode: 'EMERGENCY_CUSTODY_SEPARATE',
            reason: 'Managed in emergencies',
          },
          CONFIRM_INCIDENT_READY: {
            allowed: false,
            reasonCode: 'EMERGENCY_CUSTODY_SEPARATE',
            reason: 'Managed in emergencies',
          },
          RESCHEDULE: {
            allowed: false,
            reasonCode: 'EMERGENCY_CUSTODY_SEPARATE',
            reason: 'Managed in emergencies',
          },
          PICKUP_AGREE: {
            allowed: false,
            reasonCode: 'EMERGENCY_CUSTODY_SEPARATE',
            reason: 'Managed in emergencies',
          },
          PICKUP_DECLINE: {
            allowed: false,
            reasonCode: 'EMERGENCY_CUSTODY_SEPARATE',
            reason: 'Managed in emergencies',
          },
          PICKUP_CONFIRM: {
            allowed: false,
            reasonCode: 'PICKUP_NOT_AGREED',
            reason: 'No agreed pickup',
          },
        },
      }),
    ])

    renderPage()
    const cardOf = await findCard()

    expect(cardOf.getByText('En custodia por emergencia', { selector: '.badge' })).toBeInTheDocument()
    expect(cardOf.getByText(/2 de 3 unidades pendientes de recuperación/i)).toBeInTheDocument()
    const link = cardOf.getByRole('link', { name: 'Ir a Emergencias' })
    // #67: el enlace lleva a la emergencia de esa ruta, no solo a la lista.
    expect(link).toHaveAttribute('href', emergencyRoutePath('r1'))
    expect(cardOf.queryByRole('button', { name: 'Registrar contacto' })).not.toBeInTheDocument()
    expect(
      cardOf.queryByRole('button', { name: 'Confirmar disponibilidad en tienda' }),
    ).not.toBeInTheDocument()
    expect(
      cardOf.queryByRole('button', { name: 'Reprogramar con este acuerdo' }),
    ).not.toBeInTheDocument()
    expect(cardOf.queryByLabelText('Retiro en tienda')).not.toBeInTheDocument()
    expect(cardOf.queryByRole('link', { name: /Pérdida o reemplazo/i })).not.toBeInTheDocument()
    expect(cardOf.queryByText(/Se perdió o se dañó/i)).not.toBeInTheDocument()
    expect(cardOf.queryByText(/em-secret-uuid/)).not.toBeInTheDocument()
  })

  it('mientras la recarga GET está pendiente tras una mutación o aviso en vivo bloquea los controles y evita un segundo clic sobre el snapshot anterior', async () => {
    const waitingIncident = failedDelivery('f1', {
      attempts: [incidentView().latestAttempt!],
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
    })
    const readyIncident = {
      ...waitingIncident,
      status: 'READY_AT_STORE' as const,
      activeAgreementId: 'agr-1',
      readiness: {
        auditId: 'aud-ready-1',
        attemptId: 'a1',
        confirmedAt: '2030-02-15T15:00:00Z',
        confirmedById: adminUser.id,
      },
      allowedActions: {
        ...waitingIncident.allowedActions,
        CONFIRM_INCIDENT_READY: {
          allowed: false,
          reasonCode: 'INCIDENT_ALREADY_READY',
          reason: 'Already ready',
        },
        RESCHEDULE: { allowed: true, reasonCode: null, reason: null },
        PICKUP_AGREE: { allowed: true, reasonCode: null, reason: null },
      },
    }

    const { inbox } = mockApi([waitingIncident])
    const confirmReady = vi
      .spyOn(dispatchService, 'confirmIncidentReady')
      .mockResolvedValue(auditRecord({ id: 'aud-ready-1', action: 'CONFIRM_INCIDENT_READY', orderId: 'f1' }))
    const reschedule = vi
      .spyOn(dispatchService, 'rescheduleWithAgreement')
      .mockResolvedValue(auditRecord({ id: 'res-1', action: 'RESCHEDULE', orderId: 'f1' }))

    const { user } = renderPage()
    const cardOf = await findCard()
    // En un incidente ordinario (no custodia) el enlace de pérdida o reemplazo sigue disponible.
    expect(cardOf.getByRole('link', { name: 'Pérdida o reemplazo' })).toHaveAttribute(
      'href',
      expect.stringContaining('#perdidas'),
    )

    // Preparamos una recarga GET diferida para después de que el POST ya resolvió.
    let resolvePostRefresh!: (value: { date: string; urgencies: []; failedDeliveries: (typeof waitingIncident)[] }) => void
    inbox.mockReturnValueOnce(new Promise((res) => (resolvePostRefresh = res)))

    await user.click(cardOf.getByRole('button', { name: 'Confirmar disponibilidad en tienda' }))
    await user.type(cardOf.getByLabelText('Motivo o verificación en tienda'), 'Verificado')
    await user.click(cardOf.getByRole('button', { name: 'Sí, confirmar disponibilidad' }))

    expect(confirmReady).toHaveBeenCalledOnce()

    // El POST ya resolvió, pero GET aún no responde: los controles del snapshot viejo deben estar deshabilitados.
    await waitFor(() =>
      expect(
        cardOf.getByRole('button', { name: 'Confirmar disponibilidad en tienda' }),
      ).toBeDisabled(),
    )
    expect(
      cardOf.getByRole('group', { name: 'Registrar contacto con el destinatario' }),
    ).toBeDisabled()
    await user.click(cardOf.getByRole('button', { name: 'Confirmar disponibilidad en tienda' }))
    expect(confirmReady).toHaveBeenCalledOnce()

    resolvePostRefresh({ date: '2030-02-15', urgencies: [], failedDeliveries: [readyIncident] })
    expect(await cardOf.findByText('Disponibilidad en tienda confirmada')).toBeInTheDocument()
    await waitFor(() =>
      expect(cardOf.getByRole('button', { name: 'Reprogramar con este acuerdo' })).toBeEnabled(),
    )

    // Ahora probamos una invalidación en vivo con GET diferido: los controles vuelven a bloquearse hasta recibir el nuevo snapshot.
    let resolveRealtimeRefresh!: (value: { date: string; urgencies: []; failedDeliveries: (typeof readyIncident)[] }) => void
    inbox.mockReturnValueOnce(new Promise((res) => (resolveRealtimeRefresh = res)))

    socket.fire('dispatch.incident.updated', { orderId: 'f1', action: 'CONTACT' })

    await waitFor(() =>
      expect(cardOf.getByRole('button', { name: 'Reprogramar con este acuerdo' })).toBeDisabled(),
    )
    await user.click(cardOf.getByRole('button', { name: 'Reprogramar con este acuerdo' }))
    expect(reschedule).not.toHaveBeenCalled()

    resolveRealtimeRefresh({ date: '2030-02-15', urgencies: [], failedDeliveries: [readyIncident] })
    await waitFor(() =>
      expect(cardOf.getByRole('button', { name: 'Reprogramar con este acuerdo' })).toBeEnabled(),
    )
  })

  it('conserva el borrador de disponibilidad ante error reintentable del mismo intento y lo reinicia cuando cambia el intento canónico', async () => {
    const attempt1 = incidentView().latestAttempt!
    const attempt2 = {
      id: 'a2',
      stopId: 'stop-f1',
      failureReason: 'RECIPIENT_REFUSED',
      recordedAt: '2030-02-15T18:00:00Z',
    }
    const makeWaiting = (attempt: typeof attempt1) =>
      failedDelivery('f1', {
        attempts: [attempt],
        status: 'WAITING_STORE_READINESS',
        ownership: 'FAILED_DELIVERY',
        latestFailedAttemptId: attempt.id,
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
      })

    const { inbox } = mockApi([makeWaiting(attempt1)])
    const confirmReady = vi
      .spyOn(dispatchService, 'confirmIncidentReady')
      .mockRejectedValueOnce(createHttpError(500, { data: { message: 'Transient backend failure' } }))
      .mockResolvedValueOnce(auditRecord({ id: 'aud-ready-2', action: 'CONFIRM_INCIDENT_READY', orderId: 'f1' }))

    const { user } = renderPage()
    const cardOf = await findCard()

    await user.click(cardOf.getByRole('button', { name: 'Confirmar disponibilidad en tienda' }))
    await user.type(cardOf.getByLabelText('Motivo o verificación en tienda'), 'Verificado intento a1')

    // Error reintentable con el mismo intento canónico a1: conserva el formulario abierto y el texto escrito.
    inbox.mockResolvedValueOnce({
      date: '2030-02-15',
      urgencies: [],
      failedDeliveries: [makeWaiting(attempt1)],
    })
    await user.click(cardOf.getByRole('button', { name: 'Sí, confirmar disponibilidad' }))

    const alert = await cardOf.findByRole('alert')
    expect(alert).toHaveTextContent(/servidor no pudo completar/i)
    expect(alert).not.toHaveTextContent('Transient backend failure')
    await waitFor(() =>
      expect(cardOf.getByLabelText('Motivo o verificación en tienda')).toHaveValue(
        'Verificado intento a1',
      ),
    )

    // Ahora cambia el intento canónico a a2 por actualización en vivo: debe cerrarse y descartarse el borrador viejo.
    inbox.mockResolvedValueOnce({
      date: '2030-02-15',
      urgencies: [],
      failedDeliveries: [makeWaiting(attempt2)],
    })
    socket.fire('dispatch.incident.updated', { orderId: 'f1', action: 'FAILED' })

    await waitFor(() =>
      expect(cardOf.queryByLabelText('Motivo o verificación en tienda')).not.toBeInTheDocument(),
    )

    // Al abrir de nuevo, el campo empieza vacío y confirma sobre el nuevo intento a2.
    await user.click(cardOf.getByRole('button', { name: 'Confirmar disponibilidad en tienda' }))
    expect(cardOf.getByLabelText('Motivo o verificación en tienda')).toHaveValue('')
    await user.type(cardOf.getByLabelText('Motivo o verificación en tienda'), 'Verificado intento a2')
    await user.click(cardOf.getByRole('button', { name: 'Sí, confirmar disponibilidad' }))

    expect(confirmReady).toHaveBeenLastCalledWith({
      orderId: 'f1',
      attemptId: 'a2',
      reason: 'Verificado intento a2',
    })
  })
})
