import { AsyncContent } from '../../components/ui/AsyncContent'
import { useFetch } from '../../hooks/useFetch'
import { useRealtimeUpdates } from '../../hooks/useRealtimeUpdates'
import { ConnectionStatus } from './ConnectionStatus'
import { boardSubscriptions, loadMonitorBoard } from './monitorBoard'
import { MonitorRouteCard } from './MonitorRouteCard'

/**
 * Seguimiento en tiempo real de las rutas de hoy. La pantalla siempre muestra lo que devuelve el
 * servidor: los eventos en tiempo real solo avisan que hay que volver a consultarlo.
 */
export function MonitorPage() {
  const board = useFetch(loadMonitorBoard, 'No se pudo cargar el seguimiento de rutas')
  const realtime = useRealtimeUpdates({
    subscriptions: boardSubscriptions(board.data),
    onInvalidate: board.reload,
  })

  return (
    <main className="page">
      <h1>Seguimiento de rutas</h1>
      <p className="text-muted">
        Entregas y visitas de las rutas de hoy, actualizadas en vivo cuando el chofer registra un
        avance en la app. No incluye ubicación GPS ni tiempos estimados de llegada.
      </p>

      <div className="page-stack">
        <ConnectionStatus
          status={realtime.status}
          updatedAt={board.data?.loadedAt}
          deniedCount={realtime.deniedCount}
          onReconnect={realtime.reconnect}
        />

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
                <div className="monitor-routes">
                  {routes.map(({ route, name }) => (
                    <MonitorRouteCard
                      key={route.id}
                      route={route}
                      name={name}
                      driver={route.driverId ? drivers[route.driverId] : undefined}
                      onChanged={board.reload}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </AsyncContent>
      </div>
    </main>
  )
}
