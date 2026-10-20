import { useCallback, useRef, useState } from 'react'
import { getErrorMessage } from '../lib/http/apiError'

interface ActionState<TResult> {
  data: TResult | undefined
  error: string | null
  isRunning: boolean
}

/**
 * Ejecuta una acción asíncrona disparada por el usuario (por ejemplo, calcular una propuesta) y
 * expone su resultado, su error y si está en curso. Si se lanza otra antes de que termine la
 * anterior, solo cuenta la última; mientras corre no se muestra el resultado anterior, para no
 * confundirlo con el de los parámetros nuevos.
 */
export function useAsyncAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
  errorMessage?: string,
) {
  const [state, setState] = useState<ActionState<TResult>>({
    data: undefined,
    error: null,
    isRunning: false,
  })
  const latestRequest = useRef(0)

  const run = useCallback(
    async (...args: TArgs) => {
      const request = ++latestRequest.current
      setState({ data: undefined, error: null, isRunning: true })
      try {
        const data = await action(...args)
        if (request === latestRequest.current) setState({ data, error: null, isRunning: false })
      } catch (error) {
        if (request === latestRequest.current) {
          setState({
            data: undefined,
            error: getErrorMessage(error, errorMessage),
            isRunning: false,
          })
        }
      }
    },
    [action, errorMessage],
  )

  /** Descarta el resultado actual y cualquier ejecución en curso. */
  const reset = useCallback(() => {
    latestRequest.current += 1
    setState({ data: undefined, error: null, isRunning: false })
  }, [])

  return { ...state, run, reset }
}
