import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RealtimeSubscription } from '../lib/realtime/realtimeClient'
import { createFakeSocket } from '../test/fakeSocket'
import { useRealtimeUpdates } from './useRealtimeUpdates'

const ROUTE: RealtimeSubscription = { resource: 'route', id: 'route-1' }
const ORDER: RealtimeSubscription = { resource: 'order', id: 'order-1' }

const setup = (
  subscriptions: RealtimeSubscription[] = [ROUTE, ORDER],
  socket = createFakeSocket(),
) => {
  const onInvalidate = vi.fn()
  const createSocket = () => socket
  const hook = renderHook(
    ({ subs }) => useRealtimeUpdates({ subscriptions: subs, onInvalidate, createSocket }),
    { initialProps: { subs: subscriptions } },
  )
  return { socket, onInvalidate, ...hook }
}

describe('useRealtimeUpdates', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('al conectar se suscribe a cada recurso y consulta el estado real por REST', () => {
    const { socket, onInvalidate, result } = setup()
    expect(socket.connect).toHaveBeenCalledOnce()
    expect(result.current.status).toBe('connecting')

    act(() => socket.fire('connect'))

    expect(socket.subscriptions).toEqual([ROUTE, ORDER])
    expect(onInvalidate).toHaveBeenCalledOnce()
    expect(result.current.status).toBe('live')
  })

  it('un evento recibido provoca una consulta; varios seguidos (o repetidos) se agrupan en una sola', () => {
    const { socket, onInvalidate } = setup()
    act(() => socket.fire('connect'))
    onInvalidate.mockClear()

    act(() => {
      socket.fire('order.status.updated', { data: { orderId: 'order-1', status: 'DELIVERED' } })
      socket.fire('order.status.updated', { data: { orderId: 'order-1', status: 'DELIVERED' } })
      socket.fire('route.updated', { data: { routeId: 'route-1' } })
    })
    expect(onInvalidate).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(300))

    expect(onInvalidate).toHaveBeenCalledOnce()
  })

  it('cada uno de los eventos del protocolo invalida el estado', () => {
    const { socket, onInvalidate } = setup()
    act(() => socket.fire('connect'))

    for (const event of [
      'order.status.updated',
      'route.updated',
      'dispatch.incident.updated',
      'driver.availability.updated',
    ]) {
      onInvalidate.mockClear()
      act(() => {
        socket.fire(event, {})
        vi.advanceTimersByTime(300)
      })
      expect(onInvalidate).toHaveBeenCalledOnce()
    }
  })

  it('al perder la conexión lo indica; al recuperarla se suscribe de nuevo y vuelve a consultar', () => {
    const { socket, onInvalidate, result } = setup()
    act(() => socket.fire('connect'))

    act(() => socket.fire('disconnect', 'transport close'))
    expect(result.current.status).toBe('lost')

    onInvalidate.mockClear()
    act(() => socket.fire('connect'))

    expect(result.current.status).toBe('recovered')
    expect(socket.subscriptions).toEqual([ROUTE, ORDER, ROUTE, ORDER])
    expect(onInvalidate).toHaveBeenCalledOnce()
  })

  it('si no puede conectar lo indica como conexión perdida', () => {
    const { socket, result } = setup()

    act(() => socket.fire('connect_error', new Error('unauthorized')))

    expect(result.current.status).toBe('lost')
  })

  it('si el servidor cierra la conexión no reintenta sola: espera "Reconectar"', () => {
    const { socket, result } = setup()
    act(() => socket.fire('connect'))

    act(() => socket.fire('disconnect', 'io server disconnect'))
    expect(result.current.status).toBe('closed')
    expect(socket.connect).toHaveBeenCalledOnce()

    act(() => result.current.reconnect())

    expect(result.current.status).toBe('connecting')
    expect(socket.connect).toHaveBeenCalledTimes(2)
  })

  it('cuenta las suscripciones que el backend rechaza y no intenta otra más amplia', () => {
    const socket = createFakeSocket((payload) =>
      (payload as RealtimeSubscription).resource === 'order'
        ? { ok: false, error: 'FORBIDDEN' }
        : { ok: true },
    )
    const { result } = setup([ROUTE, ORDER], socket)

    act(() => socket.fire('connect'))

    expect(result.current.deniedCount).toBe(1)
    expect(socket.subscriptions).toEqual([ROUTE, ORDER])
  })

  it('se suscribe a los recursos nuevos sin reconectar y no repite los que ya tiene', () => {
    const { socket, rerender } = setup([ROUTE])
    act(() => socket.fire('connect'))

    rerender({ subs: [ROUTE, ORDER, { resource: 'incidents' }] })

    expect(socket.subscriptions).toEqual([ROUTE, ORDER, { resource: 'incidents' }])
    expect(socket.connect).toHaveBeenCalledOnce()
  })

  it('al salir de la pantalla cierra la conexión y descarta consultas pendientes', () => {
    const { socket, onInvalidate, unmount } = setup()
    act(() => socket.fire('connect'))
    onInvalidate.mockClear()
    act(() => socket.fire('route.updated', {}))

    unmount()
    vi.advanceTimersByTime(300)

    expect(socket.disconnect).toHaveBeenCalled()
    expect(onInvalidate).not.toHaveBeenCalled()
  })
})
