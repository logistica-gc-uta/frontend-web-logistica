import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { paths } from '../../app/paths'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { Drawer } from '../../components/ui/Drawer'
import { useFetch } from '../../hooks/useFetch'
import { useKeyedActions } from '../../hooks/useKeyedActions'
import { useRealtimeUpdates } from '../../hooks/useRealtimeUpdates'
import { useAuth } from '../auth/useAuth'
import { ConnectionStatus } from '../monitor/ConnectionStatus'
import { driversService } from '../planning/driversService'
import { planningService } from '../planning/planningService'
import { SavedRoutes } from '../planning/SavedRoutes'
import { namedRoutesOfDay, savedRouteNames } from '../planning/savedRouteNames'
import { useSavedRouteActions } from '../planning/useSavedRouteActions'
import { loadTodayAuditLog } from './auditLog'
import { DispatchAuditList } from './DispatchAuditList'
import { describeDispatchError } from './dispatchError'
import { dispatchService } from './dispatchService'
import type { DispatchAudit, RescheduleInput, UrgencyProposal } from './types'
import { loadUrgencyBoard } from './urgencyBoard'
import { UrgencyCard } from './UrgencyCard'
import { todayInGuayaquil } from '../../lib/time/guayaquil'

/** Atributos comunes de los iconos de la cabecera. */
const ICON = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

/** Choferes con la disponibilidad de hoy, incluida la ausencia (#36). */
const loadDriversToday = () => driversService.listForDay(todayInGuayaquil())

/**
 * Bandeja de urgencias del día: pedidos de hoy por despachar con la propuesta del backend, las
 * rutas de hoy (corregir paradas o cambiar el chofer antes de iniciar) y las decisiones
 * registradas. Las entregas fallidas se gestionan en otra bandeja.
 */
export function UrgenciesPage() {
  const { user } = useAuth()
  const board = useFetch(loadUrgencyBoard, 'No se pudo cargar la bandeja de urgencias')
  const routes = useFetch(planningService.listRoutes, 'No se pudieron cargar las rutas de hoy')
  // Las rutas de la bandeja son de hoy: un chofer ausente hoy no se ofrece (#36).
  const drivers = useFetch(loadDriversToday, 'No se pudieron cargar los choferes')
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

  // En vivo: los avisos del servidor (entregas fallidas, rutas, choferes y pedidos que se siguen) vuelven
  // a consultar la bandeja. Un pedido urgente nuevo no tiene aviso propio, así que además se consulta
  // cada minuto.
  const subscriptions = [
    { resource: 'incidents' as const },
    ...(routes.data ?? []).flatMap((route) => [
      { resource: 'route' as const, id: route.id },
      ...(route.driverId ? [{ resource: 'driver' as const, id: route.driverId }] : []),
    ]),
    ...(board.data?.urgencies ?? []).map(({ orderId }) => ({
      resource: 'order' as const,
      id: orderId,
    })),
  ]
  const realtime = useRealtimeUpdates({ subscriptions, onInvalidate: refreshAll })
  useEffect(() => {
    const timer = setInterval(refreshAll, 60_000)
    return () => clearInterval(timer)
  }, [refreshAll])

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
  // Rutas de hoy y decisiones registradas viven en paneles laterales, abiertos desde la cabecera.
  const [panel, setPanel] = useState<'routes' | 'audit' | null>(null)
  const closePanel = useCallback(() => setPanel(null), [])
  const todayRoutesCount = day && routes.data ? namedRoutesOfDay(routes.data, day).length : 0
  const decisionsCount = audit.data?.records.length ?? 0
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
    <main className="page page--wide">
      <header className="planning-page__head">
        <div>
          <h1>Urgencias</h1>
          <p className="text-muted">
            Pedidos de hoy por despachar; nada cambia hasta que confirmas una decisión.
          </p>
        </div>
        <div className="planning-page__side">
          <ConnectionStatus
            status={realtime.status}
            updatedAt={board.data?.loadedAt}
            deniedCount={realtime.deniedCount}
            onReconnect={realtime.reconnect}
          />
          <div className="planning-page__actions">
            <button
              type="button"
              className="orders-admin__list-button"
              aria-haspopup="dialog"
              aria-label="Ver decisiones registradas"
              title="Decisiones registradas hoy"
              onClick={() => setPanel('audit')}
            >
              <svg {...ICON}>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              <span className="orders-admin__list-label">Decisiones</span>
              {decisionsCount > 0 && (
                <span className="orders-admin__list-count" aria-hidden="true">
                  {decisionsCount}
                </span>
              )}
            </button>
            <button
              type="button"
              className="orders-admin__list-button"
              aria-haspopup="dialog"
              aria-label="Ver rutas de hoy"
              title="Rutas de hoy"
              onClick={() => setPanel('routes')}
            >
              <svg {...ICON}>
                <path d="M6 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8 18h5a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h5" />
              </svg>
              <span className="orders-admin__list-label">Rutas de hoy</span>
              {todayRoutesCount > 0 && (
                <span className="orders-admin__list-count" aria-hidden="true">
                  {todayRoutesCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <div className="page-stack">
        <section className="card" aria-labelledby="urgencies-title">
          <div className="planning-routes__header">
            <h2 id="urgencies-title">Bandeja de urgencias</h2>
          </div>
          <AsyncContent {...board} onRetry={reloadBoard} loadingText="Cargando urgencias...">
            {({ urgencies, alreadyRouted, failedDeliveries, orders }) => (
              <>
                {(failedDeliveries > 0 || alreadyRouted > 0) && (
                  <div className="urgency-infos">
                    {failedDeliveries > 0 && (
                      <p className="notice urgency-info urgency-info--alert" role="note">
                        <svg {...ICON} width={16} height={16} className="urgency-info__icon">
                          <path d="M12 3 2 20h20L12 3ZM12 10v4M12 17.5v.01" />
                        </svg>
                        {failedDeliveries === 1
                          ? 'Hay 1 pedido con una entrega fallida esperando revisión.'
                          : `Hay ${failedDeliveries} pedidos con una entrega fallida esperando revisión.`}{' '}
                        Se gestionan en <Link to={paths.failedDeliveries}>Entregas fallidas</Link>,
                        no aquí.
                      </p>
                    )}
                    {alreadyRouted > 0 && (
                      <p className="urgency-info">
                        <svg {...ICON} width={16} height={16} className="urgency-info__icon">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 11v5M12 7.5v.01" />
                        </svg>
                        {alreadyRouted === 1
                          ? '1 pedido de hoy ya está en una ruta: se ve en "Rutas de hoy".'
                          : `${alreadyRouted} pedidos de hoy ya están en una ruta: se ven en "Rutas de hoy".`}
                      </p>
                    )}
                  </div>
                )}
                {urgencies.length === 0 ? (
                  <div className="urgency-empty">
                    <span className="planning-empty__icon" aria-hidden="true">
                      <svg {...ICON} width={26} height={26}>
                        <path d="m5 12 5 5 9-10" />
                      </svg>
                    </span>
                    <h3>Todo al día</h3>
                    <p className="empty-state">No hay pedidos urgentes por despachar hoy.</p>
                  </div>
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
      </div>

      <Drawer
        open={panel === 'routes'}
        onClose={closePanel}
        title="Rutas de hoy"
        titleId="today-routes-title"
        className="drawer__panel--narrow drawer__panel--routes"
      >
        <p className="text-muted">
          Antes de iniciar se pueden corregir sus paradas o cambiar el chofer. Las rutas en curso o
          completadas no se modifican.
        </p>
        {day && (
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
        )}
      </Drawer>

      <Drawer
        open={panel === 'audit'}
        onClose={closePanel}
        title="Decisiones registradas hoy"
        titleId="audit-title"
        className="drawer__panel--narrow"
      >
        <AsyncContent {...audit} onRetry={reloadAudit} loadingText="Cargando decisiones...">
          {({ records }) => (
            <DispatchAuditList
              records={records}
              currentUserId={user?.id}
              describeResource={describeResource}
            />
          )}
        </AsyncContent>
      </Drawer>
    </main>
  )
}
