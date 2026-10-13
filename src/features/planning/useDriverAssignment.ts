import { useCallback, useRef, useState } from 'react'
import { describeAssignError } from './confirmError'
import { planningService } from './planningService'

export type AssignmentState = { status: 'saving' } | { status: 'failed'; error: string }

/**
 * Estado de la asignación de chofer de cada ruta. Una ruta no recibe dos asignaciones a la vez
 * (se frena el doble clic de forma síncrona). Al terminar bien se avisa con `onAssigned` y el
 * estado se limpia: la ruta aparecerá como ASSIGNED al volver a consultar el servidor.
 */
export function useDriverAssignment(onAssigned: () => void) {
  const [states, setStates] = useState<Record<string, AssignmentState>>({})
  const inFlight = useRef(new Set<string>())

  const assign = useCallback(
    async (routeId: string, driverId: string) => {
      if (inFlight.current.has(routeId)) return
      inFlight.current.add(routeId)
      setStates((current) => ({ ...current, [routeId]: { status: 'saving' } }))

      try {
        await planningService.assignDriver(routeId, driverId)
        setStates((current) => {
          const { [routeId]: _done, ...rest } = current
          return rest
        })
        onAssigned()
      } catch (error) {
        setStates((current) => ({
          ...current,
          [routeId]: { status: 'failed', error: describeAssignError(error) },
        }))
      } finally {
        inFlight.current.delete(routeId)
      }
    },
    [onAssigned],
  )

  return { states, assign }
}
