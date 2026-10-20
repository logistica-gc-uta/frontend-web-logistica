import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createHttpError } from '../../test/http'
import { firstProposal, savedDraft, secondProposal } from '../../test/planningFixtures'
import { planningService } from './planningService'
import { proposalKey } from './routeStyle'
import { useRouteConfirmations } from './useRouteConfirmations'

const firstKey = proposalKey(firstProposal)
const secondKey = proposalKey(secondProposal)

/** Promesa que se resuelve a mano, para simular una petición en vuelo. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('useRouteConfirmations', () => {
  it('envía la propuesta tal cual, la marca como guardada y avisa que se guardó', async () => {
    const confirmRoute = vi.spyOn(planningService, 'confirmRoute').mockResolvedValue(savedDraft())
    const onSaved = vi.fn()
    const { result } = renderHook(() => useRouteConfirmations(onSaved))

    await act(() => result.current.confirm(firstProposal))

    expect(confirmRoute).toHaveBeenCalledWith({
      zoneId: firstProposal.zoneId,
      routeDate: firstProposal.routeDate,
      orderIds: firstProposal.orderIds,
    })
    expect(result.current.states[firstKey]).toEqual({ status: 'saved', route: savedDraft() })
    expect(onSaved).toHaveBeenCalledWith(savedDraft())
  })

  it('marca la propuesta como "guardando" mientras la petición está en curso', async () => {
    const pending = deferred<ReturnType<typeof savedDraft>>()
    vi.spyOn(planningService, 'confirmRoute').mockReturnValue(pending.promise)
    const { result } = renderHook(() => useRouteConfirmations())

    act(() => {
      void result.current.confirm(firstProposal)
    })

    expect(result.current.states[firstKey]).toEqual({ status: 'saving' })
    await act(async () => pending.resolve(savedDraft()))
  })

  it('no confirma dos veces la misma propuesta aunque se pida varias veces seguidas', async () => {
    const pending = deferred<ReturnType<typeof savedDraft>>()
    const confirmRoute = vi.spyOn(planningService, 'confirmRoute').mockReturnValue(pending.promise)
    const { result } = renderHook(() => useRouteConfirmations())

    act(() => {
      void result.current.confirm(firstProposal)
      void result.current.confirm(firstProposal)
    })
    await act(async () => pending.resolve(savedDraft()))
    await act(() => result.current.confirm(firstProposal))

    expect(confirmRoute).toHaveBeenCalledOnce()
  })

  it('una falla se muestra como falla, nunca como éxito, y permite reintentar', async () => {
    const onSaved = vi.fn()
    const confirmRoute = vi
      .spyOn(planningService, 'confirmRoute')
      .mockRejectedValueOnce(createHttpError(409, { data: { message: 'Pedido reservado' } }))
      .mockResolvedValueOnce(savedDraft())
    const { result } = renderHook(() => useRouteConfirmations(onSaved))

    await act(() => result.current.confirm(firstProposal))

    expect(result.current.states[firstKey]).toEqual({
      status: 'failed',
      error: expect.stringContaining('Conflicto: Pedido reservado'),
    })
    expect(onSaved).not.toHaveBeenCalled()

    await act(() => result.current.confirm(firstProposal))

    expect(confirmRoute).toHaveBeenCalledTimes(2)
    expect(result.current.states[firstKey]).toEqual({ status: 'saved', route: savedDraft() })
  })

  it('confirmAll confirma las propuestas en orden, una tras otra', async () => {
    const order: string[] = []
    vi.spyOn(planningService, 'confirmRoute').mockImplementation(async (input) => {
      order.push(input.orderIds[0])
      return savedDraft(`route-${input.orderIds[0]}`)
    })
    const { result } = renderHook(() => useRouteConfirmations())

    await act(() => result.current.confirmAll([firstProposal, secondProposal]))

    expect(order).toEqual(['order-a', 'order-d'])
    expect(result.current.states[firstKey]?.status).toBe('saved')
    expect(result.current.states[secondKey]?.status).toBe('saved')
  })

  it('confirmAll sigue con las demás aunque una falle, y omite las ya guardadas', async () => {
    const confirmRoute = vi
      .spyOn(planningService, 'confirmRoute')
      .mockResolvedValueOnce(savedDraft('uno'))
      .mockRejectedValueOnce(createHttpError(500))
    const { result } = renderHook(() => useRouteConfirmations())
    await act(() => result.current.confirm(firstProposal))

    await act(() => result.current.confirmAll([firstProposal, secondProposal]))

    expect(confirmRoute).toHaveBeenCalledTimes(2)
    expect(result.current.states[firstKey]?.status).toBe('saved')
    expect(result.current.states[secondKey]?.status).toBe('failed')
  })
})
