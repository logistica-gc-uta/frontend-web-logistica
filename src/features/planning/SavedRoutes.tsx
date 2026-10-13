import { useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { SelectField } from '../../components/ui/SelectField'
import { formatDateTime } from '../../lib/format/formatDateTime'
import { dayInGuayaquil } from '../../lib/time/guayaquil'
import { ROUTE_STATUS_HELP, ROUTE_STATUS_LABELS } from './routeLabels'
import type { Driver, SavedRouteDetail } from './types'
import type { AssignmentState } from './useDriverAssignment'

interface AssignDriverProps {
  route: SavedRouteDetail
  /** Nombre visible de la ruta, para distinguir su selector del de otras rutas de la misma zona. */
  name: string
  drivers: Driver[]
  assignment: AssignmentState | undefined
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

interface SavedRoutesProps {
  /** Día mostrado (aaaa-mm-dd, horario de Guayaquil). */
  day: string
  routes: SavedRouteDetail[]
  drivers: Driver[]
  assignments: Record<string, AssignmentState>
  onAssign: (routeId: string, driverId: string) => void
}

/** Nombre único dentro del día: varias rutas pueden compartir zona y hora de entrega. */
const savedRouteName = (index: number, zoneCode: string): string =>
  `Ruta guardada ${index + 1} · ${zoneCode}`

/**
 * Rutas ya guardadas del día, diferenciando DRAFT (guardada, sin chofer) de ASSIGNED (con chofer,
 * sin iniciar). Las rutas en curso o completadas no ofrecen ninguna acción.
 */
export function SavedRoutes({ day, routes, drivers, assignments, onAssign }: SavedRoutesProps) {
  const ofDay = routes.filter((route) => dayInGuayaquil(new Date(route.date)) === day)

  if (ofDay.length === 0) {
    return <p className="empty-state">Aún no hay rutas guardadas para este día.</p>
  }

  return (
    <ul className="saved-routes">
      {ofDay.map((route, index) => {
        const name = savedRouteName(index, route.zoneCode)
        return (
          <li key={route.id} className="saved-route" aria-label={name}>
            <div className="saved-route__header">
              <strong>
                {name} · {formatDateTime(route.date)}
              </strong>
              <span className={`badge${route.status === 'ASSIGNED' ? ' badge--success' : ''}`}>
                {ROUTE_STATUS_LABELS[route.status]}
              </span>
            </div>
            <p className="text-muted">{ROUTE_STATUS_HELP[route.status]}</p>

            <ol className="saved-route__stops">
              {route.orders.map((order) => (
                <li key={order.id}>{order.deliveryAddress}</li>
              ))}
            </ol>

            {route.driverName && <p>Chofer: {route.driverName}</p>}
            {route.status === 'DRAFT' && (
              <AssignDriver
                route={route}
                name={name}
                drivers={drivers}
                assignment={assignments[route.id]}
                onAssign={onAssign}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}
