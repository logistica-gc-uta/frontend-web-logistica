import { useCallback, useEffect, useRef, useState } from 'react'
import { describeConfirmError } from './confirmError'
import { planningService } from './planningService'
import { proposalKey } from './routeStyle'
import type { RouteProposal, SavedRoute } from './types'

export type ConfirmationState =
  | { status: 'saving' }
  | { status: 'saved'; route: SavedRoute }
  | { status: 'failed'; error: string }

/**
 * Estado de la confirmación de cada propuesta. Garantiza que una propuesta no se confirme dos
 * veces: una vez en curso o guardada queda bloqueada (también ante dobles clics rápidos, antes de
 * que React vuelva a dibujar). Solo una falla permite reintentar.
 */
export function useRouteConfirmations(onSaved?: (route: SavedRoute) => void) {
  const [states, setStates] = useState<Record<string, ConfirmationState>>({})
  /** Claves en curso o ya guardadas; se consulta de forma síncrona para frenar dobles clics. */
  const locked = useRef(new Set<string>())
  /** Última función `onSaved`, para que `confirm` no cambie de identidad en cada render. */
  const onSavedRef = useRef(onSaved)
  useEffect(() => {
    onSavedRef.current = onSaved
  })

  const confirm = useCallback(async (proposal: RouteProposal) => {
    const key = proposalKey(proposal)
    if (locked.current.has(key)) return
    locked.current.add(key)
    setStates((current) => ({ ...current, [key]: { status: 'saving' } }))

    try {
      const route = await planningService.confirmRoute({
        zoneId: proposal.zoneId,
        routeDate: proposal.routeDate,
        orderIds: proposal.orderIds,
      })
      setStates((current) => ({ ...current, [key]: { status: 'saved', route } }))
      onSavedRef.current?.(route)
    } catch (error) {
      locked.current.delete(key)
      setStates((current) => ({
        ...current,
        [key]: { status: 'failed', error: describeConfirmError(error) },
      }))
    }
  }, [])

  /** Confirma una tras otra las propuestas que todavía no están guardadas ni en curso. */
  const confirmAll = useCallback(
    async (proposals: RouteProposal[]) => {
      for (const proposal of proposals) {
        await confirm(proposal)
      }
    },
    [confirm],
  )

  return { states, confirm, confirmAll }
}
