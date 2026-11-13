import { useCallback, useMemo, useState } from 'react'
import { STORE_AREA_LABEL } from '../../lib/planning/routeArea'
import { RoutesMap, type MapRoute } from '../../components/map/RoutesMap'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { Button } from '../../components/ui/Button'
import { useFetch } from '../../hooks/useFetch'
import { formatDateTime } from '../../lib/format/formatDateTime'
import { DistanceNotice } from './DistanceNotice'
import { driversService } from './driversService'
import { ExcludedOrders } from './ExcludedOrders'
import { planningService } from './planningService'
import { PlanningSummary } from './PlanningSummary'
import { ProposalCard } from './ProposalCard'
import { proposalKey, routeColor, routeLabel } from './routeStyle'
import { SavedRoutes } from './SavedRoutes'
import type { RouteProposalsResponse } from './types'
import { useRouteConfirmations } from './useRouteConfirmations'
import { useSavedRouteActions } from './useSavedRouteActions'

interface PlanningResultProps {
  data: RouteProposalsResponse
}

/**
 * Resultado de una previsualización: resumen, rutas con su mapa, pedidos excluidos y las rutas ya
 * guardadas del día. Las rutas propuestas son temporales hasta que el operador las confirma.
 */
export function PlanningResult({ data }: PlanningResultProps) {
  const savedRoutes = useFetch(
    planningService.listRoutes,
    'No se pudieron cargar las rutas guardadas',
  )
  // Disponibilidad del día planificado: un chofer ausente ese día no se ofrece (#36).
  const loadDrivers = useCallback(() => driversService.listForDay(data.date), [data.date])
  const drivers = useFetch(loadDrivers, 'No se pudieron cargar los choferes')
  const { reload: reloadSavedRoutes } = savedRoutes
  const { reload: reloadDrivers } = drivers

  const { states, confirm, confirmAll } = useRouteConfirmations(reloadSavedRoutes)
  // Asignar o corregir cambia rutas y la disponibilidad de los choferes: se consultan de nuevo.
  const refreshSavedState = useCallback(() => {
    reloadSavedRoutes()
    reloadDrivers()
  }, [reloadSavedRoutes, reloadDrivers])
  const routeActions = useSavedRouteActions(refreshSavedState)
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
        <h2 id="planning-result-title">Propuesta para el {data.date}</h2>
        <p className="notice notice--preview" role="status">
          <strong>Vista previa.</strong> Estas rutas todavía no están guardadas: nada se registra
          hasta que confirmes.
        </p>
        {!data.canConfirm && (
          <p className="notice notice--preview" role="note">
            <strong>Solo vista previa: no es el día de entrega.</strong> Las rutas se confirman y
            asignan el mismo día (hora de Ecuador). Los pedidos de este día siguen pendientes y se
            planifican ese día.
          </p>
        )}
        <p className="notice">
          <strong>Horarios agrupados.</strong> Cada ruta junta entregas cuyas horas pedidas se
          diferencian en hasta {data.timeWindowMarginMinutes} minutos, con un máximo de{' '}
          {data.capacity} paradas, y las visita en orden de hora. Es una forma de agrupar, no una
          promesa de entregar dentro de ±{data.timeWindowMarginMinutes} minutos.
        </p>
        <DistanceNotice method={data.distanceMethod} />
        <PlanningSummary summary={data.summary} method={data.distanceMethod} />
      </section>

      {routes.length === 0 ? (
        <section className="card">
          <p className="empty-state">
            No hay pedidos pendientes para planificar en esta fecha y zona.
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

      <ExcludedOrders excluded={data.excluded} />

      <section className="card" aria-labelledby="saved-routes-title">
        <h2 id="saved-routes-title">Rutas guardadas para el {data.date}</h2>
        <AsyncContent
          {...savedRoutes}
          onRetry={reloadSavedRoutes}
          loadingText="Cargando rutas guardadas..."
        >
          {(routes) => (
            <>
              {drivers.error && <p className="field__error">{drivers.error}</p>}
              <SavedRoutes
                day={data.date}
                routes={routes}
                drivers={drivers.data ?? []}
                actions={routeActions.states}
                onAssign={routeActions.assign}
                onReassign={routeActions.reassign}
                onReorder={routeActions.reorder}
                onMove={routeActions.move}
                isToday={data.isToday}
                onRelease={routeActions.release}
              />
            </>
          )}
        </AsyncContent>
      </section>
    </div>
  )
}
