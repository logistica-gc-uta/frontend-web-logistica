import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '../../lib/http/apiClient'
import { createHttpError, createHttpResponse } from '../../test/http'
import {
  LEAKED_HASH,
  rawDriverFromApi,
  rawRouteFromApi,
  savedDraft,
} from '../../test/planningFixtures'
import { describeAssignError } from './confirmError'
import { driversService } from './driversService'
import { planningService } from './planningService'
import { useDriverAssignment } from './useDriverAssignment'

describe('planningService.listRoutes', () => {
  it('consulta GET /routes y conserva solo lo que usa la interfaz, con las paradas en orden', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(createHttpResponse([rawRouteFromApi]))

    const [route] = await planningService.listRoutes()

    expect(get).toHaveBeenCalledWith('/routes')
    expect(route).toEqual({
      id: 'route-raw',
      status: 'ASSIGNED',
      date: '2030-02-14T15:00:00Z',
      zoneCode: 'FIC-02',
      zoneName: 'Ficoa',
      driverName: 'Carlos Chofer',
      orders: [
        { id: 'o1', deliveryAddress: 'Primera parada', stopOrder: 1 },
        { id: 'o2', deliveryAddress: 'Segunda parada', stopOrder: 2 },
        { id: 'o3', deliveryAddress: 'Sin posición', stopOrder: null },
      ],
    })
  })

  it('nunca deja pasar el hash de contraseña ni datos de contacto del chofer o los pedidos', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(createHttpResponse([rawRouteFromApi]))

    const serialized = JSON.stringify(await planningService.listRoutes())

    expect(serialized).not.toContain(LEAKED_HASH)
    expect(serialized).not.toContain('password')
    expect(serialized).not.toContain('0990000000')
  })

  it('una ruta sin chofer queda con driverName nulo', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(
      createHttpResponse([{ ...rawRouteFromApi, status: 'DRAFT', driver: null }]),
    )

    const [route] = await planningService.listRoutes()

    expect(route.driverName).toBeNull()
  })
})

describe('planningService.assignDriver', () => {
  it('envía el chofer a POST /routes/{id}/assign', async () => {
    const assigned = { ...savedDraft(), status: 'ASSIGNED', driverId: 'driver-1' }
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(createHttpResponse(assigned))

    await expect(planningService.assignDriver('route-1', 'driver-1')).resolves.toEqual(assigned)
    expect(post).toHaveBeenCalledWith(
      '/routes/route-1/assign',
      { driverId: 'driver-1' },
      { timeout: 30_000 },
    )
  })
})

describe('driversService.list', () => {
  it('usa la disponibilidad efectiva y descarta el resto de la respuesta', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(createHttpResponse([rawDriverFromApi]))

    const drivers = await driversService.list()

    expect(get).toHaveBeenCalledWith('/drivers')
    expect(drivers).toEqual([
      {
        id: 'driver-1',
        name: 'Carlos Chofer',
        vehicle: 'Camión Isuzu ABC-123',
        isAvailable: false,
      },
    ])
    expect(JSON.stringify(drivers)).not.toContain(LEAKED_HASH)
  })
})

describe('describeAssignError', () => {
  it('explica permisos, conflictos y otros errores al asignar', () => {
    expect(describeAssignError(createHttpError(403))).toBe(
      'No tienes permisos para asignar choferes.',
    )
    expect(
      describeAssignError(createHttpError(409, { data: { message: 'Driver not available' } })),
    ).toBe(
      'Conflicto: Driver not available. El chofer o la ruta cambiaron: revisa la lista actualizada.',
    )
    expect(describeAssignError(new Error('x'))).toBe('No se pudo asignar el chofer')
  })
})

describe('useDriverAssignment', () => {
  it('asigna, limpia su estado y avisa para volver a consultar', async () => {
    const assignDriver = vi.spyOn(planningService, 'assignDriver').mockResolvedValue(savedDraft())
    const onAssigned = vi.fn()
    const { result } = renderHook(() => useDriverAssignment(onAssigned))

    await act(() => result.current.assign('route-1', 'driver-1'))

    expect(assignDriver).toHaveBeenCalledWith('route-1', 'driver-1')
    expect(result.current.states).toEqual({})
    expect(onAssigned).toHaveBeenCalledOnce()
  })

  it('mientras asigna marca la ruta y no acepta otra asignación de la misma ruta', async () => {
    let resolve!: (value: ReturnType<typeof savedDraft>) => void
    const assignDriver = vi
      .spyOn(planningService, 'assignDriver')
      .mockReturnValue(new Promise((res) => (resolve = res)))
    const { result } = renderHook(() => useDriverAssignment(vi.fn()))

    act(() => {
      void result.current.assign('route-1', 'driver-1')
      void result.current.assign('route-1', 'driver-2')
    })

    expect(result.current.states['route-1']).toEqual({ status: 'saving' })
    expect(assignDriver).toHaveBeenCalledOnce()
    await act(async () => resolve(savedDraft()))
  })

  it('una falla queda registrada como falla, no avisa éxito y permite reintentar', async () => {
    const onAssigned = vi.fn()
    vi.spyOn(planningService, 'assignDriver')
      .mockRejectedValueOnce(createHttpError(409, { data: { message: 'ocupado' } }))
      .mockResolvedValueOnce(savedDraft())
    const { result } = renderHook(() => useDriverAssignment(onAssigned))

    await act(() => result.current.assign('route-1', 'driver-1'))

    expect(result.current.states['route-1']).toEqual({
      status: 'failed',
      error: expect.stringContaining('Conflicto: ocupado'),
    })
    expect(onAssigned).not.toHaveBeenCalled()

    await act(() => result.current.assign('route-1', 'driver-1'))

    expect(onAssigned).toHaveBeenCalledOnce()
  })
})
