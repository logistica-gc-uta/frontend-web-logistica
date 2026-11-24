import '../../styles/emergencies.css'
import { forwardRef, useState } from 'react'
import { Link } from 'react-router'
import { emergencyRoutePath, failedDeliveryPath, orderReceiptPath, paths } from '../../app/paths'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { formatDateTime } from '../../lib/format/formatDateTime'
import { describeDispatchError } from '../dispatch/dispatchError'
import { dispatchService } from '../dispatch/dispatchService'
import { DeclareEmergency } from '../emergencies/DeclareEmergency'
import type { Driver } from '../planning/types'
import type { MonitorLinks } from './monitorBoard'
import { describeFailureReason, DRIVER_STATE_LABELS, routeStatusShort } from './monitorLabels'
import { driverState, routeProgress } from './routeProgress'
import type { MonitorRoute, MonitorStop } from './types'

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

const STATUS_BADGE_CLASS: Record<string, string> = {
  COMPLETED: 'badge badge--success',
  IN_PROGRESS: 'badge badge--accent',
  INTERRUPTED: 'badge badge--danger',
  ASSIGNED: 'badge badge--sand',
}

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
  /** Vuelve a consultar el tablero tras declarar una emergencia o cancelar una ruta. */
  onChanged?: () => void
  /** Enlaces a Entregas fallidas y Emergencias por id estable (#67); `null` si no se pudieron consultar. */
  links?: MonitorLinks | null
  /** La ruta llegó seleccionada desde otra pantalla (`?ruta=`). */
  highlighted?: boolean
  /** Fecha (aaaa-mm-dd) si la ruta quedó abierta desde un día anterior. */
  overdueDate?: string
}

/**
 * Seguimiento de una ruta: estado de la ruta, progreso por parada, incidencias y metadatos
 * operativos. Todo proviene del estado confirmado por el backend.
 */
export const MonitorRouteCard = forwardRef<HTMLElement, MonitorRouteCardProps>(
  function MonitorRouteCard(
    { route, name, driver, onChanged, links = null, highlighted = false, overdueDate },
    ref,
  ) {
    const progress = routeProgress(route)
    const state = driverState(route, driver)
    const [declaring, setDeclaring] = useState(false)
    const [cancelling, setCancelling] = useState(false)
    const [cancelReason, setCancelReason] = useState('')
    const [cancelError, setCancelError] = useState<string | null>(null)
    const [isCancelling, setIsCancelling] = useState(false)

    const canDeclare = route.status === 'IN_PROGRESS' && Boolean(onChanged)
    const canCancelOverdue =
      Boolean(overdueDate) && route.status === 'ASSIGNED' && Boolean(onChanged)
    const emergencyId = links?.emergencyByRoute.get(route.id)
    const deliveredPercent =
      progress.total > 0 ? Math.round((progress.delivered / progress.total) * 100) : 0
    const failedCount = route.stops.filter((stop) => stop.outcome === 'FAILED').length

    const handleCancelRoute = async () => {
      if (isCancelling || !onChanged) return
      const trimmed = cancelReason.trim()
      if (!trimmed) {
        setCancelError('Escribe el motivo para cancelar la ruta')
        return
      }
      setCancelError(null)
      setIsCancelling(true)
      try {
        await dispatchService.cancelRoute(route.id, trimmed)
        setCancelling(false)
        setCancelReason('')
        onChanged()
      } catch (error) {
        setCancelError(describeDispatchError(error))
      } finally {
        setIsCancelling(false)
      }
    }

    return (
      <article
        ref={ref}
        tabIndex={highlighted ? -1 : undefined}
        className={`card monitor-route${highlighted ? ' monitor-route--highlighted' : ''}${overdueDate ? ' monitor-route--overdue' : ''}`}
        aria-label={name}
        aria-current={highlighted ? 'true' : undefined}
      >
        <header className="monitor-route__header">
          <div className="monitor-route__title">
            <h3>{name}</h3>
            {overdueDate && (
              <span className="badge badge--danger">Sin cerrar desde {overdueDate}</span>
            )}
          </div>
          <div className="monitor-route__tags">
            <span className={STATUS_BADGE_CLASS[route.status] ?? 'badge'}>
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
                <span>Emergencia</span>
              </button>
            )}
            {canCancelOverdue && (
              <button
                type="button"
                className="monitor-route__cancel-btn"
                aria-expanded={cancelling}
                onClick={() => {
                  setCancelling((current) => !current)
                  setCancelError(null)
                }}
              >
                Cancelar ruta
              </button>
            )}
          </div>
        </header>

        {cancelling && canCancelOverdue && (
          <div className="monitor-route__cancel-box">
            <p className="text-muted">
              Esta ruta nunca se inició. Al cancelarla se libera al repartidor y los pedidos vuelven
              a <strong>Pendiente</strong> para reprogramarlos.
            </p>
            <TextField
              label="Motivo de cancelación"
              placeholder="Ej.: Ruta asignada ayer que no salió a reparto"
              value={cancelReason}
              maxLength={500}
              error={cancelError ?? undefined}
              onChange={(event) => {
                setCancelReason(event.target.value)
                setCancelError(null)
              }}
            />
            {cancelError && <Alert>{cancelError}</Alert>}
            <div className="monitor-route__cancel-actions">
              <Button
                isLoading={isCancelling}
                loadingText="Cancelando..."
                onClick={() => void handleCancelRoute()}
              >
                Confirmar cancelación
              </Button>
              <Button
                variant="secondary"
                disabled={isCancelling}
                onClick={() => {
                  setCancelling(false)
                  setCancelError(null)
                }}
              >
                Volver
              </Button>
            </div>
          </div>
        )}

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
              Se gestiona en{' '}
              <Link to={emergencyId ? emergencyRoutePath(route.id) : paths.emergencies}>
                {emergencyId ? 'su emergencia' : 'Emergencias'}
              </Link>
            </span>
          </p>
        )}
        {overdueDate && route.status === 'COMPLETED' && !route.returnedAt && (
          <p className="monitor-route__alert" role="note">
            <strong>Falta confirmar el regreso al depósito.</strong>
            <span>El repartidor sigue retenido hasta registrar su retorno.</span>
          </p>
        )}
        {route.status !== 'INTERRUPTED' && emergencyId && (
          <p className="monitor-route__links">
            <Link to={emergencyRoutePath(route.id)}>Ver la emergencia de esta ruta</Link>
          </p>
        )}

        <div className="monitor-route__progress">
          <div className="monitor-route__counts">
            <p>
              <strong>
                {progress.delivered} de {progress.total} entregados
              </strong>
              {failedCount > 0 && (
                <span className="monitor-route__failed-count">
                  {' '}
                  · {failedCount === 1 ? '1 fallido' : `${failedCount} fallidos`}
                </span>
              )}
            </p>
            <span className="monitor-route__pct">{deliveredPercent}%</span>
          </div>
          <div className="monitor-progress-bar" aria-hidden="true">
            <span
              className="monitor-progress-bar__fill"
              style={{ width: `${deliveredPercent}%` }}
            />
          </div>
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
        </div>

        <ol className="monitor-route__stops">
          {route.stops.map((stop, index) => (
            <li
              key={stop.id}
              className={`monitor-stop monitor-stop--${(stop.outcome ?? 'unknown').toLowerCase()}`}
            >
              <span className="monitor-stop__index" aria-hidden="true">
                {index + 1}
              </span>
              <div className="monitor-stop__body">
                <span className="monitor-stop__address">{stop.deliveryAddress}</span>
                <span className="monitor-stop__links">
                  <Link
                    to={orderReceiptPath(stop.orderId)}
                    aria-label={`Ver pedido de ${stop.deliveryAddress}`}
                  >
                    Pedido
                  </Link>
                  {links?.failedOrderIds.has(stop.orderId) && (
                    <Link
                      to={failedDeliveryPath(stop.orderId)}
                      aria-label={`Gestionar la entrega fallida de ${stop.deliveryAddress}`}
                    >
                      Entrega fallida
                    </Link>
                  )}
                </span>
              </div>
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
  },
)
