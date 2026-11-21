import { useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Drawer } from '../../components/ui/Drawer'
import { TextField } from '../../components/ui/TextField'
import { describePlanningReason } from '../../lib/planning/planningReasons'
import { describeDispatchError } from '../dispatch/dispatchError'
import { dispatchService } from '../dispatch/dispatchService'
import { effectiveVehicleCapacity } from '../drivers/driverValidation'
import type { Driver, ExcludedOrder } from './types'

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/** Primeros caracteres del identificador: suficientes para ubicar el pedido en el listado. */
const shortId = (orderId: string): string => orderId.slice(0, 8)

const unitsLabel = (count: number) => (count === 1 ? '1 unidad' : `${count} unidades`)

const CAPACITY_REASON = 'VEHICLE_CAPACITY_EXCEEDED'
const EMPTY_DRIVERS: Driver[] = []

/** Choferes alternativos disponibles ese día cuya capacidad alcanza las unidades del pedido. */
function suggestAlternativeDrivers(
  drivers: Driver[],
  requiredUnits: number,
  selectedDriverId?: string,
): Driver[] {
  return drivers.filter(
    (driver) =>
      driver.isAvailable &&
      driver.id !== selectedDriverId &&
      effectiveVehicleCapacity(driver.vehicleCapacity) >= requiredUnits,
  )
}

function formatReason(reason: string, requiredUnits?: number, capacity?: number): string {
  if (reason !== CAPACITY_REASON) return capitalize(describePlanningReason(reason))
  if (requiredUnits !== undefined && capacity !== undefined) {
    return `Supera la capacidad del vehículo (requiere ${unitsLabel(requiredUnits)}; capacidad planificada: ${unitsLabel(capacity)}). El pedido no se divide`
  }
  if (requiredUnits !== undefined) {
    return `Supera la capacidad del vehículo (requiere ${unitsLabel(requiredUnits)}). El pedido no se divide`
  }
  return 'Supera la capacidad del vehículo. El pedido no se divide'
}

interface ExcludedOrdersProps {
  excluded: ExcludedOrder[]
  open: boolean
  onClose: () => void
  capacity?: number
  date?: string
  drivers?: Driver[]
  selectedDriverId?: string
  /** Se llama tras acordar retiro en tienda para actualizar la propuesta. */
  onPickupAgreed?: () => void
}

/**
 * Pedidos que el planificador no pudo incluir en ninguna ruta, con el motivo en español, en un
 * panel lateral que se abre desde el aviso de la cabecera de la página.
 */
export function ExcludedOrders({
  excluded,
  open,
  onClose,
  capacity,
  date,
  drivers = EMPTY_DRIVERS,
  selectedDriverId,
  onPickupAgreed,
}: ExcludedOrdersProps) {
  const [pickupOrderId, setPickupOrderId] = useState<string | null>(null)
  const [pickupReason, setPickupReason] = useState('')
  const [pickupError, setPickupError] = useState<string | null>(null)
  const [isSavingPickup, setIsSavingPickup] = useState(false)

  if (excluded.length === 0) return null

  const submitPickup = async (orderId: string) => {
    if (isSavingPickup) return
    const trimmed = pickupReason.trim()
    if (!trimmed) {
      setPickupError('Escribe un motivo breve del acuerdo con el cliente')
      return
    }
    setPickupError(null)
    setIsSavingPickup(true)
    try {
      await dispatchService.agreePickup({ orderId, reason: trimmed })
      setPickupOrderId(null)
      setPickupReason('')
      onPickupAgreed?.()
    } catch (error) {
      setPickupError(describeDispatchError(error))
    } finally {
      setIsSavingPickup(false)
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Pedidos excluidos (${excluded.length})`}
      titleId="excluded-orders-title"
      className="drawer__panel--narrow"
    >
      <p className="text-muted">
        No entran en ninguna ruta propuesta. Corrige el motivo y vuelve a previsualizar.
      </p>
      <ul className="excluded-list">
        {excluded.map(({ orderId, reasons, requiredUnits }) => {
          const isCapacityExcluded = reasons.includes(CAPACITY_REASON)
          const alternatives =
            isCapacityExcluded && requiredUnits !== undefined
              ? suggestAlternativeDrivers(drivers, requiredUnits, selectedDriverId)
              : EMPTY_DRIVERS
          const hasUnavailableFit =
            isCapacityExcluded &&
            requiredUnits !== undefined &&
            alternatives.length === 0 &&
            drivers.some(
              (driver) =>
                !driver.isAvailable &&
                driver.id !== selectedDriverId &&
                effectiveVehicleCapacity(driver.vehicleCapacity) >= requiredUnits,
            )

          return (
            <li key={orderId} className="excluded-item">
              <div className="excluded-item__head">
                <code>{shortId(orderId)}</code>
                <span className="excluded-item__reason">
                  {reasons
                    .map((reason) => formatReason(reason, requiredUnits, capacity))
                    .join('. ')}
                </span>
              </div>
              {isCapacityExcluded && requiredUnits !== undefined ? (
                alternatives.length > 0 ? (
                  <p className="excluded-item__hint text-muted">
                    <strong>
                      Choferes candidatos{date ? ` para el ${date}` : ''}:
                    </strong>{' '}
                    {alternatives
                      .map(
                        (driver) =>
                          `${driver.name} · ${driver.vehicle} (${unitsLabel(effectiveVehicleCapacity(driver.vehicleCapacity))})`,
                      )
                      .join('; ')}
                    . Son candidatos por capacidad y disponibilidad del día; no garantiza
                    disponibilidad en la hora exacta del pedido. Elige ese chofer arriba y vuelve a
                    previsualizar para recalcular horarios reales (no se asigna automáticamente).
                  </p>
                ) : (
                  <p className="excluded-item__hint text-muted">
                    Permanece pendiente: ningún chofer disponible{date ? ` para el ${date}` : ''}{' '}
                    alcanza {unitsLabel(requiredUnits)}
                    {hasUnavailableFit
                      ? ' (los vehículos con esa capacidad no están disponibles ese día)'
                      : ''}
                    . El pedido no se divide.
                  </p>
                )
              ) : null}
              {isCapacityExcluded && onPickupAgreed ? (
                pickupOrderId === orderId ? (
                  <div className="excluded-item__pickup-form">
                    <TextField
                      label="Acuerdo de retiro en tienda"
                      placeholder="Ej.: Cliente acordó retirar el pedido en el local"
                      value={pickupReason}
                      maxLength={500}
                      error={pickupError ?? undefined}
                      onChange={(event) => {
                        setPickupReason(event.target.value)
                        setPickupError(null)
                      }}
                    />
                    {pickupError && <Alert>{pickupError}</Alert>}
                    <div className="excluded-item__pickup-actions">
                      <Button
                        isLoading={isSavingPickup}
                        loadingText="Guardando..."
                        onClick={() => void submitPickup(orderId)}
                      >
                        Confirmar retiro en tienda
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={isSavingPickup}
                        onClick={() => {
                          setPickupOrderId(null)
                          setPickupReason('')
                          setPickupError(null)
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="excluded-item__pickup-actions">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setPickupOrderId(orderId)
                        setPickupReason('')
                        setPickupError(null)
                      }}
                    >
                      Acordar retiro en tienda
                    </Button>
                  </div>
                )
              ) : null}
            </li>
          )
        })}
      </ul>
    </Drawer>
  )
}
