import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { formatDateTime } from '../../lib/format/formatDateTime'
import { ROUTE_STATUS_HELP, ROUTE_STATUS_LABELS } from './routeLabels'
import type { Driver, SavedRouteDetail } from './types'
import { DriverPicker } from './DriverPicker'
import { RouteCorrection, type MoveTarget } from './RouteCorrection'
import { namedRoutesOfDay } from './savedRouteNames'
import type { KeyedActionState } from '../../hooks/useKeyedActions'

/** Solo antes de iniciar se puede cambiar la estructura de una ruta (igual que en el backend). */
const isEditable = (route: SavedRouteDetail): boolean =>
  route.status === 'DRAFT' || route.status === 'ASSIGNED'

/** Capacidad máxima de una ruta (la misma que usa el planificador). */
const ROUTE_CAPACITY = 4

interface SavedRoutesProps {
  /** Día mostrado (aaaa-mm-dd, horario de Guayaquil). */
  day: string
  routes: SavedRouteDetail[]
  drivers: Driver[]
  /** Acciones en curso o fallidas por ruta (asignación o corrección). */
  actions: Record<string, KeyedActionState>
  onAssign: (routeId: string, driverId: string) => void
  /** Cambia el chofer de una ruta ASSIGNED todavía no iniciada (con motivo). */
  onReassign: (routeId: string, driverId: string, reason: string) => void
  onReorder: (routeId: string, orderIds: string[], reason: string) => Promise<boolean>
  onMove: (
    routeId: string,
    orderId: string,
    targetRouteId: string,
    reason: string,
  ) => Promise<boolean>
}

interface SavedRouteItemProps extends Omit<SavedRoutesProps, 'day' | 'routes' | 'actions'> {
  route: SavedRouteDetail
  name: string
  targets: MoveTarget[]
  action: KeyedActionState | undefined
}

function SavedRouteItem({
  route,
  name,
  targets,
  drivers,
  action,
  onAssign,
  onReassign,
  onReorder,
  onMove,
}: SavedRouteItemProps) {
  const [isCorrecting, setIsCorrecting] = useState(false)

  return (
    <li className="saved-route" aria-label={name}>
      <div className="saved-route__header">
        <strong>
          {name} · {formatDateTime(route.date)}
        </strong>
        <span className={`badge${route.status === 'ASSIGNED' ? ' badge--success' : ''}`}>
          {ROUTE_STATUS_LABELS[route.status]}
        </span>
      </div>
      <p className="text-muted">{ROUTE_STATUS_HELP[route.status]}</p>

      {isCorrecting ? (
        <RouteCorrection
          route={route}
          name={name}
          targets={targets}
          state={action}
          onReorder={(orderIds, reason) => onReorder(route.id, orderIds, reason)}
          onMove={(orderId, targetRouteId, reason) =>
            onMove(route.id, orderId, targetRouteId, reason)
          }
          onClose={() => setIsCorrecting(false)}
        />
      ) : (
        <>
          <ol className="saved-route__stops">
            {route.orders.map((order) => (
              <li key={order.id}>{order.deliveryAddress}</li>
            ))}
          </ol>

          {route.driverName && <p>Chofer: {route.driverName}</p>}
          {isEditable(route) && (
            <Button variant="secondary" onClick={() => setIsCorrecting(true)}>
              Corregir paradas
            </Button>
          )}
          {route.status === 'DRAFT' && (
            <DriverPicker
              label={`Chofer para ${name}`}
              submitLabel="Asignar chofer"
              loadingText="Asignando..."
              drivers={drivers}
              state={action}
              onSubmit={(driverId) => onAssign(route.id, driverId)}
            />
          )}
          {route.status === 'ASSIGNED' && (
            <DriverPicker
              label={`Nuevo chofer para ${name}`}
              submitLabel="Cambiar chofer"
              loadingText="Cambiando..."
              drivers={drivers}
              currentDriverId={route.driverId}
              reasonLabel={`Motivo del cambio de chofer de ${name}`}
              state={action}
              onSubmit={(driverId, reason) => onReassign(route.id, driverId, reason)}
            />
          )}
        </>
      )}
    </li>
  )
}

/**
 * Rutas ya guardadas del día, diferenciando DRAFT (guardada, sin chofer) de ASSIGNED (con chofer,
 * sin iniciar). Antes de iniciar se pueden corregir sus paradas; las rutas en curso o completadas
 * no ofrecen ninguna acción.
 */
export function SavedRoutes({ day, routes, actions, ...handlers }: SavedRoutesProps) {
  const named = namedRoutesOfDay(routes, day)

  if (named.length === 0) {
    return <p className="empty-state">Aún no hay rutas guardadas para este día.</p>
  }

  /** Rutas que pueden recibir un pedido de `source`: mismo día y zona, sin iniciar y con lugar. */
  const targetsFor = (source: SavedRouteDetail): MoveTarget[] =>
    named
      .filter(
        ({ route }) =>
          route.id !== source.id &&
          route.zoneId === source.zoneId &&
          isEditable(route) &&
          route.orders.length < ROUTE_CAPACITY,
      )
      .map(({ route, name }) => ({ id: route.id, name }))

  return (
    <ul className="saved-routes">
      {named.map(({ route, name }) => (
        <SavedRouteItem
          key={route.id}
          route={route}
          name={name}
          targets={targetsFor(route)}
          action={actions[route.id]}
          {...handlers}
        />
      ))}
    </ul>
  )
}
