import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { useForm } from '../../hooks/useForm'
import type { CreateZoneInput, Zone } from './types'
import { normalizeZone, validateZone } from './zoneValidation'
import { zonesService } from './zonesService'

const INITIAL_VALUES: CreateZoneInput = { name: '', code: '' }

interface ZoneFormProps {
  onCreated: (zone: Zone) => void
}

export function ZoneForm({ onCreated }: ZoneFormProps) {
  const { values, fieldErrors, submitError, isSubmitting, handleChange, handleSubmit } = useForm({
    initialValues: INITIAL_VALUES,
    validate: validateZone,
    errorMessage: 'No se pudo crear la zona',
    resetOnSuccess: true,
    onSubmit: async (input) => {
      const zone = await zonesService.create(normalizeZone(input))
      onCreated(zone)
    },
  })

  return (
    <form className="form" onSubmit={handleSubmit} noValidate aria-label="Nueva zona">
      {submitError && <Alert>{submitError}</Alert>}
      <TextField
        label="Nombre"
        name="name"
        placeholder="Ej. Ficoa"
        value={values.name}
        onChange={handleChange}
        error={fieldErrors.name}
      />
      <TextField
        label="Código"
        name="code"
        placeholder="Ej. FIC-02"
        value={values.code}
        onChange={handleChange}
        error={fieldErrors.code}
      />
      <Button type="submit" isLoading={isSubmitting} loadingText="Guardando...">
        Crear zona
      </Button>
    </form>
  )
}
