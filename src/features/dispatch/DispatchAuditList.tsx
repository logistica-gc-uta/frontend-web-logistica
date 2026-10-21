import { formatDateTime } from '../../lib/format/formatDateTime'
import { DISPATCH_ACTION_LABELS, DISPATCH_OUTCOME_LABELS } from './dispatchLabels'
import type { DispatchAudit } from './types'

interface DispatchAuditListProps {
  /** Decisiones del día (ya filtradas). */
  records: DispatchAudit[]
  /** Usuario actual, para indicar qué decisiones tomó. */
  currentUserId: string | undefined
  /** Cómo nombrar un pedido o una ruta (por ejemplo, con su dirección). */
  describeResource: (record: DispatchAudit) => string
}

/** Decisiones registradas en el día: qué se hizo, quién, cuándo, con qué motivo y su resultado. */
export function DispatchAuditList({
  records,
  currentUserId,
  describeResource,
}: DispatchAuditListProps) {
  const ofDay = [...records].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))

  if (ofDay.length === 0) {
    return <p className="empty-state">Todavía no hay decisiones registradas hoy.</p>
  }

  return (
    <ul className="dispatch-audit">
      {ofDay.map((record) => (
        <li key={record.id} className="dispatch-audit__item">
          <div className="dispatch-audit__header">
            <strong>{DISPATCH_ACTION_LABELS[record.action] ?? record.action}</strong>
            <span
              className={`badge${record.outcome === 'FAILED' ? ' badge--danger' : ' badge--success'}`}
            >
              {DISPATCH_OUTCOME_LABELS[record.outcome] ?? record.outcome}
            </span>
          </div>
          <p>{describeResource(record)}</p>
          <p className="text-muted">
            {formatDateTime(record.recordedAt)} ·{' '}
            {record.actorId === currentUserId ? 'Tú' : 'Otro administrador'} · Motivo:{' '}
            {record.reason}
          </p>
        </li>
      ))}
    </ul>
  )
}
