import { act, render, renderHook, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { KeyedActionState } from '../../hooks/useKeyedActions'
import { createHttpError } from '../../test/http'
import { availableDriver, savedRouteDetail } from '../../test/planningFixtures'
import { dispatchService } from '../dispatch/dispatchService'
import { describeReleaseError, isStaleReleaseError } from './confirmError'
import { SavedRoutes } from './SavedRoutes'
import type { SavedRouteDetail } from './types'
import { useSavedRouteActions } from './useSavedRouteActions'

const DRAFT = 'Ruta guardada 1 · FIC-02'

/** Borrador de hoy sin chofer, una ruta asignada sin iniciar y una ya iniciada. */
const routesOfToday = (): SavedRouteDetail[] => [
  savedRouteDetail('r1'),
  savedRouteDetail('r2', { status: 'ASSIGNED', driverId: 'driver-9', startedAt: null }),
  savedRouteDetail('r3', {
    status: 'IN_PROGRESS',
    driverId: 'driver-8',
    startedAt: '2030-02-14T13:00:00Z',
  }),
]

const renderRoutes = ({
  routes = routesOfToday(),
  isToday = true,
  actions = {},
  released = true,
}: {
  routes?: SavedRouteDetail[]
  isToday?: boolean
  actions?: Record<string, KeyedActionState>
  released?: boolean
} = {}) => {
  const onRelease = vi.fn().mockResolvedValue(released)
  const onAssign = vi.fn()
  const view = render(
    <SavedRoutes
      day="2030-02-14"
      routes={routes}
      drivers={[availableDriver]}
      actions={actions}
      onAssign={onAssign}
      onReassign={vi.fn()}
      onReorder={vi.fn()}
      onMove={vi.fn()}
      isToday={isToday}
      onRelease={onRelease}
      onCancel={vi.fn().mockResolvedValue(true)}
    />,
  )
  return { ...view, onRelease, onAssign }
}

const item = (name: string) => within(screen.getByRole('listitem', { name }))

describe('Liberar borrador de hoy sin chofer (#70)', () => {
  it('se ofrece en el borrador de hoy junto a Asignar chofer, y no en rutas asignadas ni iniciadas', () => {
    renderRoutes()

    expect(item(DRAFT).getByRole('button', { name: 'Liberar borrador' })).toBeInTheDocument()
    expect(item(DRAFT).getByRole('button', { name: 'Asignar chofer' })).toBeInTheDocument()
    expect(item(DRAFT).queryByRole('button', { name: 'Cancelar ruta' })).not.toBeInTheDocument()

    const assigned = item('Ruta guardada 2 · FIC-02')
    expect(assigned.queryByRole('button', { name: 'Liberar borrador' })).not.toBeInTheDocument()
    expect(assigned.getByRole('button', { name: 'Cancelar ruta' })).toBeInTheDocument()

    const started = item('Ruta guardada 3 · FIC-02')
    expect(started.queryByRole('button', { name: 'Liberar borrador' })).not.toBeInTheDocument()
    expect(started.queryByRole('button', { name: 'Cancelar ruta' })).not.toBeInTheDocument()
  })

  it('sigue disponible para los borradores de otras fechas', () => {
    renderRoutes({ routes: [savedRouteDetail('r1')], isToday: false })

    expect(item(DRAFT).getByRole('button', { name: 'Liberar borrador' })).toBeInTheDocument()
    expect(item(DRAFT).queryByRole('button', { name: 'Asignar chofer' })).not.toBeInTheDocument()
  })

  it('un borrador iniciado o con chofer no ofrece liberarlo', () => {
    renderRoutes({
      routes: [
        savedRouteDetail('r1', { startedAt: '2030-02-14T13:00:00Z' }),
        savedRouteDetail('r2', { driverId: 'driver-1' }),
      ],
    })

    expect(item(DRAFT).queryByRole('button', { name: 'Liberar borrador' })).not.toBeInTheDocument()
    expect(
      item('Ruta guardada 2 · FIC-02').queryByRole('button', { name: 'Liberar borrador' }),
    ).not.toBeInTheDocument()
  })

  it('cerrar la confirmación con Volver no envía nada y vuelve a mostrar Asignar chofer', async () => {
    const user = userEvent.setup()
    const { onRelease, onAssign } = renderRoutes()

    await user.click(item(DRAFT).getByRole('button', { name: 'Liberar borrador' }))
    // Mientras se confirma la liberación no se ofrece asignar la misma ruta.
    expect(item(DRAFT).queryByRole('button', { name: 'Asignar chofer' })).not.toBeInTheDocument()
    expect(item(DRAFT).getByText(/No se cancela ningún pedido/)).toBeInTheDocument()

    await user.type(item(DRAFT).getByLabelText(`Motivo para liberar ${DRAFT}`), 'Cambio de hora')
    await user.click(item(DRAFT).getByRole('button', { name: 'Volver' }))

    expect(onRelease).not.toHaveBeenCalled()
    expect(onAssign).not.toHaveBeenCalled()
    expect(item(DRAFT).getByRole('button', { name: 'Asignar chofer' })).toBeInTheDocument()
  })

  it('exige un motivo válido y confirma con un solo envío', async () => {
    const user = userEvent.setup()
    const { onRelease } = renderRoutes()
    await user.click(item(DRAFT).getByRole('button', { name: 'Liberar borrador' }))

    await user.type(item(DRAFT).getByLabelText(`Motivo para liberar ${DRAFT}`), '   ')
    await user.click(item(DRAFT).getByRole('button', { name: 'Confirmar liberación' }))
    expect(item(DRAFT).getByText('Escribe el motivo')).toBeInTheDocument()
    expect(onRelease).not.toHaveBeenCalled()

    await user.clear(item(DRAFT).getByLabelText(`Motivo para liberar ${DRAFT}`))
    await user.type(
      item(DRAFT).getByLabelText(`Motivo para liberar ${DRAFT}`),
      '  El cliente cambió la hora  ',
    )
    await user.click(item(DRAFT).getByRole('button', { name: 'Confirmar liberación' }))

    expect(onRelease).toHaveBeenCalledTimes(1)
    expect(onRelease).toHaveBeenCalledWith('r1', 'El cliente cambió la hora')
    expect(
      item(DRAFT).queryByRole('button', { name: 'Confirmar liberación' }),
    ).not.toBeInTheDocument()
  })

  it('mientras libera deshabilita el motivo y los botones', async () => {
    const user = userEvent.setup()
    const { rerender } = renderRoutes()
    await user.click(item(DRAFT).getByRole('button', { name: 'Liberar borrador' }))

    rerender(
      <SavedRoutes
        day="2030-02-14"
        routes={routesOfToday()}
        drivers={[availableDriver]}
        actions={{ r1: { status: 'saving' } }}
        onAssign={vi.fn()}
        onReassign={vi.fn()}
        onReorder={vi.fn()}
        onMove={vi.fn()}
        isToday
        onRelease={vi.fn()}
      />,
    )

    expect(item(DRAFT).getByLabelText(`Motivo para liberar ${DRAFT}`)).toBeDisabled()
    expect(item(DRAFT).getByRole('button', { name: /Liberando/ })).toBeDisabled()
    expect(item(DRAFT).getByRole('button', { name: 'Volver' })).toBeDisabled()
  })

  it('si la API rechaza la liberación mantiene la confirmación abierta y muestra el motivo', async () => {
    const user = userEvent.setup()
    const { rerender, onRelease } = renderRoutes({ released: false })
    await user.click(item(DRAFT).getByRole('button', { name: 'Liberar borrador' }))
    await user.type(item(DRAFT).getByLabelText(`Motivo para liberar ${DRAFT}`), 'Cambio de hora')
    await user.click(item(DRAFT).getByRole('button', { name: 'Confirmar liberación' }))
    expect(onRelease).toHaveBeenCalledTimes(1)

    rerender(
      <SavedRoutes
        day="2030-02-14"
        routes={routesOfToday()}
        drivers={[availableDriver]}
        actions={{ r1: { status: 'failed', error: 'Este borrador ya estaba liberado' } }}
        onAssign={vi.fn()}
        onReassign={vi.fn()}
        onReorder={vi.fn()}
        onMove={vi.fn()}
        isToday
        onRelease={onRelease}
      />,
    )

    expect(item(DRAFT).getByRole('alert')).toHaveTextContent('Este borrador ya estaba liberado')
    expect(item(DRAFT).getByRole('button', { name: 'Confirmar liberación' })).toBeInTheDocument()
    expect(item(DRAFT).getByLabelText(`Motivo para liberar ${DRAFT}`)).toHaveValue('Cambio de hora')
  })
})

describe('Liberar borrador · errores y acciones (#70)', () => {
  const conflict = (code: string) =>
    createHttpError(409, { data: { statusCode: 409, code, message: 'x', error: 'Conflict' } })

  it('explica en español los rechazos del backend sin simular éxito', () => {
    expect(describeReleaseError(conflict('DRAFT_NOT_RELEASABLE'))).toMatch(
      /ya no se puede liberar: se le asignó un chofer/,
    )
    expect(describeReleaseError(conflict('DRAFT_ALREADY_RELEASED'))).toMatch(/ya estaba liberado/)
    expect(describeReleaseError(createHttpError(404))).toBe(
      'No se encontró el borrador: revisa la lista actualizada.',
    )
    expect(describeReleaseError(createHttpError(403))).toBe(
      'No tienes permisos para liberar rutas.',
    )
    expect(isStaleReleaseError(conflict('DRAFT_NOT_RELEASABLE'))).toBe(true)
    expect(isStaleReleaseError(createHttpError(500))).toBe(false)
  })

  it('envía RELEASE_DRAFT una sola vez aunque se confirme dos veces y actualiza la lista al terminar', async () => {
    let finish!: () => void
    const releaseDraft = vi.spyOn(dispatchService, 'releaseDraft').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ id: 'a1' } as never)
        }),
    )
    const onDone = vi.fn()
    const { result } = renderHook(() => useSavedRouteActions(onDone))

    let first!: Promise<boolean>
    let second!: Promise<boolean>
    act(() => {
      first = result.current.release('r1', 'Cambio de hora')
      second = result.current.release('r1', 'Cambio de hora')
    })
    await act(async () => {
      finish()
      await first
    })

    expect(releaseDraft).toHaveBeenCalledTimes(1)
    expect(releaseDraft).toHaveBeenCalledWith('r1', 'Cambio de hora')
    await expect(first).resolves.toBe(true)
    await expect(second).resolves.toBe(false)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('si el borrador ya cambió (409) relee la lista, informa el motivo y no da por hecha la liberación', async () => {
    vi.spyOn(dispatchService, 'releaseDraft').mockRejectedValue(conflict('DRAFT_NOT_RELEASABLE'))
    const onDone = vi.fn()
    const { result } = renderHook(() => useSavedRouteActions(onDone))

    let applied!: boolean
    await act(async () => {
      applied = await result.current.release('r1', 'Cambio de hora')
    })

    expect(applied).toBe(false)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(result.current.states.r1).toEqual({
      status: 'failed',
      error: expect.stringMatching(/ya no se puede liberar/),
    })
  })

  it('un error que no indica cambios (500) no relee la lista', async () => {
    vi.spyOn(dispatchService, 'releaseDraft').mockRejectedValue(createHttpError(500))
    const onDone = vi.fn()
    const { result } = renderHook(() => useSavedRouteActions(onDone))

    await act(async () => {
      await result.current.release('r1', 'Cambio de hora')
    })

    expect(onDone).not.toHaveBeenCalled()
    expect(result.current.states.r1?.status).toBe('failed')
  })
})
