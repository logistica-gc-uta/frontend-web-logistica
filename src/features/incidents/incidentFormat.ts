import { formatDateTime } from '../../lib/format/formatDateTime'
import { formatTime } from '../../lib/format/formatTime'
import type { DeliveryAgreement } from '../dispatch/types'
import { describeFailureReason } from '../monitor/monitorLabels'
import type { MonitorRoute, MonitorStop } from '../monitor/types'

export const routeName = (route: MonitorRoute): string =>
  `Ruta ${route.zoneCode} · ${formatDateTime(route.date)}`

/** Resultado de una visita tal como lo guardó el backend (sin inventar éxito ni fallo). */
export function visitResult(stop: MonitorStop): string {
  if (stop.outcome === 'SUCCESSFUL') return 'Entregado'
  if (stop.outcome === 'FAILED')
    return `Visita fallida: ${describeFailureReason(stop.failureReason)}`
  if (stop.outcome === 'PENDING') return 'Pendiente'
  return 'Sin resultado registrado'
}

/** "dd/mm/aaaa hh:mm a hh:mm" en hora de Guayaquil. */
export const describeWindow = ({ deliveryWindowStart, deliveryWindowEnd }: DeliveryAgreement) =>
  `${formatDateTime(deliveryWindowStart)} a ${formatTime(deliveryWindowEnd).slice(0, 5)}`
