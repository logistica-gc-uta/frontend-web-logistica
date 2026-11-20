import { useRef, useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { formatDateTime } from '../../lib/format/formatDateTime'
import { todayInGuayaquil } from '../../lib/time/guayaquil'
import { ROUTE_STATUS_LABELS } from '../planning/routeLabels'
import type { RouteStatus } from '../planning/types'
import {
  blockingRoutesOf,
  describeDriverError,
  driverErrorCode,
  STALE_STATUS_CODES,
} from './driverErrors'
import { driversAdminService } from './driversAdminService'
import type { BlockingRoute, DriverProfile } from './types'

/** Mismo límite que el backend para el motivo de una baja o reactivación (#82). */
const MAX_REASON = 500

/** Un perfil sin la marca `isActive` cuenta como activo: solo `false` es una baja (backend #82). */
export const isDriverActive = (driver: Pick<DriverProfile, 'isActive'>): boolean =>
  driver.isActive !== false

const routeStatusLabel = (status: string | null): string =>
  status && status in ROUTE_STATUS_LABELS
    ? ROUTE_STATUS_LABELS[status as RouteStatus]
    : (status ?? 'Estado desconocido')

/**
 * Tras reactivar se consulta la disponibilidad de hoy: reactivar solo devuelve el acceso, así que
 * una ausencia o una ruta pendiente lo siguen dejando sin poder recibir rutas.
 */
async function stillBlockedToday(driverId: string): Promise<string | null> {
  try {
    const day = await driversAdminService.availabilityOn(driverId, todayInGuayaquil())
    if (day.absence) return 'tiene una ausencia registrada para hoy'
    if (day.hasPersistedHolds) return 'tiene una ruta pendiente de regreso al depósito'
    if (!day.isAvailable) return 'está marcado como no disponible'
    return null
  } catch {
    return null
  }
}

interface DriverStatusPanelProps {
  driver: DriverProfile
  /** Se cambió el estado: mensaje para el listado (que se vuelve a leer). */
  onChanged: (message: string) => void
  /** El estado cambió en otra sesión: hay que releer la lista sin dar nada por hecho. */
  onStale: () => void
  onClose: () => void
}

/**
 * ADMIN · dar de baja o reactivar a un repartidor (backend #82). Confirma con un motivo opcional y
 * explica qué cambia; si la API lo rechaza, conserva el estado anterior y dice qué falta resolver.
 */
export function DriverStatusPanel({ driver, onChanged, onStale, onClose }: DriverStatusPanelProps) {
  const active = isDriverActive(driver)
  const name = driver.user.name
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [blocking, setBlocking] = useState<BlockingRoute[]>([])
  const [saving, setSaving] = useState(false)
  // Evita un segundo envío antes de que React vuelva a pintar el botón deshabilitado.
  const inFlight = useRef(false)

  const confirm = async () => {
    const trimmed = reason.trim()
    if (trimmed.length > MAX_REASON) {
      setError(`El motivo no puede superar ${MAX_REASON} caracteres`)
      return
    }
    if (inFlight.current) return
    inFlight.current = true
    setSaving(true)
    setError(null)
    setBlocking([])
    try {
      if (active) {
        await driversAdminService.deactivate(driver.id, trimmed || undefined)
        onChanged(
          `${name} quedó dado de baja: no puede iniciar sesión ni recibir rutas. Su historial se conserva.`,
        )
      } else {
        await driversAdminService.activate(driver.id, trimmed || undefined)
        const blocked = await stillBlockedToday(driver.id)
        onChanged(
          blocked
            ? `${name} fue reactivado y ya puede iniciar sesión, pero todavía no puede recibir rutas: ${blocked}.`
            : `${name} fue reactivado: ya puede iniciar sesión y recibir rutas.`,
        )
      }
    } catch (failure) {
      setError(
        describeDriverError(
          failure,
          active ? 'No se pudo dar de baja al repartidor' : 'No se pudo reactivar al repartidor',
        ),
      )
      setBlocking(blockingRoutesOf(failure))
      const code = driverErrorCode(failure)
      if ((code && STALE_STATUS_CODES.has(code)) || code === 'DRIVER_HAS_OPEN_ROUTE') onStale()
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  return (
    <div className="driver-status" role="group" aria-label={`Estado de ${name}`}>
      <p>
        Estado actual:{' '}
        <span className={active ? 'badge badge--success' : 'badge badge--danger'}>
          {active ? 'Activo' : 'Dado de baja'}
        </span>
      </p>
      {!active && (driver.statusChangedAt || driver.statusReason) && (
        <p className="text-muted">
          {driver.statusChangedAt && (
            <>Dado de baja el {formatDateTime(driver.statusChangedAt)}. </>
          )}
          {driver.statusReason && <>Motivo: {driver.statusReason}</>}
        </p>
      )}

      {active ? (
        <p>
          Al darlo de baja no podrá iniciar sesión en la app ni se le podrán asignar rutas. No se
          borran su cuenta, sus rutas anteriores, su historial ni sus ausencias, y se puede
          reactivar después. Si tiene una ruta asignada, en curso o sin regreso al depósito, primero
          hay que resolverla.
        </p>
      ) : (
        <p>
          Al reactivarlo podrá volver a iniciar sesión. Sus ausencias y rutas pendientes se
          mantienen: si tiene alguna, seguirá sin poder recibir rutas hasta que se resuelva.
        </p>
      )}

      <TextField
        label={
          active
            ? `Motivo de la baja de ${name} (opcional)`
            : `Motivo de la reactivación de ${name} (opcional)`
        }
        placeholder={active ? 'Ej.: dejó de trabajar con nosotros' : 'Ej.: volvió de su licencia'}
        value={reason}
        maxLength={MAX_REASON}
        disabled={saving}
        onChange={(event) => {
          setReason(event.target.value)
          setError(null)
        }}
      />

      <div className="driver-status__actions">
        <Button
          isLoading={saving}
          loadingText={active ? 'Dando de baja...' : 'Reactivando...'}
          onClick={() => void confirm()}
        >
          {active ? 'Confirmar baja' : 'Confirmar reactivación'}
        </Button>
        <Button variant="secondary" disabled={saving} onClick={onClose}>
          Volver
        </Button>
      </div>

      {error && (
        <Alert>
          {error}
          {blocking.length > 0 && (
            <ul className="driver-status__blocking">
              {blocking.map((route) => (
                <li key={route.routeId}>
                  Ruta {route.routeId.slice(0, 8)} · {routeStatusLabel(route.status)}
                  {route.returnConfirmed ? '' : ' · regreso al depósito sin confirmar'}
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}
    </div>
  )
}
