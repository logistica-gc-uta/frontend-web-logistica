import { useCallback, useRef, useState } from 'react'

export type RouteActionState = { status: 'saving' } | { status: 'failed'; error: string }

/**
 * Estado de las acciones sobre rutas guardadas (asignar chofer, reordenar, mover un pedido).
 * Una ruta no recibe dos acciones a la vez: el doble clic se frena de forma síncrona. Al terminar
 * bien se avisa con `onDone` y el estado se limpia, porque la ruta se ve actualizada al volver a
 * consultar el servidor. Una falla nunca se presenta como éxito.
 */
export function useRouteActions(onDone: () => void) {
  const [states, setStates] = useState<Record<string, RouteActionState>>({})
  const inFlight = useRef(new Set<string>())

  /** Ejecuta `perform` sobre la ruta; devuelve `true` si se aplicó. */
  const run = useCallback(
    async (
      routeId: string,
      perform: () => Promise<unknown>,
      describeError: (error: unknown) => string,
    ): Promise<boolean> => {
      if (inFlight.current.has(routeId)) return false
      inFlight.current.add(routeId)
      setStates((current) => ({ ...current, [routeId]: { status: 'saving' } }))

      try {
        await perform()
        setStates((current) => {
          const { [routeId]: _done, ...rest } = current
          return rest
        })
        onDone()
        return true
      } catch (error) {
        setStates((current) => ({
          ...current,
          [routeId]: { status: 'failed', error: describeError(error) },
        }))
        return false
      } finally {
        inFlight.current.delete(routeId)
      }
    },
    [onDone],
  )

  return { states, run }
}
