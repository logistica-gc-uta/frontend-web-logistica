import { areaLabel } from '../../lib/planning/routeArea'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { formatDateTime } from '../../lib/format/formatDateTime'
import { formatDuration, formatKm, formatPercent } from '../../lib/format/formatDistance'
import type { DistanceMethod, RouteProposal } from './types'
import type { ConfirmationState } from './useRouteConfirmations'

interface ProposalCardProps {
  proposal: RouteProposal
  label: string
  color: string
  /** Máximo de paradas por ruta, para mostrar N/capacidad. */
  capacity: number
  /** Con red vial se muestran duración, tramos y el contraste con la línea recta. */
  method: DistanceMethod
  isSelected: boolean
  confirmation: ConfirmationState | undefined
  /** `false` fuera del día de entrega: la propuesta solo se puede ver (backend #49). */
  canConfirm?: boolean
  onSelect: () => void
  onConfirm: () => void
}

/** Entregas de la ruta: una hora o el rango entre la primera y la última. */
function formatSchedule(instants: string[]): string {
  const first = formatDateTime(instants[0])
  const last = formatDateTime(instants[instants.length - 1])
  return first === last ? first : `${first} – ${last}`
}

/** Un tramo por calles: "1,48 km, ≈ 4 min" (la duración solo si el backend la envía). */
const formatLeg = (km: number, seconds?: number) =>
  seconds === undefined ? formatKm(km) : `${formatKm(km)}, ${formatDuration(seconds)}`

export function ProposalCard({
  proposal,
  label,
  color,
  capacity,
  method,
  isSelected,
  confirmation,
  canConfirm = true,
  onSelect,
  onConfirm,
}: ProposalCardProps) {
  const isRoad = method === 'OSRM_ROAD_NETWORK'
  const isSaving = confirmation?.status === 'saving'
  const isSaved = confirmation?.status === 'saved'

  return (
    <article className={`proposal${isSelected ? ' proposal--selected' : ''}`} aria-label={label}>
      <header className="proposal__header">
        <span className="proposal__swatch" style={{ background: color }} aria-hidden="true" />
        <h3>
          {label} · {areaLabel(proposal.zoneCode)}
        </h3>
        <span className="badge">
          {proposal.stops.length}/{capacity} paradas
        </span>
      </header>

      <dl className="proposal__metrics">
        <div>
          <dt>{isRoad ? 'Distancia por calles' : 'Distancia en línea recta'}</dt>
          <dd>{formatKm(proposal.totalDistanceKm)}</dd>
        </div>
        {isRoad && proposal.straightLineKm !== undefined && (
          <div>
            <dt>En línea recta</dt>
            <dd>{formatKm(proposal.straightLineKm)}</dd>
          </div>
        )}
        {isRoad && proposal.totalDurationSeconds !== undefined && (
          <div>
            <dt>Duración estimada</dt>
            <dd>{formatDuration(proposal.totalDurationSeconds)}</dd>
          </div>
        )}
        <div>
          <dt>Sin optimizar</dt>
          <dd>{formatKm(proposal.baselineKm)}</dd>
        </div>
        <div>
          <dt>Ahorro estimado</dt>
          <dd>
            {formatKm(proposal.savingsKm)} ({formatPercent(proposal.savingsPercent)})
          </dd>
        </div>
        <div>
          <dt>Entrega</dt>
          <dd>{formatSchedule(proposal.scheduledInstants)}</dd>
        </div>
      </dl>

      <ol className="proposal__stops" aria-label={`Paradas de la ${label.toLowerCase()}`}>
        {proposal.stops.map((stop) => (
          <li key={stop.orderId}>
            {stop.deliveryAddress}
            <small> · {formatDateTime(stop.scheduledDeliveryDate)}</small>
            {isRoad && stop.legDistanceKm !== undefined && (
              <small className="proposal__leg">
                {' '}
                · {formatLeg(stop.legDistanceKm, stop.legDurationSeconds)} desde{' '}
                {stop.sequence === 1 ? 'el depósito' : 'la parada anterior'}
              </small>
            )}
          </li>
        ))}
      </ol>
      {isRoad && proposal.returnLegDistanceKm !== undefined && (
        <p className="proposal__return">
          Regreso al depósito:{' '}
          {formatLeg(proposal.returnLegDistanceKm, proposal.returnLegDurationSeconds)}
        </p>
      )}

      <div className="proposal__actions">
        <Button variant="secondary" aria-pressed={isSelected} onClick={onSelect}>
          {isSelected ? 'Quitar resaltado' : 'Resaltar en el mapa'}
        </Button>
        {isSaved ? (
          <span role="status" className="badge badge--success">
            Guardada como borrador (DRAFT)
          </span>
        ) : !canConfirm ? (
          <span className="badge">Solo vista previa</span>
        ) : (
          <Button isLoading={isSaving} loadingText="Guardando..." onClick={onConfirm}>
            Confirmar ruta
          </Button>
        )}
      </div>

      {confirmation?.status === 'failed' && <Alert>{confirmation.error}</Alert>}
    </article>
  )
}
