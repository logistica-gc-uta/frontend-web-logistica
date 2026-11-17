import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { useForm } from '../../hooks/useForm'
import { todayInGuayaquil } from '../../lib/time/guayaquil'
import { isBlank } from '../../lib/validation/validators'
import type { ProposalsQuery } from './types'

type FiltersValues = { date: string }

interface PlanningFiltersProps {
  /** Calcula la propuesta; la promesa termina cuando el cálculo acaba. */
  onPreview: (query: ProposalsQuery) => Promise<void>
}

export function PlanningFilters({ onPreview }: PlanningFiltersProps) {
  const { values, fieldErrors, isSubmitting, handleChange, handleSubmit } = useForm<FiltersValues>({
    initialValues: { date: todayInGuayaquil() },
    validate: ({ date }) => (isBlank(date) ? { date: 'Elige el día a planificar' } : {}),
    onSubmit: ({ date }) => onPreview({ date }),
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
      <Button type="submit" isLoading={isSubmitting} loadingText="Calculando...">
        Previsualizar rutas
      </Button>
    </form>
  )
}
