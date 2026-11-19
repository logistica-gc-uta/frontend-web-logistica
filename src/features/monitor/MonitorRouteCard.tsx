import '../../styles/emergencies.css'
import { useState } from 'react'
import { Link } from 'react-router'
import { paths } from '../../app/paths'
import { formatDateTime } from '../../lib/format/formatDateTime'
import { DeclareEmergency } from '../emergencies/DeclareEmergency'
import type { Driver } from '../planning/types'
import { describeFailureReason, DRIVER_STATE_LABELS, routeStatusShort } from './monitorLabels'
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
  const [declaring, setDeclaring] = useState(false)
  const canDeclare = route.status === 'IN_PROGRESS' && Boolean(onChanged)

  return (
    <article className="card monitor-route" aria-label={name}>
      <header className="monitor-route__header">
        <h3>{name}</h3>
        <div className="monitor-route__tags">
          <span className={`badge${route.status === 'COMPLETED' ? ' badge--success' : ''}`}>
            {routeStatusShort(route.status)}
          </span>
          {canDeclare && (
            <button
              type="button"
              className="monitor-route__emergency"
              aria-label="Declarar emergencia"
              aria-expanded={declaring}
              title="Declarar emergencia"
              onClick={() => setDeclaring((current) => !current)}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 3 2 20h20L12 3ZM12 10v4M12 17.5v.01" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {route.status === 'INTERRUPTED' && (
        <p className="monitor-route__alert" role="note">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3 2 20h20L12 3ZM12 10v4M12 17.5v.01" />
          </svg>
          <strong>Ruta interrumpida por una emergencia.</strong>
          <span>
            Se gestiona en <Link to={paths.emergencies}>Emergencias</Link>
          </span>
        </p>
      )}

      <div className="monitor-route__progress">
        {/* Un punto por parada: se completa (verde) al entregarse; una visita fallida se marca en rojo. */}
        <div
          className="monitor-dots"
          role="progressbar"
          aria-label={`Entregas exitosas de ${name}`}
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.delivered}
        >
          {route.stops.map((stop, index) => (
            <span
              key={stop.id}
              className={`monitor-dot monitor-dot--${(stop.outcome ?? 'unknown').toLowerCase()}`}
            >
              {index + 1}
            </span>
          ))}
        </div>
        <div className="monitor-route__counts">
          <p>
            <strong>
              {progress.delivered} de {progress.total} entregados
            </strong>
          </p>
        </div>
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

      {canDeclare && onChanged && (
        <DeclareEmergency
          routeId={route.id}
          name={name}
          open={declaring}
          onClose={() => setDeclaring(false)}
          onDeclared={onChanged}
        />
      )}
    </article>
  )
}
