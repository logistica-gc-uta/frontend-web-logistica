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

  it('consulta de nuevo cuando cambia el fetcher, indica la carga y conserva los datos previos', async () => {
    const first = vi.fn().mockResolvedValue('a')
    const second = vi.fn().mockResolvedValue('b')
    const { result, rerender } = renderHook(({ fetcher }) => useFetch(fetcher), {
      initialProps: { fetcher: first },
    })
    await waitFor(() => expect(result.current.data).toBe('a'))

    rerender({ fetcher: second })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBe('a')
    await waitFor(() => expect(result.current.data).toBe('b'))
    expect(result.current.isLoading).toBe(false)
  })

  it('una respuesta lenta de una consulta anterior no reemplaza a la más reciente', async () => {
    let resolveSlow: (value: string) => void = () => {}
    const slow = vi.fn(() => new Promise<string>((r) => (resolveSlow = r)))
    const fast = vi.fn().mockResolvedValue('filtro nuevo')
    const { result, rerender } = renderHook(({ fetcher }) => useFetch(fetcher), {
      initialProps: { fetcher: slow },
    })

    rerender({ fetcher: fast })
    await waitFor(() => expect(result.current.data).toBe('filtro nuevo'))
    await act(async () => resolveSlow('filtro viejo'))

    expect(result.current.data).toBe('filtro nuevo')
    expect(result.current.isLoading).toBe(false)
  })

  it('oculta el error anterior mientras se vuelve a consultar', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(createHttpError(500)).mockResolvedValueOnce('ok')
    const { result } = renderHook(() => useFetch(fetcher, 'Falló'))
    await waitFor(() => expect(result.current.error).toBe('Falló'))

    act(() => result.current.reload())

    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.data).toBe('ok'))
  })
})
