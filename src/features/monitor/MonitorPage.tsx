import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { paths } from '../../app/paths'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { Button } from '../../components/ui/Button'
import { Notice } from '../../components/ui/Notice'
import { StepNav } from '../../components/ui/StepNav'
import { useFetch } from '../../hooks/useFetch'
import { useRealtimeUpdates } from '../../hooks/useRealtimeUpdates'
import { ConnectionStatus } from './ConnectionStatus'
import {
  boardSubscriptions,
  loadMonitorBoard,
  pageOfRoute,
  type MonitorBoard,
} from './monitorBoard'
import { MonitorRouteCard } from './MonitorRouteCard'

/** Rutas por pantalla: hasta cuatro en rejilla responsiva (2×2 en escritorio), sin saturar. */
const ROUTES_PER_PAGE = 4

/** Hasta cuatro rutas a la vez, con «Rutas 1–4 de N» y las flechas cuando hay más. */
function RoutesPage({
  routes,
  drivers,
  links,
  page,
  onPageChange,
  onChanged,
  targetRouteId,
}: Pick<MonitorBoard, 'routes' | 'drivers' | 'links'> & {
  page: number
  onPageChange: (page: number) => void
  onChanged: () => void
  targetRouteId: string | null
}) {
  // Si desaparecen rutas (por ejemplo, al terminar el día), la página se ajusta a la última que exista.
  const current = Math.min(page, Math.ceil(routes.length / ROUTES_PER_PAGE) - 1)
  const visible = routes.slice(current * ROUTES_PER_PAGE, (current + 1) * ROUTES_PER_PAGE)
  const targetRef = useRef<HTMLElement>(null)
  const focusedFor = useRef<string | null>(null)

  // La ruta enlazada se muestra y recibe el foco una vez; las recargas en vivo no lo vuelven a mover.
  useEffect(() => {
    if (!targetRouteId || focusedFor.current === targetRouteId || !targetRef.current) return
    focusedFor.current = targetRouteId
    targetRef.current.scrollIntoView?.({ block: 'start' })
    targetRef.current.focus({ preventScroll: true })
  })

  return (
    <div className="monitor-pager">
      <StepNav
        noun="Rutas"
        singular="Ruta"
        label="Rutas de hoy"
        position={current}
        total={routes.length}
        pageSize={ROUTES_PER_PAGE}
        onChange={onPageChange}
      />
      <div className="monitor-routes">
        {visible.map(({ route, name }) => (
          <MonitorRouteCard
            key={route.id}
            ref={route.id === targetRouteId ? targetRef : undefined}
            route={route}
            name={name}
            driver={route.driverId ? drivers[route.driverId] : undefined}
            links={links}
            highlighted={route.id === targetRouteId}
            onChanged={onChanged}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Seguimiento en tiempo real de las rutas de hoy. La pantalla siempre muestra lo que devuelve el
 * servidor: los eventos en tiempo real solo avisan que hay que volver a consultarlo. Con `?ruta=`
 * (desde Entregas fallidas, Emergencias o un pedido) abre la página donde está esa ruta.
 */
export function MonitorPage() {
  const board = useFetch(loadMonitorBoard, 'No se pudo cargar el seguimiento de rutas')
  const [page, setPage] = useState(0)
  const [searchParams, setSearchParams] = useSearchParams()
  const targetRouteId = searchParams.get('ruta')
  const realtime = useRealtimeUpdates({
    subscriptions: boardSubscriptions(board.data),
    onInvalidate: board.reload,
  })

  /** Quita la selección que vino por enlace (el usuario pasó a navegar por su cuenta). */
  const clearTarget = () =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('ruta')
        return next
      },
      { replace: true },
    )

  return (
    <main className="page page--wide">
      <header className="planning-page__head">
        <div>
          <h1>Seguimiento de rutas</h1>
          <p className="text-muted">
            Entregas de las rutas de hoy, en vivo según lo que registra el chofer.
          </p>
        </div>
        <ConnectionStatus
          status={realtime.status}
          updatedAt={board.data?.loadedAt}
          deniedCount={realtime.deniedCount}
          onReconnect={realtime.reconnect}
        />
      </header>

      <div className="page-stack">
        <AsyncContent {...board} onRetry={board.reload} loadingText="Cargando rutas de hoy...">
          {({ overdueOpen, routes, cancelled, drafts, drivers, links }) => {
            // La página sale del id de la ruta (no de una posición guardada): sigue siendo la
            // correcta aunque las rutas se recarguen o cambien de orden.
            const targetInOverdue =
              targetRouteId !== null && overdueOpen.some(({ route }) => route.id === targetRouteId)
            const targetPage =
              targetRouteId && !targetInOverdue
                ? pageOfRoute(routes, targetRouteId, ROUTES_PER_PAGE)
                : null
            const missingTarget =
              targetRouteId !== null && !targetInOverdue && targetPage === null
            const cancelledTarget = missingTarget
              ? cancelled.find((route) => route.id === targetRouteId)
              : undefined
            return (
              <>
                {overdueOpen.length > 0 && (
                  <section
                    className="monitor-overdue"
                    aria-labelledby="monitor-overdue-title"
                  >
                    <header className="monitor-overdue__head">
                      <div>
                        <h2 id="monitor-overdue-title">
                          Rutas abiertas de días anteriores ({overdueOpen.length})
                        </h2>
                        <p className="text-muted">
                          Siguen reteniendo repartidores o pedidos. Cancela las no iniciadas o
                          declara emergencia en las iniciadas para confirmar custodia y liberarlas.
                        </p>
                      </div>
                    </header>
                    <div className="monitor-routes">
                      {overdueOpen.map(({ route, name, routeDay }) => (
                        <MonitorRouteCard
                          key={route.id}
                          route={route}
                          name={name}
                          overdueDate={routeDay}
                          driver={route.driverId ? drivers[route.driverId] : undefined}
                          links={links}
                          highlighted={route.id === targetRouteId}
                          onChanged={board.reload}
                        />
                      ))}
                    </div>
                  </section>
                )}
                {missingTarget && (
                  <Notice tone="warning">
                    {cancelledTarget
                      ? `Esa ruta se canceló antes de salir${cancelledTarget.cancelReason ? ` (motivo: ${cancelledTarget.cancelReason})` : ''}: ya no se sigue y sus pedidos volvieron a Planificación.`
                      : 'La ruta enlazada ya no está en el seguimiento de hoy: puede ser de otro día, seguir en borrador o haberse eliminado.'}{' '}
                    <Link to={paths.planning}>Revisar en Planificación</Link>{' '}
                    <Button variant="secondary" onClick={clearTarget}>
                      Ver todas las rutas
                    </Button>
                  </Notice>
                )}
                {cancelled.length > 0 && (
                  <Notice>
                    {cancelled.length === 1
                      ? 'Hoy se canceló 1 ruta antes de salir: sus pedidos volvieron a Planificación.'
                      : `Hoy se cancelaron ${cancelled.length} rutas antes de salir: sus pedidos volvieron a Planificación.`}
                  </Notice>
                )}
                {drafts > 0 && (
                  <Notice>
                    {drafts === 1
                      ? 'Hay 1 ruta de hoy en borrador, sin chofer: se gestiona en Planificación.'
                      : `Hay ${drafts} rutas de hoy en borrador, sin chofer: se gestionan en Planificación.`}
                  </Notice>
                )}
                {routes.length === 0 ? (
                  <section className="card">
                    <p className="empty-state">Hoy no hay rutas con chofer para seguir.</p>
                  </section>
                ) : (
                  <RoutesPage
                    routes={routes}
                    drivers={drivers}
                    links={links}
                    page={targetPage ?? page}
                    targetRouteId={targetPage === null ? null : targetRouteId}
                    onPageChange={(next) => {
                      if (targetRouteId) clearTarget()
                      setPage(next)
                    }}
                    onChanged={board.reload}
                  />
                )}
              </>
            )
          }}
        </AsyncContent>
      </div>
    </main>
  )
}
