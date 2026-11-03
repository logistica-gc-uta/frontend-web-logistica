import { Button } from '../../components/ui/Button'
import type { RealtimeStatus } from '../../hooks/useRealtimeUpdates'
import { formatTime } from '../../lib/format/formatTime'
import { REALTIME_STATUS_LABELS } from './monitorLabels'

interface ConnectionStatusProps {
  status: RealtimeStatus
  /** Instante de la última consulta exitosa al servidor. */
  updatedAt: string | undefined
  /** Suscripciones que el backend rechazó (por permisos). */
  deniedCount: number
  onReconnect: () => void
}

const SEVERITY: Record<RealtimeStatus, string> = {
  connecting: 'connection--waiting',
  live: 'connection--live',
  recovered: 'connection--live',
  lost: 'connection--lost',
  closed: 'connection--lost',
}

/** Estado de la conexión en tiempo real y de la última actualización (con texto, no solo color). */
export function ConnectionStatus({
  status,
  updatedAt,
  deniedCount,
  onReconnect,
}: ConnectionStatusProps) {
  return (
    <div className={`connection ${SEVERITY[status]}`} role="status" aria-live="polite">
      <p>
        <strong>{REALTIME_STATUS_LABELS[status]}</strong>
        {updatedAt && <> · Última actualización: {formatTime(updatedAt)}</>}
      </p>
      {deniedCount > 0 && (
        <p>
          No tienes permiso para seguir{' '}
          {deniedCount === 1 ? '1 recurso' : `${deniedCount} recursos`}; esos datos solo se
          actualizan al recargar.
        </p>
      )}
      {status === 'closed' && (
        <Button variant="secondary" onClick={onReconnect}>
          Reconectar
        </Button>
      )}
    </div>
  )
}
