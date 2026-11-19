import { useMemo, useState } from 'react'
import { STORE_AREA_LABEL } from '../../lib/planning/routeArea'
import { RoutesMap, type MapRoute } from '../../components/map/RoutesMap'
import { Button } from '../../components/ui/Button'
import { formatDateTime } from '../../lib/format/formatDateTime'
import { DistanceNotice } from './DistanceNotice'
import { PlanningSummary } from './PlanningSummary'
import { ProposalCard } from './ProposalCard'
import { proposalKey, routeColor, routeLabel } from './routeStyle'
import type { Driver, RouteProposalsResponse } from './types'
import { useRouteConfirmations } from './useRouteConfirmations'

const unitsLabel = (count: number) => (count === 1 ? '1 unidad' : `${count} unidades`)

interface PlanningResultProps {
  data: RouteProposalsResponse
  /** Chofer usado en la propuesta; se reenvía al confirmar el borrador sin asignar automáticamente. */
  driverId?: string
  selectedDriver?: Driver
  /** Se llama al guardar una ruta: la página vuelve a leer las rutas guardadas del día. */
  onSaved: () => void
}

/**
 * Resultado de una previsualización: resumen, rutas con su mapa, pedidos excluidos y las rutas ya
 * guardadas del día. Las rutas propuestas son temporales hasta que el operador las confirma.
 */
export function PlanningResult({ data, driverId, selectedDriver, onSaved }: PlanningResultProps) {
  const { states, confirm, confirmAll } = useRouteConfirmations(onSaved, driverId)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const routes = useMemo(
    () =>
      data.proposals.map((proposal, index) => ({
        proposal,
        key: proposalKey(proposal),
        label: routeLabel(index),
        color: routeColor(index),
      })),
    [data.proposals],
  )

  const mapRoutes = useMemo<MapRoute[]>(
    () =>
      routes.map(({ proposal, key, label, color }) => ({
        id: key,
        label,
        color,
        depot: proposal.depot,
        depotLabel: proposal.zoneCode ? `Depósito ${proposal.zoneCode}` : STORE_AREA_LABEL,
        stops: proposal.stops.map((stop) => ({
          sequence: stop.sequence,
          location: stop.location,
          description: `${stop.deliveryAddress} (${formatDateTime(stop.scheduledDeliveryDate)})`,
        })),
        // GeoJSON viene como [lng, lat].
        trace: proposal.geometry?.coordinates.map(([lng, lat]) => ({ lat, lng })),
      })),
    [routes],
  )

  const toggleSelection = (key: string) =>
    setSelectedKey((current) => (current === key ? null : key))

  const isConfirming = Object.values(states).some(({ status }) => status === 'saving')
  const unsavedCount = routes.filter(({ key }) => states[key]?.status !== 'saved').length
  const pendingToConfirm = routes.filter(({ key }) => {
    const status = states[key]?.status
    return status === undefined || status === 'failed'
  })

  return (
    <div className="page-stack">
      <section className="card" aria-labelledby="planning-result-title">
        <div className="planning-result__head">
          <h2 id="planning-result-title">Propuesta para el {data.date}</h2>
          <p className="planning-result__badge" role="status">
            <strong>Vista previa.</strong> Las rutas no se guardan hasta que confirmes.
          </p>
        </div>
        {!data.canConfirm && (
          <p className="notice notice--preview" role="note">
            <strong>Solo vista previa: no es el día de entrega.</strong> Las rutas se confirman el
            mismo día de la entrega (hora de Ecuador).
          </p>
        )}
        <PlanningSummary summary={data.summary} method={data.distanceMethod} />
        <div className="planning-notes">
          {selectedDriver ? (
            <p className="notice">
              <strong>Capacidad aplicada:</strong> {selectedDriver.name} ({selectedDriver.vehicle},{' '}
              {unitsLabel(data.capacity)}). Al confirmar se guarda como borrador sin asignar
              automáticamente.
            </p>
          ) : null}
          <p className="notice">
            <strong>Horarios agrupados.</strong> Cada ruta reúne entregas con hasta{' '}
            {data.timeWindowMarginMinutes} minutos de diferencia, máximo 4 paradas y hasta{' '}
            {unitsLabel(data.capacity)} de carga, en orden de hora; no es una promesa de llegada.
          </p>
          <DistanceNotice method={data.distanceMethod} />
        </div>
      </section>

      {routes.length === 0 ? (
        <section className="card planning-empty">
          <span className="planning-empty__icon" aria-hidden="true">
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 8 12 3 3 8v8l9 5 9-5V8ZM3 8l9 5 9-5M12 13v8" />
            </svg>
          </span>
          <h2>Nada por planificar</h2>
          <p className="empty-state">
            {data.excluded.length > 0
              ? 'Ningún pedido pudo incluirse en una ruta con la capacidad planificada. Revisa los pedidos excluidos.'
              : 'No hay pedidos pendientes para planificar en esta fecha.'}
          </p>
          <p className="planning-empty__hint">
            {data.excluded.length > 0
              ? 'Abre «Excluidos» arriba para ver el motivo y los choferes candidatos.'
              : 'Elige otro día arriba y vuelve a previsualizar.'}
          </p>
        </section>
      ) : (
        <section className="card" aria-labelledby="planning-routes-title">
          <div className="planning-routes__header">
            <h2 id="planning-routes-title">Rutas propuestas ({routes.length})</h2>
            {data.canConfirm && (
              <Button
                disabled={isConfirming || pendingToConfirm.length === 0}
                onClick={() => confirmAll(pendingToConfirm.map(({ proposal }) => proposal))}
              >
                {unsavedCount === 0
                  ? 'Todas las rutas están guardadas'
                  : `Confirmar todas (${pendingToConfirm.length})`}
              </Button>
            )}
          </div>

          <div className="planning-routes">
            <div className="planning-routes__list">
              {routes.map(({ proposal, key, label, color }) => (
                <ProposalCard
                  key={key}
                  proposal={proposal}
                  label={label}
                  color={color}
                  capacity={data.capacity}
                  method={data.distanceMethod}
                  isSelected={selectedKey === key}
                  confirmation={states[key]}
                  onSelect={() => toggleSelection(key)}
                  canConfirm={data.canConfirm}
                  onConfirm={() => confirm(proposal)}
                />
              ))}
            </div>
            <div className="planning-routes__map">
              <RoutesMap routes={mapRoutes} selectedId={selectedKey} onSelect={toggleSelection} />
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
