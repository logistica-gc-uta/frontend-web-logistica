import { useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { SelectField } from '../../components/ui/SelectField'
import { formatDateTime } from '../../lib/format/formatDateTime'
import { dayInGuayaquil } from '../../lib/time/guayaquil'
import { ROUTE_STATUS_HELP, ROUTE_STATUS_LABELS } from './routeLabels'
import type { Driver, SavedRouteDetail } from './types'
import { RouteCorrection, type MoveTarget } from './RouteCorrection'
import type { RouteActionState } from './useRouteActions'

interface AssignDriverProps {
  route: SavedRouteDetail
  /** Nombre visible de la ruta, para distinguir su selector del de otras rutas de la misma zona. */
  name: string
  drivers: Driver[]
  assignment: RouteActionState | undefined
  onAssign: (routeId: string, driverId: string) => void
}

/** Asignación de chofer: solo para rutas DRAFT y solo con choferes disponibles. */
function AssignDriver({ route, name, drivers, assignment, onAssign }: AssignDriverProps) {
  const [driverId, setDriverId] = useState('')
  const available = drivers.filter((driver) => driver.isAvailable)

  if (available.length === 0) {
    return <p className="text-muted">No hay choferes disponibles en este momento.</p>
  }

  return (
    <div className="saved-route__assign">
      <SelectField
        label={`Chofer para ${name}`}
        value={driverId}
        onChange={(event) => setDriverId(event.target.value)}
      >
        <option value="">Selecciona un chofer disponible</option>
        {available.map((driver) => (
          <option key={driver.id} value={driver.id}>
            {`${driver.name} · ${driver.vehicle}`}
          </option>
        ))}
      </SelectField>
      <Button
        disabled={driverId === ''}
        isLoading={assignment?.status === 'saving'}
        loadingText="Asignando..."
        onClick={() => onAssign(route.id, driverId)}
      >
        Asignar chofer
      </Button>
      {assignment?.status === 'failed' && <Alert>{assignment.error}</Alert>}
    </div>
  )
}

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
  actions: Record<string, RouteActionState>
  onAssign: (routeId: string, driverId: string) => void
  onReorder: (routeId: string, orderIds: string[], reason: string) => Promise<boolean>
  onMove: (
    routeId: string,
    orderId: string,
    targetRouteId: string,
    reason: string,
  ) => Promise<boolean>
}

/** Nombre único dentro del día: varias rutas pueden compartir zona y hora de entrega. */
const savedRouteName = (index: number, zoneCode: string): string =>
  `Ruta guardada ${index + 1} · ${zoneCode}`

interface SavedRouteItemProps extends Omit<SavedRoutesProps, 'day' | 'routes' | 'actions'> {
  route: SavedRouteDetail
  name: string
  targets: MoveTarget[]
  action: RouteActionState | undefined
}

function SavedRouteItem({
  route,
  name,
  targets,
  drivers,
  action,
  onAssign,
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
            <AssignDriver
              route={route}
              name={name}
              drivers={drivers}
              assignment={action}
              onAssign={onAssign}
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
  const ofDay = routes.filter((route) => dayInGuayaquil(new Date(route.date)) === day)

  if (ofDay.length === 0) {
    return <p className="empty-state">Aún no hay rutas guardadas para este día.</p>
  }

  const named = ofDay.map((route, index) => ({
    route,
    name: savedRouteName(index, route.zoneCode),
  }))

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
