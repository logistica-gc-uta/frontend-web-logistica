import { useCallback, useMemo, useState } from 'react'
import { RoutesMap, type MapRoute } from '../../components/map/RoutesMap'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { Button } from '../../components/ui/Button'
import { useFetch } from '../../hooks/useFetch'
import { formatDateTime } from '../../lib/format/formatDateTime'
import { describeAssignError, describeCorrectionError } from './confirmError'
import { DistanceNotice } from './DistanceNotice'
import { driversService } from './driversService'
import { ExcludedOrders } from './ExcludedOrders'
import { planningService } from './planningService'
import { PlanningSummary } from './PlanningSummary'
import { ProposalCard } from './ProposalCard'
import { proposalKey, routeColor, routeLabel } from './routeStyle'
import { SavedRoutes } from './SavedRoutes'
import type { RouteProposalsResponse } from './types'
import { useRouteActions } from './useRouteActions'
import { useRouteConfirmations } from './useRouteConfirmations'

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
  const drivers = useFetch(driversService.list, 'No se pudieron cargar los choferes')
  const { reload: reloadSavedRoutes } = savedRoutes
  const { reload: reloadDrivers } = drivers

  const { states, confirm, confirmAll } = useRouteConfirmations(reloadSavedRoutes)
  // Asignar o corregir cambia rutas y la disponibilidad de los choferes: se consultan de nuevo.
  const refreshSavedState = useCallback(() => {
    reloadSavedRoutes()
    reloadDrivers()
  }, [reloadSavedRoutes, reloadDrivers])
  const routeActions = useRouteActions(refreshSavedState)

  const assignDriver = (routeId: string, driverId: string) =>
    void routeActions.run(
      routeId,
      () => planningService.assignDriver(routeId, driverId),
      describeAssignError,
    )
  const reorderStops = (routeId: string, orderIds: string[], reason: string) =>
    routeActions.run(
      routeId,
      () => planningService.reorderStops({ routeId, orderIds, reason }),
      describeCorrectionError,
    )
  const moveOrder = (routeId: string, orderId: string, targetRouteId: string, reason: string) =>
    routeActions.run(
      routeId,
      () => planningService.moveOrder({ routeId, orderId, targetRouteId, reason }),
      describeCorrectionError,
    )
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
        depotLabel: `Depósito ${proposal.zoneCode}`,
        stops: proposal.stops.map((stop) => ({
          sequence: stop.sequence,
          location: stop.location,
          description: `${stop.deliveryAddress} (${formatDateTime(stop.scheduledDeliveryDate)})`,
        })),
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
        <DistanceNotice />
        <PlanningSummary summary={data.summary} />
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
            <Button
              disabled={isConfirming || pendingToConfirm.length === 0}
              onClick={() => confirmAll(pendingToConfirm.map(({ proposal }) => proposal))}
            >
              {unsavedCount === 0
                ? 'Todas las rutas están guardadas'
                : `Confirmar todas (${pendingToConfirm.length})`}
            </Button>
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
                  isSelected={selectedKey === key}
                  confirmation={states[key]}
                  onSelect={() => toggleSelection(key)}
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
                onAssign={assignDriver}
                onReorder={reorderStops}
                onMove={moveOrder}
              />
            </>
          )}
        </AsyncContent>
      </section>
    </div>
  )
}
