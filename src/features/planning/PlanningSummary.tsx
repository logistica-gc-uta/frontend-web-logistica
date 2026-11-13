import { formatKm, formatPercent } from '../../lib/format/formatDistance'
import type { DistanceMethod, PlanningSummary as Summary } from './types'

interface StatProps {
  label: string
  value: string | number
}

function Stat({ label, value }: StatProps) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

interface PlanningSummaryProps {
  summary: Summary
  method: DistanceMethod
}

/** Resumen del día: cuántos pedidos se agruparon y cuánto se ahorra frente a no optimizar. */
export function PlanningSummary({ summary, method }: PlanningSummaryProps) {
  const unit = method === 'OSRM_ROAD_NETWORK' ? 'por calles' : 'en línea recta'
  return (
    <dl className="stats" aria-label="Resumen de la propuesta del día">
      <Stat label="Pedidos candidatos" value={summary.candidateOrders} />
      <Stat label="Pedidos planificados" value={summary.plannedOrders} />
      <Stat label="Pedidos excluidos" value={summary.excludedOrders} />
      <Stat label="Rutas propuestas" value={summary.routes} />
      <Stat label={`Km sin optimizar (${unit})`} value={formatKm(summary.baselineKm)} />
      <Stat label={`Km propuestos (${unit})`} value={formatKm(summary.plannedKm)} />
      <Stat
        label="Ahorro estimado"
        value={`${formatKm(summary.savingsKm)} (${formatPercent(summary.savingsPercent)})`}
      />
    </dl>
  )
}
