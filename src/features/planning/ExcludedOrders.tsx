import { Drawer } from '../../components/ui/Drawer'
import { describePlanningReason } from '../../lib/planning/planningReasons'
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
}: ExcludedOrdersProps) {
  if (excluded.length === 0) return null

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
            <li key={orderId}>
              <code>{shortId(orderId)}</code>{' '}
              <span>
                {reasons
                  .map((reason) => formatReason(reason, requiredUnits, capacity))
                  .join('. ')}
              </span>
              {isCapacityExcluded && requiredUnits !== undefined ? (
                alternatives.length > 0 ? (
                  <p className="text-muted">
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
                  <p className="text-muted">
                    Permanece pendiente: ningún chofer disponible{date ? ` para el ${date}` : ''}{' '}
                    alcanza {unitsLabel(requiredUnits)}
                    {hasUnavailableFit
                      ? ' (los vehículos con esa capacidad no están disponibles ese día)'
                      : ''}
                    . El pedido no se divide.
                  </p>
                )
              ) : null}
            </li>
          )
        })}
      </ul>
    </Drawer>
  )
}
