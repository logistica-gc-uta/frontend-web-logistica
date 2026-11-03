import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '../../lib/http/apiClient'
import { createHttpResponse } from '../../test/http'
import {
  monitorRoute,
  rawMonitorRoute,
  stopWith,
  threeDeliveredOneFailed,
} from '../../test/monitorFixtures'
import { availableDriver, busyDriver } from '../../test/planningFixtures'
import { driversService } from '../planning/driversService'
import { boardSubscriptions, loadMonitorBoard } from './monitorBoard'
import { monitorService } from './monitorService'
import { driverState, routeProgress } from './routeProgress'

describe('monitorService.listRoutes', () => {
  it('copia solo lo que muestra el monitor, con las paradas en orden y el último motivo de fallo', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(createHttpResponse([rawMonitorRoute]))

    const [route] = await monitorService.listRoutes()

    expect(route).toEqual({
      id: 'route-raw',
      status: 'COMPLETED',
      date: '2026-10-21T15:00:00Z',
      createdAt: '2026-10-21T12:00:00Z',
      zoneCode: 'FIC-02',
      driverId: 'driver-1',
      driverName: 'Carlos Chofer',
      startedAt: '2026-10-21T14:00:00Z',
      completedAt: '2026-10-21T16:00:00Z',
      returnedAt: null,
      stops: [
        {
          id: 's1',
          orderId: 'o1',
          sequence: 1,
          deliveryAddress: 'Primera',
          outcome: 'SUCCESSFUL',
          failureReason: null,
        },
        {
          id: 's2',
          orderId: 'o2',
          sequence: 2,
          deliveryAddress: 'Segunda',
          outcome: 'FAILED',
          failureReason: 'RECIPIENT_REFUSED',
        },
      ],
    })
  })

  it('no deja pasar datos del destinatario, el texto libre del chofer ni el hash de contraseña', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(createHttpResponse([rawMonitorRoute]))

    const serialized = JSON.stringify(await monitorService.listRoutes())

    for (const secret of ['HASH-SECRETO', 'Conversación', 'Nadie abrió', '0990000000', 'Ana']) {
      expect(serialized).not.toContain(secret)
    }
  })

  it('ordena por cuándo se confirmaron, no por el orden variable de la API', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(
      createHttpResponse([
        { ...rawMonitorRoute, id: 'segunda', createdAt: '2026-10-21T13:00:00Z' },
        { ...rawMonitorRoute, id: 'primera', createdAt: '2026-10-21T11:00:00Z' },
      ]),
    )

    expect((await monitorService.listRoutes()).map((route) => route.id)).toEqual([
      'primera',
      'segunda',
    ])
  })
})

describe('routeProgress', () => {
  it('3 entregas y 1 visita fallida: 4 de 4 resueltas, pero 75 % entregado (no 100 %)', () => {
    expect(routeProgress(monitorRoute({ stops: threeDeliveredOneFailed() }))).toEqual({
      total: 4,
      delivered: 3,
      failed: 1,
      resolved: 4,
      deliveredPercent: 75,
    })
  })

  it('las paradas sin resultado no cuentan como entregadas ni como fallidas', () => {
    const progress = routeProgress(
      monitorRoute({
        stops: [stopWith(1, 'SUCCESSFUL'), stopWith(2, null), stopWith(3, 'PENDING')],
      }),
    )

    expect(progress).toEqual({
      total: 3,
      delivered: 1,
      failed: 0,
      resolved: 1,
      deliveredPercent: 33,
    })
  })

  it('una ruta sin paradas está al 0 %', () => {
    expect(routeProgress(monitorRoute({ stops: [] })).deliveredPercent).toBe(0)
  })
})

describe('driverState', () => {
  it.each([
    ['ASSIGNED', null, availableDriver, 'BUSY'],
    ['IN_PROGRESS', null, availableDriver, 'BUSY'],
    // Completar las visitas no libera al chofer: falta confirmar el regreso al depósito.
    ['COMPLETED', null, availableDriver, 'RETURNING'],
    ['COMPLETED', '2026-10-21T17:00:00Z', availableDriver, 'AVAILABLE'],
    ['COMPLETED', '2026-10-21T17:00:00Z', busyDriver, 'BUSY_ELSEWHERE'],
  ] as const)('ruta %s con regreso %s → %s', (status, returnedAt, driver, expected) => {
    expect(driverState(monitorRoute({ status, returnedAt }), driver)).toBe(expected)
  })

  it('sin chofer no hay estado de chofer', () => {
    expect(driverState(monitorRoute({ driverId: null }), undefined)).toBeNull()
  })
})

describe('loadMonitorBoard y boardSubscriptions', () => {
  const NOW = new Date('2026-10-21T17:00:00Z')

  it('sigue solo las rutas de hoy con chofer y cuenta los borradores', async () => {
    vi.spyOn(monitorService, 'listRoutes').mockResolvedValue([
      monitorRoute({ id: 'hoy' }),
      monitorRoute({ id: 'borrador', status: 'DRAFT', driverId: null }),
      monitorRoute({ id: 'ayer', date: '2026-10-20T15:00:00Z' }),
    ])
    vi.spyOn(driversService, 'list').mockResolvedValue([availableDriver])

    const board = await loadMonitorBoard(NOW)

    expect(board.day).toBe('2026-10-21')
    expect(board.routes).toEqual([{ route: monitorRoute({ id: 'hoy' }), name: 'Ruta 1 · FIC-02' }])
    expect(board.drafts).toBe(1)
    expect(board.drivers).toEqual({ 'driver-1': availableDriver })
    expect(Date.parse(board.loadedAt)).not.toBeNaN()
  })

  it('se suscribe a las incidencias, a cada ruta, a su chofer y a cada pedido', async () => {
    vi.spyOn(monitorService, 'listRoutes').mockResolvedValue([
      monitorRoute({ stops: [stopWith(1, 'PENDING'), stopWith(2, 'PENDING')] }),
    ])
    vi.spyOn(driversService, 'list').mockResolvedValue([])

    expect(boardSubscriptions(await loadMonitorBoard(NOW))).toEqual([
      { resource: 'incidents' },
      { resource: 'route', id: 'route-1' },
      { resource: 'driver', id: 'driver-1' },
      { resource: 'order', id: 'order-1' },
      { resource: 'order', id: 'order-2' },
    ])
    expect(boardSubscriptions(undefined)).toEqual([])
  })
})
