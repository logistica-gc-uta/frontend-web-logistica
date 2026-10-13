import { useCallback, useEffect, useState } from 'react'
import { getErrorMessage } from '../lib/http/apiError'

/** Resultado de la última petición terminada y a qué consulta (fetcher + recarga) corresponde. */
interface SettledRequest<T> {
  fetcher: () => Promise<T>
  reloadCount: number
  data: T | undefined
  error: string | null
}

/**
 * Carga datos al montar el componente, cada vez que cambia `fetcher` y al pedir una recarga.
 * `fetcher` debe ser una referencia estable (un método de un servicio o un `useCallback`).
 * Mientras se consulta de nuevo se conservan los datos anteriores y `isLoading` es `true`.
 */
export function useFetch<T>(fetcher: () => Promise<T>, errorMessage?: string) {
  const [reloadCount, setReloadCount] = useState(0)
  const [settled, setSettled] = useState<SettledRequest<T> | null>(null)

  useEffect(() => {
    let isActive = true

    fetcher()
      .then((data) => {
        if (isActive) setSettled({ fetcher, reloadCount, data, error: null })
      })
      .catch((error: unknown) => {
        if (isActive) {
          setSettled((current) => ({
            fetcher,
            reloadCount,
            data: current?.data,
            error: getErrorMessage(error, errorMessage),
          }))
        }
      })

    return () => {
      isActive = false
    }
  }, [fetcher, errorMessage, reloadCount])

  const reload = useCallback(() => setReloadCount((count) => count + 1), [])

  const isLoading =
    settled === null || settled.fetcher !== fetcher || settled.reloadCount !== reloadCount

  return {
    data: settled?.data,
    error: isLoading ? null : settled.error,
    isLoading,
    reload,
  }
}
