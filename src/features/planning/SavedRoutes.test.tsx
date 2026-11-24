import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { availableDriver, busyDriver, savedRouteDetail } from '../../test/planningFixtures'
import { SavedRoutes } from './SavedRoutes'
import type { Driver, SavedRouteDetail } from './types'
import type { KeyedActionState } from '../../hooks/useKeyedActions'

const renderSaved = (
  routes: SavedRouteDetail[],
  {
    drivers = [availableDriver, busyDriver],
    actions = {},
    applied = true,
    withCancel = false,
  }: {
    drivers?: Driver[]
    actions?: Record<string, KeyedActionState>
    applied?: boolean
    withCancel?: boolean
  } = {},
) => {
  const onAssign = vi.fn()
  const onReassign = vi.fn()
  const onReorder = vi.fn().mockResolvedValue(applied)
  const onMove = vi.fn().mockResolvedValue(applied)
  const onCancel = vi.fn().mockResolvedValue(applied)
  render(
    <SavedRoutes
      day="2030-02-14"
      routes={routes}
      drivers={drivers}
      actions={actions}
      onAssign={onAssign}
      onReassign={onReassign}
      onReorder={onReorder}
      onMove={onMove}
      onCancel={withCancel ? onCancel : undefined}
    />,
  )
  return { onAssign, onReassign, onReorder, onMove, onCancel }
}

const routeItem = (name: string) => within(screen.getByRole('listitem', { name }))

const FIRST = 'Ruta guardada 1 · FIC-02'

describe('SavedRoutes', () => {
  it('muestra solo las rutas del día elegido (en horario de Guayaquil)', () => {
    renderSaved([
      savedRouteDetail('a', { zoneCode: 'FIC-02' }),
      // 02:00 UTC del 15 sigue siendo el 14 en Guayaquil.
      savedRouteDetail('b', { zoneCode: 'HUA-03', date: '2030-02-15T02:00:00Z' }),
      savedRouteDetail('c', { zoneCode: 'CEN-01', date: '2030-02-15T15:00:00Z' }),
    ])

    expect(screen.getByRole('listitem', { name: FIRST })).toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: 'Ruta guardada 2 · HUA-03' })).toBeInTheDocument()
    expect(screen.queryByRole('listitem', { name: /CEN-01/ })).not.toBeInTheDocument()
  })

  it('numera las rutas para distinguir las de la misma zona, también en el selector de chofer', () => {
    renderSaved([savedRouteDetail('a'), savedRouteDetail('b')])

    expect(screen.getByText(/^Ruta guardada 1 · FIC-02 ·/)).toBeInTheDocument()
    expect(screen.getByText(/^Ruta guardada 2 · FIC-02 ·/)).toBeInTheDocument()
    expect(screen.getByLabelText('Chofer para Ruta guardada 1 · FIC-02')).toBeInTheDocument()
    expect(screen.getByLabelText('Chofer para Ruta guardada 2 · FIC-02')).toBeInTheDocument()
  })

  it('indica cuando aún no hay rutas guardadas para el día', () => {
    renderSaved([savedRouteDetail('x', { date: '2030-03-01T15:00:00Z' })])

    expect(screen.getByText('Aún no hay rutas guardadas para este día.')).toBeInTheDocument()
  })

  it('muestra las paradas de la ruta en orden', () => {
    renderSaved([savedRouteDetail('a')])

    expect(
      within(routeItem(FIRST).getByRole('list'))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Parada 1 de a', 'Parada 2 de a'])
  })

  it('una ruta DRAFT se muestra como borrador y solo deja elegir choferes disponibles', () => {
    renderSaved([savedRouteDetail('a')])

    expect(routeItem(FIRST).getByText('Borrador (DRAFT)')).toBeInTheDocument()
    expect(
      routeItem(FIRST).getByText('Guardada, sin chofer. Aún se puede asignar y corregir.'),
    ).toBeInTheDocument()
    const options = routeItem(FIRST).getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      'Selecciona un chofer disponible',
      'Carlos Chofer · Camión Isuzu ABC-123',
      'Luis Transportista · ocupado hasta que regrese al depósito',
    ])
    expect(options[1]).toBeEnabled()
    expect(options[2]).toBeDisabled()
  })

  it('no deja asignar hasta elegir un chofer y luego envía la ruta y el chofer elegidos', async () => {
    const { onAssign } = renderSaved([savedRouteDetail('a')])
    const button = routeItem(FIRST).getByRole('button', { name: 'Asignar chofer' })
    expect(button).toBeDisabled()

    await userEvent.selectOptions(
      routeItem(FIRST).getByLabelText('Chofer para Ruta guardada 1 · FIC-02'),
      'driver-1',
    )
    await userEvent.click(button)

    expect(onAssign).toHaveBeenCalledWith('a', 'driver-1')
  })

  it('avisa si no hay choferes disponibles', () => {
    renderSaved([savedRouteDetail('a')], { drivers: [busyDriver] })

    expect(
      routeItem(FIRST).getByText('No hay choferes disponibles en este momento.'),
    ).toBeInTheDocument()
    expect(
      routeItem(FIRST).queryByRole('button', { name: 'Asignar chofer' }),
    ).not.toBeInTheDocument()
  })

  it('bloquea el botón mientras asigna y muestra el error si falla', () => {
    renderSaved([savedRouteDetail('a'), savedRouteDetail('b', { zoneCode: 'HUA-03' })], {
      actions: {
        a: { status: 'saving' },
        b: { status: 'failed', error: 'Conflicto: chofer ocupado' },
      },
    })

    expect(routeItem(FIRST).getByRole('button', { name: 'Asignando...' })).toBeDisabled()
    expect(routeItem('Ruta guardada 2 · HUA-03').getByRole('alert')).toHaveTextContent(
      'Conflicto: chofer ocupado',
    )
  })

  it('una ruta ASSIGNED muestra su chofer, se diferencia de DRAFT y ofrece corregir paradas o cambiar el chofer', () => {
    renderSaved([
      savedRouteDetail('a', {
        status: 'ASSIGNED',
        driverId: 'driver-3',
        driverName: 'Carlos Chofer',
      }),
    ])

    expect(routeItem(FIRST).getByText('Asignada (ASSIGNED)')).toHaveClass('badge--success')
    expect(
      routeItem(FIRST).getByText(
        'Con chofer, todavía sin iniciar. Sus paradas aún se pueden corregir.',
      ),
    ).toBeInTheDocument()
    expect(routeItem(FIRST).getByText('Chofer: Carlos Chofer')).toBeInTheDocument()
    expect(
      routeItem(FIRST)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Corregir paradas', 'Cambiar chofer'])
  })

  it('cambiar el chofer de una ruta ASSIGNED pide el motivo y no ofrece al chofer actual', async () => {
    const other = { ...availableDriver, id: 'driver-3', name: 'Ana Actual' }
    const { onReassign } = renderSaved(
      [
        savedRouteDetail('a', {
          status: 'ASSIGNED',
          driverId: 'driver-3',
          driverName: 'Ana Actual',
        }),
      ],
      { drivers: [availableDriver, other, busyDriver] },
    )
    const select = routeItem(FIRST).getByLabelText(`Nuevo chofer para ${FIRST}`)
    expect(within(select).queryByText(/Ana Actual/)).not.toBeInTheDocument()

    await userEvent.selectOptions(select, 'driver-1')
    await userEvent.click(routeItem(FIRST).getByRole('button', { name: 'Cambiar chofer' }))
    expect(routeItem(FIRST).getByText('Escribe el motivo')).toBeInTheDocument()
    expect(onReassign).not.toHaveBeenCalled()

    await userEvent.type(
      routeItem(FIRST).getByLabelText(`Motivo del cambio de chofer de ${FIRST}`),
      ' El chofer se enfermó ',
    )
    await userEvent.click(routeItem(FIRST).getByRole('button', { name: 'Cambiar chofer' }))

    expect(onReassign).toHaveBeenCalledWith('a', 'driver-1', 'El chofer se enfermó')
  })

  it('un chofer marcado como no disponible se muestra deshabilitado con su motivo', () => {
    renderSaved([savedRouteDetail('a')], {
      drivers: [availableDriver, { ...busyDriver, unavailableReason: 'MARKED_UNAVAILABLE' }],
    })

    expect(
      routeItem(FIRST).getByRole('option', {
        name: 'Luis Transportista · marcado como no disponible',
      }),
    ).toBeDisabled()
  })

  it.each([
    [
      'IN_PROGRESS',
      'En curso (IN_PROGRESS)',
      'En ejecución: sus paradas y su composición no se pueden modificar.',
    ],
    ['COMPLETED', 'Completada (COMPLETED)', 'Terminada: no se puede modificar.'],
  ] as const)('una ruta %s no permite ninguna modificación', (status, label, help) => {
    renderSaved([savedRouteDetail('a', { status, driverName: 'Carlos Chofer' })])

    expect(routeItem(FIRST).getByText(label)).toBeInTheDocument()
    expect(routeItem(FIRST).getByText(help)).toBeInTheDocument()
    expect(routeItem(FIRST).queryByRole('button')).not.toBeInTheDocument()
    expect(routeItem(FIRST).queryByRole('combobox')).not.toBeInTheDocument()
  })
})

describe('SavedRoutes · corregir paradas', () => {
  const twoRoutes = () => [
    savedRouteDetail('a'),
    savedRouteDetail('b', {
      orders: [{ id: 'b-o1', deliveryAddress: 'Parada 1 de b', stopOrder: 1 }],
    }),
  ]

  const openCorrection = async (name = FIRST) => {
    await userEvent.click(routeItem(name).getByRole('button', { name: 'Corregir paradas' }))
    return within(screen.getByRole('group', { name: `Corregir ${name}` }))
  }

  it('reordena con las flechas y envía las mismas paradas en el nuevo orden con el motivo', async () => {
    const { onReorder } = renderSaved([savedRouteDetail('a')])
    const panel = await openCorrection()
    const save = panel.getByRole('button', { name: 'Guardar nuevo orden' })
    expect(save).toBeDisabled()
    expect(panel.getByRole('button', { name: 'Subir Parada 1 de a' })).toBeDisabled()

    await userEvent.click(panel.getByRole('button', { name: 'Bajar Parada 1 de a' }))
    await userEvent.type(
      panel.getByLabelText(`Motivo de la corrección de ${FIRST}`),
      '  Calle cerrada  ',
    )
    await userEvent.click(save)

    expect(onReorder).toHaveBeenCalledWith('a', ['a-o2', 'a-o1'], 'Calle cerrada')
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })

  it('subir una parada la adelanta una posición', async () => {
    const { onReorder } = renderSaved([savedRouteDetail('a')])
    const panel = await openCorrection()

    await userEvent.click(panel.getByRole('button', { name: 'Subir Parada 2 de a' }))
    await userEvent.type(panel.getByLabelText(`Motivo de la corrección de ${FIRST}`), 'x')
    await userEvent.click(panel.getByRole('button', { name: 'Guardar nuevo orden' }))

    expect(onReorder).toHaveBeenCalledWith('a', ['a-o2', 'a-o1'], 'x')
  })

  it('exige el motivo antes de enviar', async () => {
    const { onReorder } = renderSaved([savedRouteDetail('a')])
    const panel = await openCorrection()

    await userEvent.click(panel.getByRole('button', { name: 'Bajar Parada 1 de a' }))
    await userEvent.click(panel.getByRole('button', { name: 'Guardar nuevo orden' }))

    expect(panel.getByText('Escribe el motivo de la corrección')).toBeInTheDocument()
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('si la corrección no se aplica, sigue abierta y muestra el error', async () => {
    renderSaved([savedRouteDetail('a')], {
      applied: false,
      actions: { a: { status: 'failed', error: 'Conflicto: Route structure is frozen.' } },
    })
    const panel = await openCorrection()

    await userEvent.click(panel.getByRole('button', { name: 'Bajar Parada 1 de a' }))
    await userEvent.type(panel.getByLabelText(`Motivo de la corrección de ${FIRST}`), 'x')
    await userEvent.click(panel.getByRole('button', { name: 'Guardar nuevo orden' }))

    expect(screen.getByRole('group', { name: `Corregir ${FIRST}` })).toBeInTheDocument()
    expect(panel.getByRole('alert')).toHaveTextContent('Route structure is frozen')
  })

  it('cancelar descarta los cambios y vuelve a la lista', async () => {
    const { onReorder } = renderSaved([savedRouteDetail('a')])
    const panel = await openCorrection()

    await userEvent.click(panel.getByRole('button', { name: 'Bajar Parada 1 de a' }))
    await userEvent.click(panel.getByRole('button', { name: 'Cancelar' }))

    expect(
      within(routeItem(FIRST).getByRole('list'))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Parada 1 de a', 'Parada 2 de a'])
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('mueve un pedido a otra ruta del mismo día y zona', async () => {
    const { onMove } = renderSaved(twoRoutes())
    const panel = await openCorrection()

    await userEvent.selectOptions(panel.getByLabelText(`Pedido a mover de ${FIRST}`), 'a-o2')
    await userEvent.selectOptions(
      panel.getByLabelText(`Ruta destino para ${FIRST}`),
      'Ruta guardada 2 · FIC-02',
    )
    await userEvent.type(panel.getByLabelText(`Motivo de la corrección de ${FIRST}`), 'Equilibrar')
    await userEvent.click(panel.getByRole('button', { name: 'Mover pedido' }))

    expect(onMove).toHaveBeenCalledWith('a', 'a-o2', 'b', 'Equilibrar')
  })

  it('solo ofrece como destino rutas de la misma zona, sin iniciar y con lugar', async () => {
    const fourStops = Array.from({ length: 4 }, (_, k) => ({
      id: `full-o${k}`,
      deliveryAddress: `Parada ${k} de full`,
      stopOrder: k + 1,
    }))
    renderSaved([
      savedRouteDetail('a'),
      savedRouteDetail('ok'),
      savedRouteDetail('other-zone', { zoneId: 'zone-2', zoneCode: 'HUA-03' }),
      savedRouteDetail('started', { status: 'IN_PROGRESS' }),
      savedRouteDetail('full', { orders: fourStops }),
    ])
    const panel = await openCorrection()

    expect(
      within(panel.getByLabelText(`Ruta destino para ${FIRST}`))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Selecciona la ruta destino', 'Ruta guardada 2 · FIC-02'])
  })

  it('una ruta de una sola parada no puede mover su pedido (quedaría vacía)', async () => {
    renderSaved(twoRoutes())
    const panel = await openCorrection('Ruta guardada 2 · FIC-02')

    expect(panel.queryByRole('button', { name: 'Mover pedido' })).not.toBeInTheDocument()
    expect(
      panel.getByText(
        'Una ruta con una sola parada no puede quedar vacía: no se puede mover su pedido.',
      ),
    ).toBeInTheDocument()
  })

  it('sin rutas destino lo explica en lugar de ofrecer mover', async () => {
    renderSaved([savedRouteDetail('a')])
    const panel = await openCorrection()

    expect(
      panel.getByText(
        'No hay otra ruta del mismo día y zona, sin iniciar y con lugar, que pueda recibir un pedido.',
      ),
    ).toBeInTheDocument()
  })

  it('mientras guarda bloquea las flechas y el botón', async () => {
    renderSaved([savedRouteDetail('a')], { actions: { a: { status: 'saving' } } })
    const panel = await openCorrection()

    expect(panel.getByRole('button', { name: 'Guardando...' })).toBeDisabled()
    expect(panel.getByRole('button', { name: 'Bajar Parada 1 de a' })).toBeDisabled()
  })
})

describe('SavedRoutes · cancelar ruta asignada', () => {
  const assignedRoute = (overrides: Partial<SavedRouteDetail> = {}) =>
    savedRouteDetail('a', {
      status: 'ASSIGNED',
      driverId: 'driver-1',
      driverName: 'Carlos Chofer',
      startedAt: null,
      ...overrides,
    })

  it('ofrece Cancelar ruta solo para ASSIGNED sin iniciar, exige motivo y explica sus efectos sin actuar sola', async () => {
    const user = userEvent.setup()
    const { onCancel } = renderSaved([assignedRoute()], { withCancel: true })
    const item = routeItem(FIRST)

    await user.click(item.getByRole('button', { name: 'Cancelar ruta' }))
    expect(onCancel).not.toHaveBeenCalled()

    const dialog = within(item.getByRole('group', { name: `Cancelar ${FIRST}` }))
    expect(dialog.getByText(/no se cancelan/i)).toBeInTheDocument()
    expect(dialog.getByText(/Planificación/i)).toBeInTheDocument()
    expect(dialog.getByText(/chofer quedará libre/i)).toBeInTheDocument()

    await user.type(dialog.getByLabelText(`Motivo para cancelar ${FIRST}`), '   ')
    await user.click(dialog.getByRole('button', { name: 'Confirmar cancelación' }))
    expect(dialog.getByText('Escribe el motivo')).toBeInTheDocument()
    expect(onCancel).not.toHaveBeenCalled()

    await user.clear(dialog.getByLabelText(`Motivo para cancelar ${FIRST}`))
    await user.type(
      dialog.getByLabelText(`Motivo para cancelar ${FIRST}`),
      '  Vehículo averiado antes de salir  ',
    )
    await user.click(dialog.getByRole('button', { name: 'Confirmar cancelación' }))

    expect(onCancel).toHaveBeenCalledWith('a', 'Vehículo averiado antes de salir')
    expect(item.queryByRole('group', { name: `Cancelar ${FIRST}` })).not.toBeInTheDocument()
  })

  it('si cancelar falla mantiene abierta la confirmación, el motivo escrito y el error', async () => {
    const user = userEvent.setup()
    renderSaved([assignedRoute()], {
      withCancel: true,
      applied: false,
      actions: { a: { status: 'failed', error: 'La ruta ya se inició y no se puede cancelar.' } },
    })
    const item = routeItem(FIRST)

    await user.click(item.getByRole('button', { name: 'Cancelar ruta' }))
    const dialog = within(item.getByRole('group', { name: `Cancelar ${FIRST}` }))
    const input = dialog.getByLabelText(`Motivo para cancelar ${FIRST}`)
    await user.type(input, 'Cambio operativo')
    await user.click(dialog.getByRole('button', { name: 'Confirmar cancelación' }))

    expect(item.getByRole('group', { name: `Cancelar ${FIRST}` })).toBeInTheDocument()
    expect(input).toHaveValue('Cambio operativo')
    expect(dialog.getByRole('alert')).toHaveTextContent('La ruta ya se inició y no se puede cancelar.')
  })

  it('Volver cierra sin cancelar y mientras guarda bloquea los controles', async () => {
    const user = userEvent.setup()
    const { onCancel } = renderSaved([assignedRoute()], { withCancel: true })
    const item = routeItem(FIRST)

    await user.click(item.getByRole('button', { name: 'Cancelar ruta' }))
    await user.click(item.getByRole('button', { name: 'Volver' }))
    expect(onCancel).not.toHaveBeenCalled()
    expect(item.queryByRole('group', { name: `Cancelar ${FIRST}` })).not.toBeInTheDocument()
  })

  it('mientras cancela deshabilita el motivo y los botones', async () => {
    const user = userEvent.setup()
    renderSaved([assignedRoute()], { withCancel: true, actions: { a: { status: 'saving' } } })
    const item = routeItem(FIRST)

    await user.click(item.getByRole('button', { name: 'Cancelar ruta' }))
    const dialog = within(item.getByRole('group', { name: `Cancelar ${FIRST}` }))
    expect(dialog.getByRole('button', { name: 'Cancelando...' })).toBeDisabled()
    expect(dialog.getByRole('button', { name: 'Volver' })).toBeDisabled()
    expect(dialog.getByLabelText(`Motivo para cancelar ${FIRST}`)).toBeDisabled()
  })

  it('exige startedAt: null explícito para cancelar; ausente, vacío o iniciado son inelegibles sin romper edición ni reasignación en registros previos', () => {
    renderSaved(
      [
        assignedRoute({ id: 'eligible-null', driverId: 'driver-3', startedAt: null }),
        assignedRoute({ id: 'missing-started-at', driverId: 'driver-3', startedAt: undefined }),
        assignedRoute({ id: 'empty-started-at', driverId: 'driver-3', startedAt: '' }),
        assignedRoute({
          id: 'started-assigned',
          driverId: 'driver-3',
          startedAt: '2030-02-14T15:10:00Z',
        }),
        savedRouteDetail('draft', { status: 'DRAFT' }),
        savedRouteDetail('in-progress', { status: 'IN_PROGRESS', driverName: 'Carlos Chofer' }),
        savedRouteDetail('interrupted', { status: 'INTERRUPTED', driverName: 'Carlos Chofer' }),
        savedRouteDetail('completed', { status: 'COMPLETED', driverName: 'Carlos Chofer' }),
        savedRouteDetail('cancelled', { status: 'CANCELLED', driverName: 'Carlos Chofer' }),
      ],
      { withCancel: true },
    )

    const eligible = routeItem('Ruta guardada 1 · FIC-02')
    expect(eligible.getByRole('button', { name: 'Cancelar ruta' })).toBeInTheDocument()

    const legacyAbsent = routeItem('Ruta guardada 2 · FIC-02')
    expect(legacyAbsent.queryByRole('button', { name: 'Cancelar ruta' })).not.toBeInTheDocument()
    expect(legacyAbsent.getByRole('button', { name: 'Corregir paradas' })).toBeInTheDocument()
    expect(legacyAbsent.getByRole('button', { name: 'Cambiar chofer' })).toBeInTheDocument()

    const emptyStarted = routeItem('Ruta guardada 3 · FIC-02')
    expect(emptyStarted.queryByRole('button', { name: 'Cancelar ruta' })).not.toBeInTheDocument()

    const startedAssigned = routeItem('Ruta guardada 4 · FIC-02')
    expect(startedAssigned.queryByRole('button', { name: 'Cancelar ruta' })).not.toBeInTheDocument()
    expect(
      startedAssigned.queryByRole('button', { name: 'Corregir paradas' }),
    ).not.toBeInTheDocument()
    expect(startedAssigned.queryByRole('combobox')).not.toBeInTheDocument()

    for (let index = 5; index <= 9; index++) {
      const item = routeItem(`Ruta guardada ${index} · FIC-02`)
      expect(item.queryByRole('button', { name: 'Cancelar ruta' })).not.toBeInTheDocument()
    }
  })

  it('si una ruta se vuelve inelegible tras fallar la cancelación quita los controles y muestra el error en su tarjeta', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn().mockResolvedValue(false)
    const { rerender } = render(
      <SavedRoutes
        day="2030-02-14"
        routes={[assignedRoute()]}
        drivers={[availableDriver, busyDriver]}
        actions={{}}
        onAssign={vi.fn()}
        onReassign={vi.fn()}
        onReorder={vi.fn().mockResolvedValue(true)}
        onMove={vi.fn().mockResolvedValue(true)}
        onCancel={onCancel}
      />,
    )

    const item = routeItem(FIRST)
    await user.click(item.getByRole('button', { name: 'Cancelar ruta' }))
    const dialog = within(item.getByRole('group', { name: `Cancelar ${FIRST}` }))
    await user.type(dialog.getByLabelText(`Motivo para cancelar ${FIRST}`), 'Cambio operativo')
    await user.click(dialog.getByRole('button', { name: 'Confirmar cancelación' }))

    rerender(
      <SavedRoutes
        day="2030-02-14"
        routes={[
          assignedRoute({
            status: 'IN_PROGRESS',
            startedAt: '2030-02-14T15:10:00Z',
          }),
        ]}
        drivers={[availableDriver, busyDriver]}
        actions={{
          a: {
            status: 'failed',
            error: 'La ruta ya se inició y no se puede cancelar: revisa la lista actualizada.',
          },
        }}
        onAssign={vi.fn()}
        onReassign={vi.fn()}
        onReorder={vi.fn().mockResolvedValue(true)}
        onMove={vi.fn().mockResolvedValue(true)}
        onCancel={onCancel}
      />,
    )

    const updated = routeItem(FIRST)
    expect(updated.getByText('En curso (IN_PROGRESS)')).toBeInTheDocument()
    expect(updated.queryByRole('group', { name: `Cancelar ${FIRST}` })).not.toBeInTheDocument()
    expect(updated.queryByRole('button', { name: 'Cancelar ruta' })).not.toBeInTheDocument()
    expect(updated.queryByRole('button', { name: 'Confirmar cancelación' })).not.toBeInTheDocument()
    expect(updated.getByRole('alert')).toHaveTextContent(
      'La ruta ya se inició y no se puede cancelar: revisa la lista actualizada.',
    )
  })

  it('si una ruta desaparece tras un 404 muestra el motivo del fallo en la superficie', () => {
    renderSaved([], {
      withCancel: true,
      actions: {
        a: {
          status: 'failed',
          error: 'No se encontró la ruta: revisa la lista actualizada.',
        },
      },
    })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'No se encontró la ruta: revisa la lista actualizada.',
    )
    expect(screen.queryByRole('button', { name: 'Cancelar ruta' })).not.toBeInTheDocument()
  })

  it('una ruta CANCELLED queda visible en el historial sin acciones, fuera de destinos y muestra evidencia solo si llega de la API', async () => {
    const user = userEvent.setup()
    renderSaved(
      [
        savedRouteDetail('draft-1', { status: 'DRAFT' }),
        savedRouteDetail('cancelled-plain', {
          status: 'CANCELLED',
          driverName: 'Carlos Chofer',
        }),
        savedRouteDetail('cancelled-evidence', {
          status: 'CANCELLED',
          driverName: 'Carlos Chofer',
          cancelledAt: '2030-02-14T14:30:00Z',
          cancellationReason: 'Camión sin batería',
          cancelledById: 'admin-1',
        }),
      ],
      { withCancel: true },
    )

    const plain = routeItem('Ruta guardada 2 · FIC-02')
    expect(plain.getByText('Cancelada (CANCELLED)')).toBeInTheDocument()
    expect(plain.getByText(/Cancelada antes de iniciar/)).toBeInTheDocument()
    expect(plain.queryByRole('button')).not.toBeInTheDocument()
    expect(plain.queryByRole('combobox')).not.toBeInTheDocument()
    expect(plain.queryByText(/Motivo de cancelación/i)).not.toBeInTheDocument()

    const withEvidence = routeItem('Ruta guardada 3 · FIC-02')
    expect(withEvidence.getByText(/Cancelada el/)).toBeInTheDocument()
    expect(withEvidence.getByText(/Cancelada por: admin-1/)).toBeInTheDocument()
    expect(withEvidence.getByText(/Motivo de cancelación: Camión sin batería/)).toBeInTheDocument()

    // Una ruta CANCELLED no se ofrece como destino para mover pedidos.
    await user.click(routeItem(FIRST).getByRole('button', { name: 'Corregir paradas' }))
    const correction = within(screen.getByRole('group', { name: `Corregir ${FIRST}` }))
    expect(
      correction.getByText(
        'No hay otra ruta del mismo día y zona, sin iniciar y con lugar, que pueda recibir un pedido.',
      ),
    ).toBeInTheDocument()
  })
})
