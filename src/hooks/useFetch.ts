import { useCallback, useEffect, useState } from 'react'
import { getErrorMessage } from '../lib/http/apiError'

interface FetchState<T> {
  data: T | undefined
  error: string | null
  isLoading: boolean
}

/**
 * Carga datos al montar el componente y permite recargarlos.
 * `fetcher` debe ser una referencia estable (por ejemplo, un método de un servicio).
 */
export function useFetch<T>(fetcher: () => Promise<T>, errorMessage?: string) {
  const [state, setState] = useState<FetchState<T>>({
    data: undefined,
    error: null,
    isLoading: true,
  })
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    let isActive = true

    fetcher()
      .then((data) => {
        if (isActive) setState({ data, error: null, isLoading: false })
      })
      .catch((error: unknown) => {
        if (isActive) {
          setState((current) => ({
            ...current,
            error: getErrorMessage(error, errorMessage),
            isLoading: false,
          }))
        }
      })

    return () => {
      isActive = false
    }
  }, [fetcher, errorMessage, reloadCount])

  const reload = useCallback(() => {
    setState((current) => ({ ...current, error: null, isLoading: true }))
    setReloadCount((count) => count + 1)
  }, [])

  return { ...state, reload }
}
