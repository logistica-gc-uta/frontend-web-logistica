import { Link } from 'react-router'
import { paths } from '../app/paths'
import { AsyncContent } from '../components/ui/AsyncContent'
import {
  formatOperationalDay,
  loadTodayOrders,
  sharePercent,
} from '../features/dashboard/dashboard'
import { useAuth } from '../features/auth/useAuth'
import { dispatchService } from '../features/dispatch/dispatchService'
import { loadMonitorBoard } from '../features/monitor/monitorBoard'
import { routeProgress } from '../features/monitor/routeProgress'
import type { MonitorRouteStatus } from '../features/monitor/types'
import { ORDER_STATUS_LABELS } from '../features/orders/orderLabels'
import { ORDER_STATUSES } from '../features/orders/types'
import { useFetch } from '../hooks/useFetch'
import { todayInGuayaquil } from '../lib/time/guayaquil'

const ROUTE_STATUS: Partial<Record<MonitorRouteStatus, string>> = {
  ASSIGNED: 'Sin iniciar',
  IN_PROGRESS: 'En curso',
  INTERRUPTED: 'Interrumpida',
  COMPLETED: 'Completada',
}

const loadBoard = () => loadMonitorBoard()

/** Pedidos de hoy en una barra repartida por estado, con la cifra de cada tramo debajo. */
function TodayOrders() {
  const orders = useFetch(loadTodayOrders, 'No se pudieron cargar los pedidos de hoy')

  return (
    <section className="card dash-orders" aria-labelledby="dash-orders-title">
      <div className="dash-section__head">
        <h2 id="dash-orders-title">Pedidos para hoy</h2>
        <Link to={paths.orders}>Ver la lista del día</Link>
      </div>
      <AsyncContent {...orders} onRetry={orders.reload} loadingText="Cargando pedidos de hoy...">
        {({ total, byStatus }) => (
          <>
            <p className="dash-orders__total">
              <strong>{total}</strong> {total === 1 ? 'pedido programado' : 'pedidos programados'}
            </p>
            <div className="status-bar" aria-hidden="true">
              {ORDER_STATUSES.map((status) =>
                byStatus[status] > 0 ? (
                  <span
                    key={status}
                    className={`status-bar__segment status--${status.toLowerCase()}`}
                    style={{ width: `${sharePercent(byStatus[status], total)}%` }}
                  />
                ) : null,
              )}
            </div>
            <ul className="status-legend">
              {ORDER_STATUSES.map((status) => (
                <li key={status} className={`status--${status.toLowerCase()}`}>
                  <span className="status-legend__count">{byStatus[status]}</span>
                  <span>{ORDER_STATUS_LABELS[status]}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </AsyncContent>
    </section>
  )
}

/** Urgencias y entregas fallidas que esperan una decisión del ADMIN. */
function PendingDecisions() {
  const inbox = useFetch(dispatchService.inbox, 'No se pudo consultar la bandeja del día')

  return (
    <section className="card dash-pending" aria-labelledby="dash-pending-title">
      <h2 id="dash-pending-title">Por atender</h2>
      <AsyncContent {...inbox} onRetry={inbox.reload} loadingText="Consultando la bandeja...">
        {({ urgencies, failedDeliveries }) => (
          <ul className="dash-pending__list">
            <li className={urgencies.length > 0 ? 'is-alert' : undefined}>
              <span className="dash-pending__count">{urgencies.length}</span>
              <span className="dash-pending__label">
                {urgencies.length === 1
                  ? 'Pedido urgente por despachar'
                  : 'Pedidos urgentes por despachar'}
              </span>
              <Link to={paths.urgencies}>Abrir bandeja</Link>
            </li>
            <li className={failedDeliveries.length > 0 ? 'is-alert' : undefined}>
              <span className="dash-pending__count">{failedDeliveries.length}</span>
              <span className="dash-pending__label">
                {failedDeliveries.length === 1
                  ? 'Entrega no concretada por reprogramar'
                  : 'Entregas no concretadas por reprogramar'}
              </span>
              <Link to={paths.failedDeliveries}>Revisar intentos</Link>
            </li>
          </ul>
        )}
      </AsyncContent>
    </section>
  )
}

/** Rutas de hoy con chofer y cuánto llevan entregado. */
function TodayRoutes() {
  const board = useFetch(loadBoard, 'No se pudieron cargar las rutas de hoy')

  return (
    <section className="card dash-routes" aria-labelledby="dash-routes-title">
      <div className="dash-section__head">
        <h2 id="dash-routes-title">Rutas de hoy</h2>
        <Link to={paths.monitor}>Abrir mapa en vivo</Link>
      </div>
      <AsyncContent {...board} onRetry={board.reload} loadingText="Cargando rutas de hoy...">
        {({ routes, drafts }) =>
          routes.length === 0 ? (
            <div className="dash-empty">
              <p>
                Todavía no hay rutas con chofer para hoy.
                {drafts > 0 && ` Hay ${drafts} en borrador esperando confirmación.`}
              </p>
              <Link to={paths.planning}>Planificar rutas</Link>
            </div>
          ) : (
            <ul className="dash-routes__list">
              {routes.map(({ route, name }) => {
                const progress = routeProgress(route)
                return (
                  <li key={route.id} className="dash-route">
                    <div className="dash-route__head">
                      <span className="dash-route__name">{name}</span>
                      <span className="badge">{ROUTE_STATUS[route.status] ?? route.status}</span>
                    </div>
                    <p className="dash-route__driver">{route.driverName ?? 'Sin chofer'}</p>
                    <div className="route-meter" aria-hidden="true">
                      <span
                        className="route-meter__done"
                        style={{ width: `${sharePercent(progress.delivered, progress.total)}%` }}
                      />
                      <span
                        className="route-meter__failed"
                        style={{ width: `${sharePercent(progress.failed, progress.total)}%` }}
                      />
                    </div>
                    <p className="dash-route__count">
                      {progress.delivered} de {progress.total} entregadas
                      {progress.failed > 0 && `, ${progress.failed} sin concretar`}
                    </p>
                  </li>
                )
              })}
            </ul>
          )
        }
      </AsyncContent>
    </section>
  )
}

/** Inicio del panel: cómo va la operación de hoy y qué necesita una decisión. */
export function HomePage() {
  const { user } = useAuth()

  return (
    <main className="page dashboard">
      <div className="dashboard__head">
        <p className="dashboard__eyebrow">REGALÍA · Logística</p>
        <h1>Sistema de Logística</h1>
        <p className="text-muted">
          Hola, {user?.name}. Esta es la operación del {formatOperationalDay(todayInGuayaquil())}.
        </p>
      </div>
      <TodayOrders />
      <div className="dashboard__grid">
        <PendingDecisions />
        <TodayRoutes />
      </div>
    </main>
  )
}
