import { useState } from 'react'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { StepNav } from '../../components/ui/StepNav'
import { useFetch } from '../../hooks/useFetch'
import { useRealtimeUpdates } from '../../hooks/useRealtimeUpdates'
import { ConnectionStatus } from './ConnectionStatus'
import { boardSubscriptions, loadMonitorBoard } from './monitorBoard'
import { MonitorRouteCard } from './MonitorRouteCard'

/**
 * Seguimiento en tiempo real de las rutas de hoy. La pantalla siempre muestra lo que devuelve el
 * servidor: los eventos en tiempo real solo avisan que hay que volver a consultarlo.
 */
/** Rutas por pantalla: de dos en dos, para no saturar la página. */
const ROUTES_PER_PAGE = 2

type BoardData = NonNullable<
  ReturnType<typeof useFetch<Awaited<ReturnType<typeof loadMonitorBoard>>>>['data']
>

/** Dos rutas a la vez, con «Rutas 1–2 de 5» y las flechas cuando hay más. */
function RoutesPage({
  routes,
  drivers,
  page,
  onPageChange,
  onChanged,
}: Pick<BoardData, 'routes' | 'drivers'> & {
  page: number
  onPageChange: (page: number) => void
  onChanged: () => void
}) {
  // Si desaparecen rutas (por ejemplo, al terminar el día), la página se ajusta a la última que exista.
  const current = Math.min(page, Math.ceil(routes.length / ROUTES_PER_PAGE) - 1)
  const visible = routes.slice(current * ROUTES_PER_PAGE, (current + 1) * ROUTES_PER_PAGE)

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
            route={route}
            name={name}
            driver={route.driverId ? drivers[route.driverId] : undefined}
            onChanged={onChanged}
          />
        ))}
      </div>
    </div>
  )
}

export function MonitorPage() {
  const board = useFetch(loadMonitorBoard, 'No se pudo cargar el seguimiento de rutas')
  const [page, setPage] = useState(0)
  const realtime = useRealtimeUpdates({
    subscriptions: boardSubscriptions(board.data),
    onInvalidate: board.reload,
  })

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
          {({ routes, drafts, drivers }) => (
            <>
              {drafts > 0 && (
                <p className="text-muted">
                  {drafts === 1
                    ? 'Hay 1 ruta de hoy en borrador, sin chofer: se gestiona en Planificación.'
                    : `Hay ${drafts} rutas de hoy en borrador, sin chofer: se gestionan en Planificación.`}
                </p>
              )}
              {routes.length === 0 ? (
                <section className="card">
                  <p className="empty-state">Hoy no hay rutas con chofer para seguir.</p>
                </section>
              ) : (
                <RoutesPage
                  routes={routes}
                  drivers={drivers}
                  page={page}
                  onPageChange={setPage}
                  onChanged={board.reload}
                />
              )}
            </>
          )}
        </AsyncContent>
      </div>
    </main>
  )
}
