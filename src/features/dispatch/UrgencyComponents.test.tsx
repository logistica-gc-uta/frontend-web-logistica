import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { auditRecord, urgencyProposal } from '../../test/dispatchFixtures'
import { orders } from '../../test/fixtures'
import { availableDriver, busyDriver } from '../../test/planningFixtures'
import { DispatchAuditList } from './DispatchAuditList'
import { UrgencyCard, type UrgencyCardProps } from './UrgencyCard'

const order = orders[0]
const TITLE = order.deliveryAddress

const renderCard = (overrides: Partial<UrgencyCardProps> = {}) => {
  const handlers = {
    onConfirm: vi.fn().mockResolvedValue(true),
    onReject: vi.fn().mockResolvedValue(true),
    onPrioritize: vi.fn().mockResolvedValue(true),
    onReschedule: vi.fn().mockResolvedValue(true),
  }
  render(
    <UrgencyCard
      proposal={urgencyProposal(order.id)}
      order={order}
      targetRouteName="Ruta guardada 1 · FIC-02"
      drivers={[availableDriver, busyDriver]}
      state={undefined}
      {...handlers}
      {...overrides}
    />,
  )
  return handlers
}

const card = () => within(screen.getByRole('article', { name: `Urgencia ${TITLE}` }))
const typeReason = (text: string) =>
  userEvent.type(card().getByLabelText(`Motivo de la decisión para ${TITLE}`), text)

describe('UrgencyCard', () => {
  it('muestra el pedido pendiente y explica la propuesta de insertar en una ruta', () => {
    renderCard()

    expect(card().getByText('Insertar en una ruta')).toBeInTheDocument()
    expect(card().getByText('Pendiente (PENDING)')).toBeInTheDocument()
    expect(card().getByText('María Pérez')).toBeInTheDocument()
    expect(card().getByText('FIC-02')).toBeInTheDocument()
    expect(card().getByText('Ruta guardada 1 · FIC-02')).toBeInTheDocument()
    expect(card().getByText(/quedaría con 2 paradas \(2,40 km estimados\)/)).toBeInTheDocument()
  })

  it('exige el motivo antes de cualquier decisión', async () => {
    const { onConfirm, onPrioritize } = renderCard()

    await userEvent.click(card().getByRole('button', { name: 'Insertar en la ruta' }))
    await userEvent.click(card().getByRole('button', { name: 'Priorizar' }))

    expect(card().getByText('Escribe el motivo de la decisión')).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onPrioritize).not.toHaveBeenCalled()
  })

  it.each([
    ['Insertar en la ruta', 'onConfirm', [urgencyProposal(order.id), 'Cliente llamó']],
    ['Rechazar propuesta', 'onReject', [urgencyProposal(order.id), 'Cliente llamó']],
    ['Priorizar', 'onPrioritize', [order.id, 'Cliente llamó']],
  ] as const)('"%s" envía la decisión con el motivo escrito', async (button, handler, args) => {
    const handlers = renderCard()
    await typeReason('  Cliente llamó  ')

    await userEvent.click(card().getByRole('button', { name: button }))

    expect(handlers[handler]).toHaveBeenCalledWith(...args)
  })

  it('tras una decisión registrada limpia el motivo para no reutilizarlo', async () => {
    renderCard()
    await typeReason('Cliente llamó')

    await userEvent.click(card().getByRole('button', { name: 'Priorizar' }))

    expect(card().getByLabelText(`Motivo de la decisión para ${TITLE}`)).toHaveValue('')
  })

  it('si la decisión no se registró, conserva el motivo para reintentar', async () => {
    renderCard({ onPrioritize: vi.fn().mockResolvedValue(false) })
    await typeReason('Cliente llamó')

    await userEvent.click(card().getByRole('button', { name: 'Priorizar' }))

    expect(card().getByLabelText(`Motivo de la decisión para ${TITLE}`)).toHaveValue(
      'Cliente llamó',
    )
  })

  it('una salida nueva solo deja elegir los choferes propuestos y libres', async () => {
    const proposal = urgencyProposal(order.id, {
      kind: 'NEW_ROUTE',
      routeId: null,
      availableDriverIds: ['driver-1'],
    })
    const { onConfirm } = renderCard({ proposal })

    expect(card().getByText(/están completas o ya se iniciaron/)).toBeInTheDocument()
    const select = card().getByLabelText(`Chofer para la salida de ${TITLE}`)
    expect(
      within(select).getByRole('option', {
        name: 'Luis Transportista · ocupado hasta que regrese al depósito',
      }),
    ).toBeDisabled()
    const create = card().getByRole('button', { name: 'Crear salida nueva' })
    expect(create).toBeDisabled()

    await userEvent.selectOptions(select, 'driver-1')
    await typeReason('Rutas llenas')
    await userEvent.click(create)

    expect(onConfirm).toHaveBeenCalledWith(proposal, 'Rutas llenas', 'driver-1')
  })

  it('un pedido bloqueado explica sus motivos y no ofrece confirmar ni rechazar', () => {
    renderCard({
      proposal: urgencyProposal(order.id, {
        kind: 'BLOCKED',
        routeId: null,
        reasons: ['MISSING_ZONE_DEPOT_COORDINATES', 'NO_AVAILABLE_DRIVER', 'CODIGO_NUEVO'],
      }),
    })

    expect(card().getByText('Bloqueado')).toHaveClass('badge--danger')
    expect(
      within(card().getByRole('list', { name: 'Motivos' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'La zona no tiene depósito configurado',
      'No hay choferes disponibles para una salida nueva',
      'CODIGO_NUEVO',
    ])
    expect(card().queryByRole('button', { name: /Insertar|Crear|Rechazar/ })).toBeNull()
    expect(card().getByRole('button', { name: 'Priorizar' })).toBeInTheDocument()
  })

  it('reprograma con día y franja en hora de Guayaquil', async () => {
    const { onReschedule } = renderCard()
    await userEvent.click(card().getByRole('button', { name: 'Reprogramar…' }))
    const form = within(screen.getByRole('group', { name: `Reprogramar ${TITLE}` }))
    fireEvent.change(form.getByLabelText('Nuevo día de entrega'), {
      target: { value: '2030-02-15' },
    })
    fireEvent.change(form.getByLabelText('Desde (hora de Guayaquil)'), {
      target: { value: '09:00' },
    })
    fireEvent.change(form.getByLabelText('Hasta (hora de Guayaquil)'), {
      target: { value: '11:30' },
    })
    await typeReason('Sin cupo hoy')

    await userEvent.click(form.getByRole('button', { name: 'Guardar reprogramación' }))

    expect(onReschedule).toHaveBeenCalledWith({
      orderId: order.id,
      scheduledDeliveryDate: '2030-02-15T09:00:00-05:00',
      deliveryWindowStart: '2030-02-15T09:00:00-05:00',
      deliveryWindowEnd: '2030-02-15T11:30:00-05:00',
      reason: 'Sin cupo hoy',
    })
  })

  it('no reprograma con datos incompletos o una franja al revés', async () => {
    const { onReschedule } = renderCard()
    await userEvent.click(card().getByRole('button', { name: 'Reprogramar…' }))
    const form = within(screen.getByRole('group', { name: `Reprogramar ${TITLE}` }))
    await typeReason('x')

    await userEvent.click(form.getByRole('button', { name: 'Guardar reprogramación' }))
    expect(
      form.getByText('Indica el día y la franja horaria de la nueva entrega'),
    ).toBeInTheDocument()

    fireEvent.change(form.getByLabelText('Nuevo día de entrega'), {
      target: { value: '2030-02-15' },
    })
    fireEvent.change(form.getByLabelText('Desde (hora de Guayaquil)'), {
      target: { value: '11:00' },
    })
    fireEvent.change(form.getByLabelText('Hasta (hora de Guayaquil)'), {
      target: { value: '09:00' },
    })
    await userEvent.click(form.getByRole('button', { name: 'Guardar reprogramación' }))

    expect(form.getByText('La hora final debe ser posterior a la inicial')).toBeInTheDocument()
    expect(onReschedule).not.toHaveBeenCalled()
  })

  it('mientras guarda bloquea las acciones y si falla muestra el error', () => {
    renderCard({ state: { status: 'saving' } })
    expect(card().getByRole('button', { name: 'Guardando...' })).toBeDisabled()
    expect(card().getByRole('button', { name: 'Priorizar' })).toBeDisabled()
  })

  it('una falla se muestra en la tarjeta', () => {
    renderCard({ state: { status: 'failed', error: 'No se pudo conectar con el servidor' } })

    expect(card().getByRole('alert')).toHaveTextContent('No se pudo conectar con el servidor')
  })

  it('si faltan los datos del pedido lo identifica por su código', () => {
    render(
      <UrgencyCard
        proposal={urgencyProposal('12345678-aaaa')}
        order={undefined}
        targetRouteName={undefined}
        drivers={[]}
        state={undefined}
        onConfirm={vi.fn().mockResolvedValue(true)}
        onReject={vi.fn().mockResolvedValue(true)}
        onPrioritize={vi.fn().mockResolvedValue(true)}
        onReschedule={vi.fn().mockResolvedValue(true)}
      />,
    )

    expect(screen.getByRole('article', { name: 'Urgencia Pedido 12345678' })).toBeInTheDocument()
    expect(screen.getByText(/una ruta de hoy sin iniciar/)).toBeInTheDocument()
  })
})

describe('DispatchAuditList', () => {
  const describeResource = vi.fn(() => 'Pedido: Av. Los Chasquis')

  it('lista las decisiones, la más reciente primero, con responsable y motivo', () => {
    render(
      <DispatchAuditList
        currentUserId="admin-1"
        describeResource={describeResource}
        records={[
          auditRecord({ id: 'a', action: 'PRIORITIZE', recordedAt: '2026-10-21T15:00:00Z' }),
          auditRecord({
            id: 'b',
            action: 'REJECT',
            outcome: 'REJECTED',
            actorId: 'otro',
            reason: 'Esperar',
            recordedAt: '2026-10-21T16:00:00Z',
          }),
        ]}
      />,
    )

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Rechazar propuesta')
    expect(items[0]).toHaveTextContent('Rechazada')
    expect(items[0]).toHaveTextContent('Otro administrador · Motivo: Esperar')
    expect(items[1]).toHaveTextContent('Priorizar')
    expect(items[1]).toHaveTextContent('Tú · Motivo: Calle cerrada')
    expect(items[1]).toHaveTextContent('Pedido: Av. Los Chasquis')
  })

  it('indica cuando todavía no hay decisiones hoy', () => {
    render(
      <DispatchAuditList
        currentUserId="admin-1"
        describeResource={describeResource}
        records={[]}
      />,
    )

    expect(screen.getByText('Todavía no hay decisiones registradas hoy.')).toBeInTheDocument()
  })
})
