import { useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { formatDateTime } from '../../lib/format/formatDateTime'
import { ROUTE_STATUS_HELP, ROUTE_STATUS_LABELS } from './routeLabels'
import type { Driver, SavedRouteDetail } from './types'
import { DriverPicker } from './DriverPicker'
import { RouteCorrection, type MoveTarget } from './RouteCorrection'
import { namedRoutesOfDay } from './savedRouteNames'
import type { KeyedActionState } from '../../hooks/useKeyedActions'

/** Solo antes de iniciar se puede cambiar la estructura de una ruta (igual que en el backend). */
const isEditable = (route: SavedRouteDetail): boolean =>
  (route.status === 'DRAFT' || route.status === 'ASSIGNED') && !route.startedAt

/** Reasignar chofer conserva la compatibilidad con registros previos sin `startedAt`. */
const isReassignable = (route: SavedRouteDetail): boolean =>
  route.status === 'ASSIGNED' && !route.startedAt

/** Solo una ruta ASSIGNED con `startedAt: null` explícito se puede cancelar (nunca un borrador DRAFT). */
const isCancellable = (route: SavedRouteDetail): boolean =>
  route.status === 'ASSIGNED' && route.startedAt === null

/**
 * Un borrador sin chofer y sin iniciar se puede liberar (`RELEASE_DRAFT`), sea de hoy o de otra
 * fecha (#70). Las rutas asignadas usan «Cancelar ruta» y las iniciadas no ofrecen ninguna de las dos.
 */
const isReleasable = (route: SavedRouteDetail): boolean =>
  route.status === 'DRAFT' && !route.driverId && !route.startedAt

const REASON_MAX_LENGTH = 500

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
  /**
   * `false` si el día mostrado no es hoy (hora de Ecuador): sus borradores ya no se pueden asignar
   * (backend #49) y solo se ofrece liberarlos. Por defecto, hoy.
   */
  isToday?: boolean
  /** Libera un borrador sin chofer: sus pedidos vuelven a pendientes (`RELEASE_DRAFT`). */
  onRelease?: (routeId: string, reason: string) => Promise<boolean>
  /** Cancela una ruta ASSIGNED antes de iniciar (`CANCEL_ROUTE`). */
  onCancel?: (routeId: string, reason: string) => Promise<boolean>
}

interface SavedRouteItemProps extends Omit<SavedRoutesProps, 'day' | 'routes' | 'actions'> {
  route: SavedRouteDetail
  name: string
  targets: MoveTarget[]
  action: KeyedActionState | undefined
}

/** Liberar un borrador sin chofer: pide el motivo y confirma antes de devolver sus pedidos. */
function ReleaseDraft({
  name,
  action,
  open,
  onOpenChange,
  onRelease,
}: {
  name: string
  action: KeyedActionState | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  onRelease: (reason: string) => Promise<boolean>
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const isRunning = action?.status === 'saving'

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => onOpenChange(true)}>
        Liberar borrador
      </Button>
    )
  }

  const confirm = async () => {
    const trimmed = reason.trim()
    if (trimmed === '') {
      setError('Escribe el motivo')
      return
    }
    if (trimmed.length > REASON_MAX_LENGTH) {
      setError(`El motivo no puede superar ${REASON_MAX_LENGTH} caracteres`)
      return
    }
    setError(null)
    if (await onRelease(trimmed)) onOpenChange(false)
  }

  return (
    <div className="saved-route__release">
      <p>
        Se quitarán sus paradas y sus pedidos volverán a pendientes para planificarlos de nuevo. No
        se cancela ningún pedido.
      </p>
      <TextField
        label={`Motivo para liberar ${name}`}
        placeholder="Ej.: el cliente cambió la hora de entrega"
        value={reason}
        maxLength={REASON_MAX_LENGTH}
        disabled={isRunning}
        error={error ?? undefined}
        onChange={(event) => {
          setReason(event.target.value)
          setError(null)
        }}
      />
      <Button isLoading={isRunning} loadingText="Liberando..." onClick={() => void confirm()}>
        Confirmar liberación
      </Button>
      <Button variant="secondary" disabled={isRunning} onClick={() => onOpenChange(false)}>
        Volver
      </Button>
      {action?.status === 'failed' && (
        <p className="field__error" role="alert">
          {action.error}
        </p>
      )}
    </div>
  )
}

/** Cancelar una ruta asignada antes de iniciar: pide motivo y confirma sus efectos. */
function CancelRoute({
  name,
  action,
  onCancel,
  onClose,
}: {
  name: string
  action: KeyedActionState | undefined
  onCancel: (reason: string) => Promise<boolean>
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)
  const isRunning = action?.status === 'saving'

  const confirm = async () => {
    const trimmed = reason.trim()
    if (trimmed === '') {
      setError('Escribe el motivo')
      return
    }
    if (trimmed.length > REASON_MAX_LENGTH) {
      setError(`El motivo no puede superar ${REASON_MAX_LENGTH} caracteres`)
      return
    }
    setError(null)
    setAttempted(true)
    if (await onCancel(trimmed)) onClose()
  }

  return (
    <div className="route-correction" role="group" aria-label={`Cancelar ${name}`}>
      <p>
        Los pedidos no se cancelan: volverán a Planificación para planificarlos de nuevo y el chofer
        quedará libre. La ruta quedará registrada como cancelada.
      </p>
      <TextField
        label={`Motivo para cancelar ${name}`}
        placeholder="Ej.: vehículo con avería antes de salir"
        value={reason}
        maxLength={REASON_MAX_LENGTH}
        disabled={isRunning}
        error={error ?? undefined}
        onChange={(event) => {
          setReason(event.target.value)
          setError(null)
        }}
      />
      <div className="route-correction__actions">
        <Button isLoading={isRunning} loadingText="Cancelando..." onClick={() => void confirm()}>
          Confirmar cancelación
        </Button>
        <Button variant="secondary" disabled={isRunning} onClick={onClose}>
          Volver
        </Button>
      </div>
      {attempted && action?.status === 'failed' && <Alert>{action.error}</Alert>}
    </div>
  )
}

function badgeClass(status: SavedRouteDetail['status']): string {
  if (status === 'ASSIGNED') return 'badge badge--success'
  if (status === 'CANCELLED') return 'badge badge--danger'
  return 'badge'
}

function CancellationEvidence({ route }: { route: SavedRouteDetail }) {
  if (route.status !== 'CANCELLED') return null
  const actor = route.cancelledById?.trim() || null
  const reason = route.cancellationReason?.trim() || null
  if (!route.cancelledAt && !actor && !reason) return null

  return (
    <div className="text-muted">
      {route.cancelledAt && <p>Cancelada el {formatDateTime(route.cancelledAt)}</p>}
      {actor && <p>Cancelada por: {actor}</p>}
      {reason && <p>Motivo de cancelación: {reason}</p>}
    </div>
  )
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
  isToday = true,
  onRelease,
  onCancel,
}: SavedRouteItemProps) {
  const [isCorrecting, setIsCorrecting] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [isReleasing, setIsReleasing] = useState(false)
  const canEdit = isEditable(route)
  const canReassign = isReassignable(route)
  const canCancel = isCancellable(route) && Boolean(onCancel)
  const showReleaseDraft = isReleasable(route) && Boolean(onRelease)
  // Mientras se confirma la liberación no se ofrece asignar chofer a la misma ruta.
  const showAssignPicker =
    route.status === 'DRAFT' && isToday && !route.startedAt && !(showReleaseDraft && isReleasing)
  const pickerRendersError =
    (showAssignPicker && drivers.some((driver) => driver.isAvailable)) ||
    (canReassign && drivers.some((driver) => driver.id !== route.driverId && driver.isAvailable))
  const showCardError =
    action?.status === 'failed' && !pickerRendersError && !(showReleaseDraft && isReleasing)

  return (
    <li className="saved-route" aria-label={name}>
      <div className="saved-route__header">
        <strong>
          {name} · {formatDateTime(route.date)}
        </strong>
        <span className={badgeClass(route.status)}>{ROUTE_STATUS_LABELS[route.status]}</span>
      </div>
      <p className="text-muted">{ROUTE_STATUS_HELP[route.status]}</p>

      {isCorrecting && canEdit ? (
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
          {route.orders.length > 0 && (
            <ol className="saved-route__stops">
              {route.orders.map((order) => (
                <li key={order.id}>{order.deliveryAddress}</li>
              ))}
            </ol>
          )}

          {route.driverName && <p>Chofer: {route.driverName}</p>}
          <CancellationEvidence route={route} />

          {isCancelling && canCancel && onCancel ? (
            <CancelRoute
              name={name}
              action={action}
              onCancel={(reason) => onCancel(route.id, reason)}
              onClose={() => setIsCancelling(false)}
            />
          ) : (
            <>
              {canEdit && (
                <Button variant="secondary" onClick={() => setIsCorrecting(true)}>
                  Corregir paradas
                </Button>
              )}
              {route.status === 'DRAFT' && !isToday && (
                <p className="field__error">
                  Este borrador no es de hoy: ya no se puede asignar. Libéralo para planificar sus
                  pedidos de nuevo.
                </p>
              )}
              {showReleaseDraft && onRelease && (
                <ReleaseDraft
                  name={name}
                  action={action}
                  open={isReleasing}
                  onOpenChange={setIsReleasing}
                  onRelease={(reason) => onRelease(route.id, reason)}
                />
              )}
              {showAssignPicker && (
                <DriverPicker
                  label={`Chofer para ${name}`}
                  submitLabel="Asignar chofer"
                  loadingText="Asignando..."
                  drivers={drivers}
                  state={action}
                  onSubmit={(driverId) => onAssign(route.id, driverId)}
                />
              )}
              {canReassign && (
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
              {canCancel && (
                <Button variant="secondary" onClick={() => setIsCancelling(true)}>
                  Cancelar ruta
                </Button>
              )}
              {showCardError && <Alert>{action.error}</Alert>}
            </>
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
  const routeIds = new Set(routes.map((route) => route.id))
  const missingRouteErrors = Object.entries(actions).flatMap(([routeId, state]) =>
    state.status === 'failed' && !routeIds.has(routeId) ? [[routeId, state.error] as const] : [],
  )

  if (named.length === 0) {
    return (
      <>
        {missingRouteErrors.map(([routeId, error]) => (
          <Alert key={routeId}>{error}</Alert>
        ))}
        <p className="empty-state">Aún no hay rutas guardadas para este día.</p>
      </>
    )
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
    <>
      {missingRouteErrors.map(([routeId, error]) => (
        <Alert key={routeId}>{error}</Alert>
      ))}
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
    </>
  )
}
