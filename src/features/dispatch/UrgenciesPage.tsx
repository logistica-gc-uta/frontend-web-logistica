import { useCallback } from 'react'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { Button } from '../../components/ui/Button'
import { useFetch } from '../../hooks/useFetch'
import { useKeyedActions } from '../../hooks/useKeyedActions'
import { useAuth } from '../auth/useAuth'
import { driversService } from '../planning/driversService'
import { planningService } from '../planning/planningService'
import { SavedRoutes } from '../planning/SavedRoutes'
import { savedRouteNames } from '../planning/savedRouteNames'
import { useSavedRouteActions } from '../planning/useSavedRouteActions'
import { loadTodayAuditLog } from './auditLog'
import { DispatchAuditList } from './DispatchAuditList'
import { describeDispatchError } from './dispatchError'
import { dispatchService } from './dispatchService'
import type { DispatchAudit, RescheduleInput, UrgencyProposal } from './types'
import { loadUrgencyBoard } from './urgencyBoard'
import { UrgencyCard } from './UrgencyCard'

/**
 * Bandeja de urgencias del día: pedidos de hoy por despachar con la propuesta del backend, las
 * rutas de hoy (corregir paradas o cambiar el chofer antes de iniciar) y las decisiones
 * registradas. Las entregas fallidas se gestionan en otra bandeja.
 */
export function UrgenciesPage() {
  const { user } = useAuth()
  const board = useFetch(loadUrgencyBoard, 'No se pudo cargar la bandeja de urgencias')
  const routes = useFetch(planningService.listRoutes, 'No se pudieron cargar las rutas de hoy')
  const drivers = useFetch(driversService.list, 'No se pudieron cargar los choferes')
  const audit = useFetch(loadTodayAuditLog, 'No se pudieron cargar las decisiones')

  const { reload: reloadBoard } = board
  const { reload: reloadRoutes } = routes
  const { reload: reloadDrivers } = drivers
  const { reload: reloadAudit } = audit
  // Cualquier decisión puede cambiar propuestas, rutas, choferes y el historial.
  const refreshAll = useCallback(() => {
    reloadBoard()
    reloadRoutes()
    reloadDrivers()
    reloadAudit()
  }, [reloadBoard, reloadRoutes, reloadDrivers, reloadAudit])

  const urgencyActions = useKeyedActions(refreshAll)
  const routeActions = useSavedRouteActions(refreshAll)

  const decide = (orderId: string, perform: () => Promise<unknown>) =>
    urgencyActions.run(orderId, perform, describeDispatchError)
  const confirm = (proposal: UrgencyProposal, reason: string, driverId?: string) =>
    decide(proposal.orderId, () => dispatchService.confirm(proposal, reason, driverId))
  const reject = (proposal: UrgencyProposal, reason: string) =>
    decide(proposal.orderId, () => dispatchService.reject(proposal, reason))
  const prioritize = (orderId: string, reason: string) =>
    decide(orderId, () => dispatchService.prioritize(orderId, reason))
  const reschedule = (input: RescheduleInput) =>
    decide(input.orderId, () => dispatchService.reschedule(input))

  const day = board.data?.date
  const routeNames = day && routes.data ? savedRouteNames(routes.data, day) : {}
  const describeResource = ({ orderId, routeId }: DispatchAudit) => {
    const address = orderId
      ? (audit.data?.addresses[orderId] ?? board.data?.orders[orderId]?.deliveryAddress)
      : undefined
    const parts = [
      orderId && `Pedido: ${address ?? orderId.slice(0, 8)}`,
      routeId && (routeNames[routeId] ?? `Ruta ${routeId.slice(0, 8)}`),
    ]
    return parts.filter(Boolean).join(' · ') || '—'
  }

  return (
    <main className="page">
      <h1>Urgencias</h1>
      <p className="text-muted">
        Pedidos de hoy por despachar. El sistema propone insertarlos en una ruta sin iniciar con
        lugar, crear una salida nueva o mantenerlos pendientes con su motivo. Nada cambia hasta que
        confirmas una decisión, y cada decisión queda registrada con su motivo.
      </p>

      <div className="page-stack">
        <section className="card" aria-labelledby="urgencies-title">
          <div className="planning-routes__header">
            <h2 id="urgencies-title">Bandeja de urgencias</h2>
            <Button variant="secondary" onClick={refreshAll}>
              Actualizar propuestas
            </Button>
          </div>
          <AsyncContent {...board} onRetry={reloadBoard} loadingText="Cargando urgencias...">
            {({ urgencies, alreadyRouted, failedDeliveries, orders }) => (
              <>
                {failedDeliveries > 0 && (
                  <p className="notice" role="note">
                    {failedDeliveries === 1
                      ? 'Hay 1 pedido con una entrega fallida esperando revisión.'
                      : `Hay ${failedDeliveries} pedidos con una entrega fallida esperando revisión.`}{' '}
                    Se gestionan en la bandeja de entregas fallidas, no aquí.
                  </p>
                )}
                {alreadyRouted > 0 && (
                  <p className="text-muted">
                    {alreadyRouted === 1
                      ? '1 pedido de hoy ya está en una ruta: se ve en "Rutas de hoy".'
                      : `${alreadyRouted} pedidos de hoy ya están en una ruta: se ven en "Rutas de hoy".`}
                  </p>
                )}
                {urgencies.length === 0 ? (
                  <p className="empty-state">No hay pedidos urgentes por despachar hoy.</p>
                ) : (
                  <div className="urgency-list">
                    {urgencies.map((proposal) => (
                      <UrgencyCard
                        key={proposal.orderId}
                        proposal={proposal}
                        order={orders[proposal.orderId]}
                        targetRouteName={
                          proposal.routeId ? routeNames[proposal.routeId] : undefined
                        }
                        drivers={drivers.data ?? []}
                        state={urgencyActions.states[proposal.orderId]}
                        onConfirm={confirm}
                        onReject={reject}
                        onPrioritize={prioritize}
                        onReschedule={reschedule}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </AsyncContent>
        </section>

        {day && (
          <section className="card" aria-labelledby="today-routes-title">
            <h2 id="today-routes-title">Rutas de hoy</h2>
            <p className="text-muted">
              Antes de iniciar se pueden corregir sus paradas o cambiar el chofer. Las rutas en
              curso o completadas no se modifican.
            </p>
            <AsyncContent {...routes} onRetry={reloadRoutes} loadingText="Cargando rutas...">
              {(routeList) => (
                <>
                  {drivers.error && <p className="field__error">{drivers.error}</p>}
                  <SavedRoutes
                    day={day}
                    routes={routeList}
                    drivers={drivers.data ?? []}
                    actions={routeActions.states}
                    onAssign={routeActions.assign}
                    onReassign={routeActions.reassign}
                    onReorder={routeActions.reorder}
                    onMove={routeActions.move}
                  />
                </>
              )}
            </AsyncContent>
          </section>
        )}

        {day && (
          <section className="card" aria-labelledby="audit-title">
            <h2 id="audit-title">Decisiones registradas hoy</h2>
            <AsyncContent {...audit} onRetry={reloadAudit} loadingText="Cargando decisiones...">
              {({ records }) => (
                <DispatchAuditList
                  records={records}
                  currentUserId={user?.id}
                  describeResource={describeResource}
                />
              )}
            </AsyncContent>
          </section>
        )}
      </div>
    </main>
  )
}
