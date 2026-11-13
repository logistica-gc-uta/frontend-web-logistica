import '../../styles/emergencies.css'
import { Link } from 'react-router'
import { paths } from '../../app/paths'
import { formatDateTime } from '../../lib/format/formatDateTime'
import { DeclareEmergency } from '../emergencies/DeclareEmergency'
import type { Driver } from '../planning/types'
import {
  describeFailureReason,
  DRIVER_STATE_LABELS,
  MONITOR_ROUTE_STATUS_LABELS,
} from './monitorLabels'
import { driverState, routeProgress } from './routeProgress'
import type { MonitorRoute, MonitorStop } from './types'

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

function stopResult(stop: MonitorStop): string {
  if (stop.outcome === 'SUCCESSFUL') return 'Entregado'
  if (stop.outcome === 'FAILED')
    return `Visita fallida: ${describeFailureReason(stop.failureReason)}`
  if (stop.outcome === 'PENDING') return 'Pendiente'
  return 'Sin resultado registrado'
}

interface MonitorRouteCardProps {
  route: MonitorRoute
  /** Nombre visible de la ruta (único en el día). */
  name: string
  driver: Driver | undefined
  /** Vuelve a consultar el tablero tras declarar una emergencia (#51). */
  onChanged?: () => void
}

/**
 * Seguimiento de una ruta: estado de la ruta, entregas exitosas, visitas resueltas e incidencias,
 * y estado del chofer, por separado. Todo sale de lo que guardó el backend.
 */
export function MonitorRouteCard({ route, name, driver, onChanged }: MonitorRouteCardProps) {
  const progress = routeProgress(route)
  const state = driverState(route, driver)

  return (
    <article className="card monitor-route" aria-label={name}>
      <header className="monitor-route__header">
        <h3>{name}</h3>
        <span className={`badge${route.status === 'COMPLETED' ? ' badge--success' : ''}`}>
          {MONITOR_ROUTE_STATUS_LABELS[route.status] ?? route.status}
        </span>
      </header>

      {route.status === 'INTERRUPTED' && (
        <p className="notice" role="note">
          <strong>Ruta interrumpida por una emergencia.</strong> Lo entregado se conserva; los
          pendientes se gestionan en <Link to={paths.emergencies}>Emergencias</Link>.
        </p>
      )}

      <div className="monitor-route__progress">
        <p>
          <strong>
            {progress.delivered} de {progress.total} entregados ({progress.deliveredPercent} %)
          </strong>
        </p>
        <progress
          max={progress.total || 1}
          value={progress.delivered}
          aria-label={`Entregas exitosas de ${name}`}
        />
        <p className="text-muted">
          Visitas resueltas: {progress.resolved} de {progress.total}
          {progress.failed > 0 &&
            ` · ${progress.failed === 1 ? '1 fallida' : `${progress.failed} fallidas`}`}
        </p>
      </div>

      <ol className="monitor-route__stops">
        {route.stops.map((stop) => (
          <li
            key={stop.id}
            className={`monitor-stop monitor-stop--${(stop.outcome ?? 'unknown').toLowerCase()}`}
          >
            <span>{stop.deliveryAddress}</span>
            <span className="monitor-stop__result">{capitalize(stopResult(stop))}</span>
          </li>
        ))}
      </ol>

      <dl className="monitor-route__meta">
        <div>
          <dt>Chofer</dt>
          <dd>{route.driverName ?? 'Sin chofer'}</dd>
        </div>
        {state && (
          <div>
            <dt>Estado del chofer</dt>
            <dd>{DRIVER_STATE_LABELS[state]}</dd>
          </div>
        )}
        {route.startedAt && (
          <div>
            <dt>Inicio</dt>
            <dd>{formatDateTime(route.startedAt)}</dd>
          </div>
        )}
        {route.completedAt && (
          <div>
            <dt>Fin de visitas</dt>
            <dd>{formatDateTime(route.completedAt)}</dd>
          </div>
        )}
        {route.returnedAt && (
          <div>
            <dt>Regreso al depósito</dt>
            <dd>{formatDateTime(route.returnedAt)}</dd>
          </div>
        )}
      </dl>

      {route.status === 'IN_PROGRESS' && onChanged && (
        <DeclareEmergency routeId={route.id} name={name} onDeclared={onChanged} />
      )}
    </article>
  )
}
