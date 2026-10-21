import { useCallback, useRef, useState } from 'react'

export type KeyedActionState = { status: 'saving' } | { status: 'failed'; error: string }

/**
 * Estado de acciones sobre recursos identificados por una clave (una ruta, un pedido). Un recurso
 * no recibe dos acciones a la vez: el doble clic se frena de forma síncrona. Al terminar bien se
 * avisa con `onDone` y el estado se limpia, porque el recurso se ve actualizado al volver a
 * consultar el servidor. Una falla nunca se presenta como éxito.
 */
export function useKeyedActions(onDone: () => void) {
  const [states, setStates] = useState<Record<string, KeyedActionState>>({})
  const inFlight = useRef(new Set<string>())

  /** Ejecuta `perform` sobre el recurso `key`; devuelve `true` si se aplicó. */
  const run = useCallback(
    async (
      key: string,
      perform: () => Promise<unknown>,
      describeError: (error: unknown) => string,
    ): Promise<boolean> => {
      if (inFlight.current.has(key)) return false
      inFlight.current.add(key)
      setStates((current) => ({ ...current, [key]: { status: 'saving' } }))

      try {
        await perform()
        setStates((current) => {
          const { [key]: _done, ...rest } = current
          return rest
        })
        onDone()
        return true
      } catch (error) {
        setStates((current) => ({
          ...current,
          [key]: { status: 'failed', error: describeError(error) },
        }))
        return false
      } finally {
        inFlight.current.delete(key)
      }
    },
    [onDone],
  )

  return { states, run }
}
