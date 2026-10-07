import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createHttpError } from '../test/http'
import { useFetch } from './useFetch'

describe('useFetch', () => {
  it('inicia cargando y luego expone los datos', async () => {
    const fetcher = vi.fn().mockResolvedValue(['a', 'b'])
    const { result } = renderHook(() => useFetch(fetcher))

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual(['a', 'b'])
    expect(result.current.error).toBeNull()
  })

  it('expone el mensaje de error si la carga falla', async () => {
    const fetcher = vi.fn().mockRejectedValue(createHttpError(500))
    const { result } = renderHook(() => useFetch(fetcher, 'No se pudieron cargar los datos'))

    await waitFor(() => expect(result.current.error).toBe('No se pudieron cargar los datos'))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toBeUndefined()
  })

  it('vuelve a consultar al recargar y conserva los datos previos mientras carga', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(['a']).mockResolvedValueOnce(['a', 'b'])
    const { result } = renderHook(() => useFetch(fetcher))
    await waitFor(() => expect(result.current.data).toEqual(['a']))

    act(() => result.current.reload())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toEqual(['a'])
    await waitFor(() => expect(result.current.data).toEqual(['a', 'b']))
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('ignora la respuesta si el componente se desmontó', async () => {
    let resolve: (value: string[]) => void = () => {}
    const fetcher = vi.fn(() => new Promise<string[]>((r) => (resolve = r)))
    const { result, unmount } = renderHook(() => useFetch(fetcher))

    unmount()
    await act(async () => resolve(['tarde']))

    expect(result.current.data).toBeUndefined()
  })
})
