import { Button } from '../../components/ui/Button'
import { SelectField } from '../../components/ui/SelectField'
import { TextField } from '../../components/ui/TextField'
import { useForm } from '../../hooks/useForm'
import { todayInGuayaquil } from '../../lib/time/guayaquil'
import { isBlank } from '../../lib/validation/validators'
import type { Zone } from '../zones/types'
import type { ProposalsQuery } from './types'

type FiltersValues = { date: string; zoneId: string }

interface PlanningFiltersProps {
  zones: Zone[]
  /** Calcula la propuesta; la promesa termina cuando el cálculo acaba. */
  onPreview: (query: ProposalsQuery) => Promise<void>
}

export function PlanningFilters({ zones, onPreview }: PlanningFiltersProps) {
  const { values, fieldErrors, isSubmitting, handleChange, handleSubmit } = useForm<FiltersValues>({
    initialValues: { date: todayInGuayaquil(), zoneId: '' },
    validate: ({ date }) => (isBlank(date) ? { date: 'Elige el día a planificar' } : {}),
    onSubmit: ({ date, zoneId }) => onPreview({ date, ...(zoneId && { zoneId }) }),
  })

  return (
    <form className="filters" onSubmit={handleSubmit} noValidate aria-label="Datos de la propuesta">
      <TextField
        label="Día a planificar"
        name="date"
        type="date"
        value={values.date}
        onChange={handleChange}
        error={fieldErrors.date}
      />
      <SelectField label="Zona" name="zoneId" value={values.zoneId} onChange={handleChange}>
        <option value="">Todas las zonas</option>
        {zones.map((zone) => (
          <option key={zone.id} value={zone.id}>
            {`${zone.code} · ${zone.name}${zone.depotLocation ? '' : ' (sin depósito)'}`}
          </option>
        ))}
      </SelectField>
      <Button type="submit" isLoading={isSubmitting} loadingText="Calculando...">
        Previsualizar rutas
      </Button>
    </form>
  )
}
