import type { ChangeEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { SelectField } from '../../components/ui/SelectField'
import { TextField } from '../../components/ui/TextField'
import { useForm } from '../../hooks/useForm'
import { todayInGuayaquil } from '../../lib/time/guayaquil'
import { isBlank } from '../../lib/validation/validators'
import { DEFAULT_VEHICLE_CAPACITY } from '../drivers/types'
import { effectiveVehicleCapacity } from '../drivers/driverValidation'
import { DRIVER_UNAVAILABLE_LABELS } from './routeLabels'
import type { Driver, ProposalsQuery } from './types'

type FiltersValues = { date: string; driverId: string }

const EMPTY_DRIVERS: Driver[] = []

const unitsLabel = (count: number) => (count === 1 ? '1 unidad' : `${count} unidades`)

interface PlanningFiltersProps {
  /** Calcula la propuesta; la promesa termina cuando el cálculo acaba. */
  onPreview: (query: ProposalsQuery) => Promise<void>
  /** Choferes con su disponibilidad para la fecha elegida. */
  drivers?: Driver[]
  driversLoading?: boolean
  driversError?: string | null
  /** Avisa al cambiar la fecha para consultar los choferes disponibles antes de previsualizar. */
  onDateChange?: (date: string) => void
}

export function PlanningFilters({
  onPreview,
  drivers = EMPTY_DRIVERS,
  driversLoading = false,
  driversError = null,
  onDateChange,
}: PlanningFiltersProps) {
  const { values, fieldErrors, isSubmitting, handleChange, handleSubmit } = useForm<FiltersValues>({
    initialValues: { date: todayInGuayaquil(), driverId: '' },
    validate: ({ date }) => (isBlank(date) ? { date: 'Elige el día a planificar' } : {}),
    onSubmit: ({ date, driverId }) => {
      const validDriver = drivers.some((driver) => driver.id === driverId && driver.isAvailable)
      return onPreview(validDriver ? { date, driverId } : { date })
    },
  })

  const effectiveDriverId = drivers.some(
    (driver) => driver.id === values.driverId && driver.isAvailable,
  )
    ? values.driverId
    : ''

  const handleDateInput = (event: ChangeEvent<HTMLInputElement>) => {
    handleChange(event)
    onDateChange?.(event.target.value)
  }

  return (
    <form className="filters" onSubmit={handleSubmit} noValidate aria-label="Datos de la propuesta">
      <TextField
        label="Día a planificar"
        name="date"
        type="date"
        value={values.date}
        onChange={handleDateInput}
        error={fieldErrors.date}
      />
      <SelectField
        label="Chofer para planificar"
        name="driverId"
        value={effectiveDriverId}
        onChange={handleChange}
        disabled={driversLoading}
        error={driversError ?? undefined}
      >
        <option value="">
          {driversLoading
            ? 'Cargando choferes...'
            : `Capacidad por defecto (${DEFAULT_VEHICLE_CAPACITY} unidades)`}
        </option>
        {drivers.map((driver) => {
          const capacity = effectiveVehicleCapacity(driver.vehicleCapacity)
          return (
            <option key={driver.id} value={driver.id} disabled={!driver.isAvailable}>
              {driver.isAvailable
                ? `${driver.name} · ${driver.vehicle} (${unitsLabel(capacity)})`
                : `${driver.name} · ${DRIVER_UNAVAILABLE_LABELS[driver.unavailableReason ?? 'MARKED_UNAVAILABLE']}`}
            </option>
          )
        })}
      </SelectField>
      <Button type="submit" isLoading={isSubmitting} loadingText="Calculando...">
        Previsualizar rutas
      </Button>
    </form>
  )
}
