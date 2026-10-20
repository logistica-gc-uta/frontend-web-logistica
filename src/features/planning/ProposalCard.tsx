import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { formatDateTime } from '../../lib/format/formatDateTime'
import { formatKm, formatPercent } from '../../lib/format/formatDistance'
import type { RouteProposal } from './types'
import type { ConfirmationState } from './useRouteConfirmations'

interface ProposalCardProps {
  proposal: RouteProposal
  label: string
  color: string
  /** Máximo de paradas por ruta, para mostrar N/capacidad. */
  capacity: number
  isSelected: boolean
  confirmation: ConfirmationState | undefined
  onSelect: () => void
  onConfirm: () => void
}

/** Entregas de la ruta: una hora o el rango entre la primera y la última. */
function formatSchedule(instants: string[]): string {
  const first = formatDateTime(instants[0])
  const last = formatDateTime(instants[instants.length - 1])
  return first === last ? first : `${first} – ${last}`
}

export function ProposalCard({
  proposal,
  label,
  color,
  capacity,
  isSelected,
  confirmation,
  onSelect,
  onConfirm,
}: ProposalCardProps) {
  const isSaving = confirmation?.status === 'saving'
  const isSaved = confirmation?.status === 'saved'

  return (
    <article className={`proposal${isSelected ? ' proposal--selected' : ''}`} aria-label={label}>
      <header className="proposal__header">
        <span className="proposal__swatch" style={{ background: color }} aria-hidden="true" />
        <h3>
          {label} · {proposal.zoneCode}
        </h3>
        <span className="badge">
          {proposal.stops.length}/{capacity} paradas
        </span>
      </header>

      <dl className="proposal__metrics">
        <div>
          <dt>Distancia propuesta</dt>
          <dd>{formatKm(proposal.totalDistanceKm)}</dd>
        </div>
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
          </li>
        ))}
      </ol>

      <div className="proposal__actions">
        <Button variant="secondary" aria-pressed={isSelected} onClick={onSelect}>
          {isSelected ? 'Quitar resaltado' : 'Resaltar en el mapa'}
        </Button>
        {isSaved ? (
          <span role="status" className="badge badge--success">
            Guardada como borrador (DRAFT)
          </span>
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
