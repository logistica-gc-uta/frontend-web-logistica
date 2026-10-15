import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { availableDriver, busyDriver, savedRouteDetail } from '../../test/planningFixtures'
import { SavedRoutes } from './SavedRoutes'
import type { Driver, SavedRouteDetail } from './types'
import type { RouteActionState } from './useRouteActions'

const renderSaved = (
  routes: SavedRouteDetail[],
  {
    drivers = [availableDriver, busyDriver],
    actions = {},
    applied = true,
  }: { drivers?: Driver[]; actions?: Record<string, RouteActionState>; applied?: boolean } = {},
) => {
  const onAssign = vi.fn()
  const onReorder = vi.fn().mockResolvedValue(applied)
  const onMove = vi.fn().mockResolvedValue(applied)
  render(
    <SavedRoutes
      day="2030-02-14"
      routes={routes}
      drivers={drivers}
      actions={actions}
      onAssign={onAssign}
      onReorder={onReorder}
      onMove={onMove}
    />,
  )
  return { onAssign, onReorder, onMove }
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

  it('una ruta DRAFT se muestra como borrador y solo ofrece los choferes disponibles', () => {
    renderSaved([savedRouteDetail('a')])

    expect(routeItem(FIRST).getByText('Borrador (DRAFT)')).toBeInTheDocument()
    expect(
      routeItem(FIRST).getByText('Guardada, sin chofer. Aún se puede asignar y corregir.'),
    ).toBeInTheDocument()
    expect(
      routeItem(FIRST)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Selecciona un chofer disponible', 'Carlos Chofer · Camión Isuzu ABC-123'])
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

  it('una ruta ASSIGNED muestra su chofer, se diferencia de DRAFT y solo ofrece corregir paradas', () => {
    renderSaved([savedRouteDetail('a', { status: 'ASSIGNED', driverName: 'Carlos Chofer' })])

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
    ).toEqual(['Corregir paradas'])
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
