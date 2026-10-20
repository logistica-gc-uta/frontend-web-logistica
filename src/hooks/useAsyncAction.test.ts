import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createHttpError } from '../test/http'
import { useAsyncAction } from './useAsyncAction'

/** Promesa que se resuelve o rechaza a mano, para controlar el orden de las respuestas. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useAsyncAction', () => {
  it('empieza sin datos ni ejecución en curso', () => {
    const { result } = renderHook(() => useAsyncAction(vi.fn()))

    expect(result.current).toEqual(
      expect.objectContaining({ data: undefined, error: null, isRunning: false }),
    )
  })

  it('indica que está en curso y luego expone el resultado', async () => {
    const pending = deferred<string>()
    const action = vi.fn(() => pending.promise)
    const { result } = renderHook(() => useAsyncAction(action))

    act(() => {
      void result.current.run()
    })

    expect(result.current.isRunning).toBe(true)
    await act(async () => pending.resolve('listo'))
    expect(result.current.isRunning).toBe(false)
    expect(result.current.data).toBe('listo')
  })

  it('pasa a la acción los argumentos con los que se ejecuta', async () => {
    const action = vi.fn((a: number, b: number) => Promise.resolve(a + b))
    const { result } = renderHook(() => useAsyncAction(action))

    await act(() => result.current.run(2, 3))

    expect(action).toHaveBeenCalledWith(2, 3)
    expect(result.current.data).toBe(5)
  })

  it('expone el mensaje de error y no deja datos antiguos', async () => {
    const action = vi
      .fn()
      .mockResolvedValueOnce('viejo')
      .mockRejectedValueOnce(createHttpError(500))
    const { result } = renderHook(() => useAsyncAction(action, 'Falló el cálculo'))
    await act(() => result.current.run())
    expect(result.current.data).toBe('viejo')

    await act(() => result.current.run())

    expect(result.current.error).toBe('Falló el cálculo')
    expect(result.current.data).toBeUndefined()
  })

  it('no muestra el resultado anterior mientras corre una ejecución nueva', async () => {
    const second = deferred<string>()
    const action = vi.fn().mockResolvedValueOnce('primero').mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => useAsyncAction(action))
    await act(() => result.current.run())

    act(() => {
      void result.current.run()
    })

    expect(result.current.data).toBeUndefined()
    await act(async () => second.resolve('segundo'))
    expect(result.current.data).toBe('segundo')
  })

  it('si se lanza otra ejecución antes de que termine la anterior, solo cuenta la última', async () => {
    const slow = deferred<string>()
    const fast = deferred<string>()
    const action = vi.fn().mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise)
    const { result } = renderHook(() => useAsyncAction(action))

    act(() => {
      void result.current.run()
      void result.current.run()
    })
    await act(async () => fast.resolve('rápida'))
    await act(async () => slow.resolve('lenta'))

    await waitFor(() => expect(result.current.data).toBe('rápida'))
  })

  it('reset descarta el resultado y las ejecuciones en curso', async () => {
    const pending = deferred<string>()
    const action = vi.fn(() => pending.promise)
    const { result } = renderHook(() => useAsyncAction(action))
    act(() => {
      void result.current.run()
    })

    act(() => result.current.reset())
    await act(async () => pending.resolve('tarde'))

    expect(result.current).toEqual(
      expect.objectContaining({ data: undefined, error: null, isRunning: false }),
    )
  })
})
