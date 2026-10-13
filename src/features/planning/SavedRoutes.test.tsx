import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { availableDriver, busyDriver, savedRouteDetail } from '../../test/planningFixtures'
import { SavedRoutes } from './SavedRoutes'
import type { Driver, SavedRouteDetail } from './types'
import type { AssignmentState } from './useDriverAssignment'

const renderSaved = (
  routes: SavedRouteDetail[],
  {
    drivers = [availableDriver, busyDriver],
    assignments = {},
  }: { drivers?: Driver[]; assignments?: Record<string, AssignmentState> } = {},
) => {
  const onAssign = vi.fn()
  render(
    <SavedRoutes
      day="2030-02-14"
      routes={routes}
      drivers={drivers}
      assignments={assignments}
      onAssign={onAssign}
    />,
  )
  return { onAssign }
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
      routeItem(FIRST).getByText('Guardada, sin chofer. Aún se puede asignar.'),
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
      assignments: {
        a: { status: 'saving' },
        b: { status: 'failed', error: 'Conflicto: chofer ocupado' },
      },
    })

    expect(routeItem(FIRST).getByRole('button', { name: 'Asignando...' })).toBeDisabled()
    expect(routeItem('Ruta guardada 2 · HUA-03').getByRole('alert')).toHaveTextContent(
      'Conflicto: chofer ocupado',
    )
  })

  it('una ruta ASSIGNED muestra su chofer, se diferencia de DRAFT y no ofrece acciones', () => {
    renderSaved([savedRouteDetail('a', { status: 'ASSIGNED', driverName: 'Carlos Chofer' })])

    expect(routeItem(FIRST).getByText('Asignada (ASSIGNED)')).toHaveClass('badge--success')
    expect(routeItem(FIRST).getByText('Con chofer, todavía sin iniciar.')).toBeInTheDocument()
    expect(routeItem(FIRST).getByText('Chofer: Carlos Chofer')).toBeInTheDocument()
    expect(routeItem(FIRST).queryByRole('button')).not.toBeInTheDocument()
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
