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
import { describeAssignError, describeCorrectionError } from './confirmError'
import { driversService } from './driversService'
import { dispatchService } from '../dispatch/dispatchService'
import { planningService } from './planningService'
import { useKeyedActions } from '../../hooks/useKeyedActions'

describe('planningService.listRoutes', () => {
  it('consulta GET /routes y conserva solo lo que usa la interfaz, con las paradas en orden', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(createHttpResponse([rawRouteFromApi]))

    const [route] = await planningService.listRoutes()

    expect(get).toHaveBeenCalledWith('/routes')
    expect(route).toEqual({
      id: 'route-raw',
      status: 'ASSIGNED',
      date: '2030-02-14T15:00:00Z',
      createdAt: '2026-10-13T12:00:00Z',
      zoneId: 'zone-1',
      zoneCode: 'FIC-02',
      zoneName: 'Ficoa',
      driverId: 'driver-1',
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

  it('ordena las rutas por cuándo se confirmaron, no por el orden variable de la API', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(
      createHttpResponse([
        { ...rawRouteFromApi, id: 'segunda', createdAt: '2026-10-13T06:07:41Z' },
        { ...rawRouteFromApi, id: 'primera', createdAt: '2026-10-13T05:49:50Z' },
      ]),
    )

    const routes = await planningService.listRoutes()

    expect(routes.map((route) => route.id)).toEqual(['primera', 'segunda'])
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
        unavailableReason: 'ROUTE_HOLD',
      },
    ])
    expect(JSON.stringify(drivers)).not.toContain(LEAKED_HASH)
  })
})

describe('driversService.list · motivo de no disponibilidad', () => {
  it.each([
    [{ isAvailable: true, hasPersistedHolds: false }, null],
    [{ isAvailable: false, hasPersistedHolds: true }, 'ROUTE_HOLD'],
    [{ isAvailable: false, hasPersistedHolds: false }, 'MARKED_UNAVAILABLE'],
  ])('%o → %s', async (effectiveAvailability, expected) => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(
      createHttpResponse([{ ...rawDriverFromApi, effectiveAvailability }]),
    )

    const [driver] = await driversService.list()

    expect(driver.unavailableReason).toBe(expected)
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

describe('planningService · correcciones (POST /dispatch/interventions)', () => {
  const applied = { id: 'audit-1', action: 'REORDER', outcome: 'APPLIED' as const }

  it('reordena con un requestId nuevo en cada intento y el motivo', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(createHttpResponse(applied))
    const input = { routeId: 'route-1', orderIds: ['o2', 'o1'], reason: 'Calle cerrada' }

    await dispatchService.reorderStops(input)
    await dispatchService.reorderStops(input)

    const [first, second] = post.mock.calls
    expect(first[0]).toBe('/dispatch/interventions')
    expect(first[1]).toEqual({
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      action: 'REORDER',
      routeId: 'route-1',
      orderIds: ['o2', 'o1'],
      reason: 'Calle cerrada',
    })
    expect(first[2]).toEqual({ timeout: 30_000 })
    expect((second[1] as { requestId: string }).requestId).not.toBe(
      (first[1] as { requestId: string }).requestId,
    )
  })

  it('mueve un pedido indicando la ruta de origen y la de destino', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue(createHttpResponse({ ...applied, action: 'MOVE' }))

    await dispatchService.moveOrder({
      routeId: 'route-1',
      orderId: 'o1',
      targetRouteId: 'route-2',
      reason: 'Equilibrar carga',
    })

    expect(post.mock.calls[0][1]).toEqual({
      requestId: expect.any(String),
      action: 'MOVE',
      routeId: 'route-1',
      orderId: 'o1',
      targetRouteId: 'route-2',
      reason: 'Equilibrar carga',
    })
  })

  it('un resultado distinto de APPLIED no se toma como éxito', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue(
      createHttpResponse({ ...applied, outcome: 'REJECTED' }),
    )

    await expect(
      dispatchService.reorderStops({ routeId: 'r', orderIds: ['o'], reason: 'x' }),
    ).rejects.toThrow('El servidor no aplicó la decisión. Revisa la lista actualizada.')
  })
})

describe('describeCorrectionError', () => {
  it('explica permisos, rutas ya iniciadas y otros errores al corregir', () => {
    expect(describeCorrectionError(createHttpError(403))).toBe(
      'No tienes permisos para corregir rutas.',
    )
    expect(
      describeCorrectionError(
        createHttpError(409, { data: { message: 'Route structure is frozen' } }),
      ),
    ).toBe(
      'Conflicto: Route structure is frozen. La ruta cambió o ya no se puede modificar (por ejemplo, se inició): revisa la lista actualizada.',
    )
    expect(describeCorrectionError(new Error('x'))).toBe('No se pudo corregir la ruta')
  })
})

describe('useKeyedActions', () => {
  it('ejecuta la acción, limpia su estado, avisa para volver a consultar e informa el éxito', async () => {
    const perform = vi.fn().mockResolvedValue(undefined)
    const onDone = vi.fn()
    const { result } = renderHook(() => useKeyedActions(onDone))

    let applied = false
    await act(async () => {
      applied = await result.current.run('route-1', perform, describeAssignError)
    })

    expect(applied).toBe(true)
    expect(perform).toHaveBeenCalledOnce()
    expect(result.current.states).toEqual({})
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('mientras actúa sobre una ruta marca su estado y no acepta otra acción sobre ella', async () => {
    let resolve!: () => void
    const perform = vi.fn(() => new Promise<void>((res) => (resolve = res)))
    const other = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useKeyedActions(vi.fn()))

    act(() => {
      void result.current.run('route-1', perform, describeAssignError)
      void result.current.run('route-1', other, describeAssignError)
    })

    expect(result.current.states['route-1']).toEqual({ status: 'saving' })
    expect(perform).toHaveBeenCalledOnce()
    expect(other).not.toHaveBeenCalled()
    await act(async () => resolve())
  })

  it('una falla queda registrada con su mensaje, no avisa éxito y permite reintentar', async () => {
    const onDone = vi.fn()
    const perform = vi
      .fn()
      .mockRejectedValueOnce(createHttpError(409, { data: { message: 'ocupado' } }))
      .mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useKeyedActions(onDone))

    let applied = true
    await act(async () => {
      applied = await result.current.run('route-1', perform, describeAssignError)
    })

    expect(applied).toBe(false)
    expect(result.current.states['route-1']).toEqual({
      status: 'failed',
      error: expect.stringContaining('Conflicto: ocupado'),
    })
    expect(onDone).not.toHaveBeenCalled()

    await act(() => result.current.run('route-1', perform, describeAssignError))

    expect(onDone).toHaveBeenCalledOnce()
  })
})
